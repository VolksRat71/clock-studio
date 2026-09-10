#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { scan } from './lib/scan.mjs';
import { loadReport } from './lib/report.mjs';
import { renderSvg } from './lib/render.mjs';
import { startServer } from './lib/server.mjs';

const help = `cloc / studio - local source reports

  node cli.mjs ui [directory] [--port 4317] [--title "My project"]
  node cli.mjs render <directory> --out report.svg
  node cli.mjs render --from cloc.json --out report.svg
  node cli.mjs render <directory> --out report.json --preset clean

Options:
  --root <directory>       Alternative to a positional directory
  --preset original|clean|all   Default: original (matches the screenshot command)
  --languages <CSV>        cloc language names; empty string includes all
  --exclude-dirs <CSV>     Directory basenames (no paths)
  --exclude-files <CSV>    Basenames; * and ? wildcard support
  --title <text>           Report heading
  --from <json>            Import cloc summary/by-file JSON or a saved report
  --out <svg|json>         Output file; SVG is the default format
  --port <number>          Local UI port; default 4317; 0 chooses a free port

PNG export (1x/2x/3x) is available in the browser GUI.
CLOC_BIN may point to a custom cloc executable. Scans time out after 120 seconds.
`;

try {
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' }, root: { type: 'string' }, title: { type: 'string' },
      preset: { type: 'string' }, languages: { type: 'string' },
      'exclude-dirs': { type: 'string' }, 'exclude-files': { type: 'string' },
      from: { type: 'string' }, out: { type: 'string' }, port: { type: 'string' }
    }
  });
  if (v.help) { console.log(help); process.exit(0); }
  const [command = 'ui', directory] = positionals;
  if (positionals.length > 2) throw new Error('Too many positional arguments. Use --help.');
  if (command === 'ui') {
    const server = await startServer({ port: Number(v.port ?? 4317), root: v.root ?? directory ?? '', title: v.title ?? '' });
    console.log(`\ncloc / studio\nOpen http://127.0.0.1:${server.address().port}\nLocal-only. Press Ctrl+C to stop.\n`);
  } else if (command === 'render') {
    if (v.from && (directory || v.root)) throw new Error('Choose either --from or a scan directory, not both.');
    const report = v.from
      ? loadReport(JSON.parse(await readFile(v.from, 'utf8')))
      : await scan({ root: v.root ?? directory ?? '.', title: v.title, preset: v.preset,
        languages: v.languages, excludeDirs: v['exclude-dirs'], excludeFiles: v['exclude-files'] });
    if (v.title) report.title = v.title.slice(0, 120);
    const output = path.resolve(v.out ?? 'cloc-report.svg');
    const ext = path.extname(output).toLowerCase();
    if (!['.svg', '.json'].includes(ext)) throw new Error('CLI output must end in .svg or .json. Use the GUI for PNG.');
    await writeFile(output, ext === '.svg' ? renderSvg(report) : JSON.stringify(report, null, 2) + '\n');
    console.table(report.rows.map(({ language, files, blank, comment, code }) => ({ language, files, blank, comment, code })));
    console.log(`${report.totals.code.toLocaleString('en-US')} code lines / ${report.totals.files} counted files\nSaved ${output}`);
    for (const warning of report.warnings) console.warn(warning);
  } else throw new Error(`Unknown command: ${command}. Use --help.`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
