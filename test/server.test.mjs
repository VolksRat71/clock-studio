import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../lib/server.mjs';
import { scan } from '../lib/scan.mjs';

test('scan wrapper and GUI API work against a controlled cloc stub', async t => {
  if (process.platform === 'win32') { t.skip('Executable shebang stub is POSIX-only.'); return; }
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cloc-studio-test-'));
  const executable = path.join(temp, 'mock-cloc.mjs');
  await writeFile(executable, `#!/usr/bin/env node\nif(process.argv.includes('--version')){console.log('2.10-stub')}else{console.log(JSON.stringify({header:{cloc_version:'2.10',elapsed_seconds:0.1},'./app.ts':{language:'TypeScript',blank:1,comment:2,code:3},SUM:{blank:1,comment:2,code:3}}))}`);
  await chmod(executable, 0o755);
  const previous = process.env.CLOC_BIN;
  process.env.CLOC_BIN = executable;
  const server = await startServer({ port: 0, root: temp });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const report = await scan({ root: temp, title: 'Test project' });
    assert.equal(report.totals.code, 3);
    assert.equal(report.source, 'scan');
    assert.equal(report.rows[0].language, 'TypeScript');
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.ok((await home.text()).includes('cloc / studio'));
    const init = await (await fetch(`${base}/api/init`)).json();
    assert.equal(init.cloc.available, true);
    const denied = await fetch(`${base}/api/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 403);
    const originDenied = await fetch(`${base}/api/init`, { headers: { Origin: 'https://example.com' } });
    assert.equal(originDenied.status, 403);
    const scanResponse = await fetch(`${base}/api/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cloc-Token': init.token }, body: JSON.stringify({ root: temp }) });
    assert.equal(scanResponse.status, 200);
    assert.equal((await scanResponse.json()).totals.files, 1);
    const badImport = await fetch(`${base}/api/import`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cloc-Token': init.token }, body: JSON.stringify({ report: { Python: { nFiles: 1, blank: -1, comment: 0, code: 1 } } }) });
    assert.equal(badImport.status, 400);
  } finally {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (previous === undefined) delete process.env.CLOC_BIN; else process.env.CLOC_BIN = previous;
    await rm(temp, { recursive: true, force: true });
  }
});
