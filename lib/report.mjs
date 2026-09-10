import path from 'node:path';

export const SOURCE_LANGUAGES = 'TypeScript,JavaScript,CSS,HTML,Python,Bourne Shell';
export const BASE_DIRS = 'node_modules,.git,dist,build,coverage,.next';
export const PRESETS = {
  original: {
    label: 'Source - your last command',
    languages: SOURCE_LANGUAGES,
    excludeDirs: BASE_DIRS,
    excludeFiles: ''
  },
  clean: {
    label: 'Source - broader exclusions',
    languages: `${SOURCE_LANGUAGES},JSX,SCSS,Bourne Again Shell`,
    excludeDirs: `${BASE_DIRS},.turbo,.cache,.serverless,cdk.out,vendor,.venv,venv,__pycache__`,
    excludeFiles: 'package-lock.json,yarn.lock,pnpm-lock.yaml,bun.lock,bun.lockb,*.min.js,*.map'
  },
  all: {
    label: 'All recognized languages - broader exclusions',
    languages: '',
    excludeDirs: `${BASE_DIRS},.turbo,.cache,.serverless,cdk.out,vendor,.venv,venv,__pycache__`,
    excludeFiles: 'package-lock.json,yarn.lock,pnpm-lock.yaml,bun.lock,bun.lockb,*.min.js,*.map'
  }
};

function csv(value, field) {
  if (typeof value !== 'string' || value.length > 5000 || /[\x00-\x1f]/.test(value)) {
    throw new Error(`${field} must be a comma-separated string without control characters (maximum 5,000 characters).`);
  }
  return [...new Set(value.split(',').map(s => s.trim()).filter(Boolean))];
}

export function cleanOptions(input = {}) {
  const preset = input.preset ?? 'original';
  if (!Object.hasOwn(PRESETS, preset)) throw new Error(`Unknown preset: ${preset}`);
  const defaults = PRESETS[preset];
  const languages = csv(input.languages ?? defaults.languages, 'Languages');
  const excludeDirs = csv(input.excludeDirs ?? defaults.excludeDirs, 'Excluded directories');
  const excludeFiles = csv(input.excludeFiles ?? defaults.excludeFiles, 'Excluded filenames');
  for (const value of [...excludeDirs, ...excludeFiles]) {
    if (/[\\/]/.test(value)) throw new Error('Directory and filename exclusions accept basenames, not paths.');
  }
  return { preset, languages, excludeDirs, excludeFiles };
}

export function globRegex(globs) {
  if (!globs.length) return '';
  const escaped = globs.map(glob => [...glob].map(ch => {
    if (ch === '*') return '.*';
    if (ch === '?') return '.';
    return /[\\^$.*+?()[\]{}|]/.test(ch) ? `\\${ch}` : ch;
  }).join(''));
  return `^(?:${escaped.join('|')})$`;
}

function count(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${field} count in report.`);
  return value;
}
function counts(value, files = value.nFiles ?? value.files) {
  return {
    files: count(files, 'files'),
    blank: count(value.blank, 'blank'),
    comment: count(value.comment, 'comment'),
    code: count(value.code, 'code')
  };
}
export function sumRows(rows) {
  return rows.reduce((sum, row) => {
    for (const key of ['files', 'blank', 'comment', 'code']) sum[key] += row[key];
    return sum;
  }, { files: 0, blank: 0, comment: 0, code: 0 });
}

export function normalizeCloc(raw, meta = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected a cloc JSON object.');
  const groups = new Map();
  const files = [];
  let mode = null;
  for (const [name, value] of Object.entries(raw)) {
    if (name === 'header' || name === 'SUM') continue;
    if (!value || typeof value !== 'object') throw new Error(`Unrecognized report entry: ${name}`);
    const byFile = typeof value.language === 'string';
    const entryMode = byFile ? 'file' : 'language';
    if (mode && mode !== entryMode) throw new Error('Mixed file/language JSON is not supported. Use --json or --json --by-file.');
    mode = entryMode;
    const c = counts(value, byFile ? 1 : value.nFiles);
    const language = byFile ? value.language : name;
    const group = groups.get(language) ?? { language, files: 0, blank: 0, comment: 0, code: 0 };
    for (const key of ['files', 'blank', 'comment', 'code']) group[key] += c[key];
    groups.set(language, group);
    if (byFile) files.push({ path: name, language, ...c });
  }
  const rows = [...groups.values()].sort((a, b) => b.code - a.code || a.language.localeCompare(b.language));
  const totals = sumRows(rows);
  if (raw.SUM) {
    for (const key of ['blank', 'comment', 'code']) {
      if (count(raw.SUM[key], key) !== totals[key]) throw new Error(`cloc SUM.${key} does not match the report entries.`);
    }
    if (raw.SUM.nFiles !== undefined && count(raw.SUM.nFiles, 'files') !== totals.files) {
      throw new Error('cloc SUM.nFiles does not match the report entries.');
    }
  }
  const elapsedValue = raw.header?.elapsed_seconds;
  const elapsed = elapsedValue === null || elapsedValue === undefined ? NaN : Number(elapsedValue);
  return {
    schema: 'cloc-studio/v1',
    title: typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim().slice(0, 120) : 'Codebase',
    rootLabel: meta.rootLabel ?? (meta.root ? path.basename(meta.root) : 'Imported cloc report'),
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
    source: meta.source ?? 'import',
    clocVersion: String(raw.header?.cloc_version ?? 'unknown'),
    elapsedSeconds: Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null,
    options: meta.options ?? null,
    command: meta.command ?? '',
    warnings: Array.isArray(meta.warnings) ? meta.warnings : [],
    rows, totals,
    files: files.sort((a, b) => b.code - a.code || a.path.localeCompare(b.path))
  };
}

export function loadReport(value) {
  if (value?.schema !== 'cloc-studio/v1') return normalizeCloc(value);
  // Revalidate exported reports instead of trusting their stored totals.
  if (!Array.isArray(value.rows)) throw new Error('Report rows are missing.');
  const raw = { header: { cloc_version: value.clocVersion, elapsed_seconds: value.elapsedSeconds } };
  for (const row of value.rows) {
    if (typeof row.language !== 'string' || ['header', 'SUM', '__proto__'].includes(row.language) || Object.hasOwn(raw, row.language)) {
      throw new Error('Invalid or duplicate language name.');
    }
    raw[row.language] = { nFiles: row.files, blank: row.blank, comment: row.comment, code: row.code };
  }
  if (value.totals) raw.SUM = { nFiles: value.totals.files, ...value.totals };
  let options = null;
  if (value.options !== null && value.options !== undefined) {
    for (const key of ['languages', 'excludeDirs', 'excludeFiles']) {
      if (!Array.isArray(value.options[key]) || value.options[key].some(item => typeof item !== 'string')) {
        throw new Error(`Invalid options.${key}: expected an array of strings.`);
      }
    }
    options = cleanOptions({
      preset: value.options.preset ?? 'original',
      languages: value.options.languages.join(','),
      excludeDirs: value.options.excludeDirs.join(','),
      excludeFiles: value.options.excludeFiles.join(',')
    });
  }
  const report = normalizeCloc(raw, { ...value, options });
  report.files = Array.isArray(value.files) ? value.files.map(file => {
    if (typeof file.path !== 'string' || typeof file.language !== 'string') throw new Error('Invalid file entry.');
    return { path: file.path, language: file.language, ...counts(file, 1) };
  }).sort((a, b) => b.code - a.code) : [];
  if (report.files.length) {
    const totals = sumRows(report.files);
    for (const key of ['files', 'blank', 'comment', 'code']) {
      if (totals[key] !== report.totals[key]) throw new Error(`File details do not match ${key} totals.`);
    }
  }
  return report;
}
