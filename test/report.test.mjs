import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeCloc, loadReport, cleanOptions, globRegex, sumRows } from '../lib/report.mjs';
import { renderSvg, xml } from '../lib/render.mjs';
import { makeArgs, shellQuote } from '../lib/scan.mjs';

const raw = {
  header: { cloc_version: '2.10', elapsed_seconds: 0.5 },
  './a.ts': { language: 'TypeScript', blank: 1, comment: 2, code: 3 },
  './b.ts': { language: 'TypeScript', blank: 2, comment: 3, code: 7 },
  './app.js': { language: 'JavaScript', blank: 0, comment: 1, code: 2 },
  SUM: { blank: 3, comment: 6, code: 12 }
};
test('file JSON aggregates into sorted languages and counted totals', () => {
  const result = normalizeCloc(raw);
  assert.deepEqual(result.totals, { files: 3, blank: 3, comment: 6, code: 12 });
  assert.deepEqual(result.rows[0], { language: 'TypeScript', files: 2, blank: 3, comment: 5, code: 10 });
  assert.equal(result.files[0].path, './b.ts');
});
test('summary JSON works without file details', () => {
  const result = normalizeCloc({ Python: { nFiles: 2, blank: 3, comment: 4, code: 5 } });
  assert.equal(result.files.length, 0);
  assert.equal(result.totals.files, 2);
  assert.equal(result.options, null);
});
test('empty output is a zero report', () => assert.deepEqual(normalizeCloc({}).totals, { files: 0, blank: 0, comment: 0, code: 0 }));
test('inconsistent sum is rejected', () => assert.throws(() => normalizeCloc({ ...raw, SUM: { ...raw.SUM, code: 999 } }), /does not match/));
test('negative and noninteger counts are rejected', () => {
  for (const code of [-1, 1.5, '5', null]) assert.throws(() => normalizeCloc({ JavaScript: { nFiles: 1, blank: 0, comment: 0, code } }), /Invalid/);
});
test('source preset matches the user command filters', () => {
  const options = cleanOptions();
  assert.equal(options.languages.join(','), 'TypeScript,JavaScript,CSS,HTML,Python,Bourne Shell');
  assert.equal(options.excludeDirs.join(','), 'node_modules,.git,dist,build,coverage,.next');
  assert.deepEqual(options.excludeFiles, []);
});
test('exclusions are validated and deduplicated', () => {
  assert.deepEqual(cleanOptions({ excludeDirs: 'dist,dist, build' }).excludeDirs, ['dist', 'build']);
  assert.throws(() => cleanOptions({ excludeDirs: 'packages/dist' }), /basenames/);
  assert.throws(() => cleanOptions({ languages: 'JavaScript\n--help' }), /control/);
  assert.throws(() => cleanOptions({ preset: '__proto__' }), /Unknown preset/);
});
test('wildcards escape regex metacharacters', () => {
  const pattern = new RegExp(globRegex(['package-lock.json', '*.min.js', 'file[1]?.ts']));
  for (const name of ['package-lock.json', 'app.min.js', 'file[1]a.ts']) assert.equal(pattern.test(name), true);
  for (const name of ['package-lockXjson', 'app.js', 'file1a.ts']) assert.equal(pattern.test(name), false);
});
test('args are separate and retain multiword languages', () => {
  const args = makeArgs(cleanOptions());
  assert.ok(args.includes('--include-lang=TypeScript,JavaScript,CSS,HTML,Python,Bourne Shell'));
  assert.equal(args.at(-1), '.');
  assert.ok(args.includes('--by-file'));
});
test('display-only shell quoting handles apostrophes', () => assert.equal(shellQuote("a'b"), "'a'\\''b'"));
test('SVG escaping prevents injected markup', () => {
  assert.equal(xml('<&"'), '&lt;&amp;&quot;');
  const svg = renderSvg(normalizeCloc(raw, { title: '</text><script>alert(1)</script>' }));
  assert.equal(svg.includes('<script>'), false);
  assert.ok(svg.includes('&lt;script&gt;'));
});
test('exported report round-trips without changing totals', () => {
  const report = normalizeCloc(raw);
  const restored = loadReport(JSON.parse(JSON.stringify(report)));
  assert.deepEqual(restored.rows, report.rows);
  assert.deepEqual(restored.totals, report.totals);
  assert.equal(restored.files.length, 3);
});
test('SVG grows vertically with more languages', () => {
  const one = renderSvg(normalizeCloc({ JavaScript: { nFiles: 1, blank: 0, comment: 0, code: 1 } }));
  const many = renderSvg(normalizeCloc(Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`Language${i}`, { nFiles: 1, blank: 0, comment: 0, code: 1 }]))));
  const height = svg => Number(svg.match(/height="(\d+)"/)[1]);
  assert.ok(height(many) > height(one));
});
test('sample screenshot totals are exact', async () => {
  const report = loadReport(JSON.parse(await readFile(new URL('../examples/kerv-studio.json', import.meta.url), 'utf8')));
  assert.deepEqual(report.totals, { files: 545, blank: 8815, comment: 20203, code: 64080 });
  assert.equal(report.source, 'example');
  assert.deepEqual(sumRows(report.rows), report.totals);
});
test('missing scan timing remains unknown after report round-trip', () => {
  const report = normalizeCloc({ Python: { nFiles: 1, blank: 0, comment: 0, code: 1 } });
  assert.equal(report.elapsedSeconds, null);
  assert.equal(loadReport(report).elapsedSeconds, null);
});
test('malformed imported filter metadata is rejected', () => {
  const report = normalizeCloc(raw);
  report.options = { languages: 'JavaScript', excludeDirs: [], excludeFiles: [] };
  assert.throws(() => loadReport(report), /expected an array/);
});
