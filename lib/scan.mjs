import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanOptions, globRegex, normalizeCloc } from './report.mjs';
const exec = promisify(execFile);
const configFile = fileURLToPath(new URL('../config/empty-cloc.conf', import.meta.url));
const executable = () => process.env.CLOC_BIN || 'cloc';

export function expandHome(value) {
  return value === '~' ? homedir() : value.startsWith('~/') ? path.join(homedir(), value.slice(2)) : value;
}
export function shellQuote(value) {
  return /^[a-zA-Z0-9_./:=,-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}
export function makeArgs(options) {
  const args = ['--json', '--quiet', '--by-file', `--config=${configFile}`];
  if (options.languages.length) args.push(`--include-lang=${options.languages.join(',')}`);
  if (options.excludeDirs.length) args.push(`--exclude-dir=${options.excludeDirs.join(',')}`);
  const pattern = globRegex(options.excludeFiles);
  if (pattern) args.push(`--not-match-f=${pattern}`);
  args.push('.');
  return args;
}
export async function clocStatus() {
  try {
    const { stdout } = await exec(executable(), ['--version'], { timeout: 5000, maxBuffer: 1024 * 1024 });
    return { available: true, version: stdout.trim() };
  } catch {
    return { available: false, message: 'cloc was not found or could not run. Install with brew install cloc, or set CLOC_BIN to its executable path.' };
  }
}
export async function scan(input = {}) {
  if (typeof input.root !== 'string' || !input.root.trim() || /[\x00-\x1f]/.test(input.root)) {
    throw new Error('Enter a valid local directory path.');
  }
  const root = await realpath(path.resolve(expandHome(input.root.trim())));
  if (!(await stat(root)).isDirectory()) throw new Error('The selected path is not a directory.');
  const options = cleanOptions(input);
  const args = makeArgs(options);
  let stdout, stderr;
  try {
    ({ stdout, stderr } = await exec(executable(), args, {
      cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
      windowsHide: true, shell: false
    }));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('cloc was not found. Run brew install cloc, then restart this app.');
    if (error.killed) throw new Error('The scan exceeded the 120-second limit. Scan a smaller directory or add exclusions.');
    throw new Error(`cloc failed: ${String(error.stderr || error.message).slice(0, 3000)}`);
  }
  let raw;
  try { raw = JSON.parse(stdout.trim() || '{}'); }
  catch { throw new Error(`cloc did not return valid JSON. ${stderr || stdout.slice(0, 500)}`); }
  const warnings = stderr.trim() ? [stderr.trim().slice(0, 6000)] : [];
  if (!Object.keys(raw).length) warnings.push('cloc returned no counted files for this selection.');
  return normalizeCloc(raw, {
    title: input.title || path.basename(root), rootLabel: path.basename(root), source: 'scan', options,
    command: `cd ${shellQuote(root)} && ${[executable(), ...args].map(shellQuote).join(' ')}`,
    warnings
  });
}
