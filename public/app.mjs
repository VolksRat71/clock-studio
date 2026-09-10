import { renderSvg } from '/render.mjs';
const $ = id => document.getElementById(id);
let token = '', presets = {}, report = null, previewUrl = '', currentSvg = '';
const message = (value, error = false) => { $('message').textContent = value; $('message').className = error ? 'error' : ''; };
async function api(url, body) {
  const response = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cloc-Token': token }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function applyPreset(name) {
  const preset = presets[name];
  $('languages').value = preset.languages;
  $('exclude-dirs').value = preset.excludeDirs;
  $('exclude-files').value = preset.excludeFiles;
}
function draw() {
  if (!report) return;
  currentSvg = renderSvg(report);
  const old = previewUrl;
  previewUrl = URL.createObjectURL(new Blob([currentSvg], { type: 'image/svg+xml' }));
  $('preview').src = previewUrl;
  if (old) URL.revokeObjectURL(old);
  $('command-text').textContent = report.command || 'No executable scan command was recorded for this imported/example snapshot.';
  $('warnings').textContent = (report.warnings || []).join('\n') || 'No captured warnings. Review scope and file details before interpreting these totals.';
}
function showReport(value) {
  report = value;
  $('title').value = report.title;
  $('file-language').replaceChildren(new Option('All languages', ''), ...report.rows.map(row => new Option(row.language, row.language)));
  $('file-search').value = '';
  draw(); showFiles();
}
function showFiles() {
  const files = report?.files || [], lang = $('file-language').value, term = $('file-search').value.toLowerCase();
  const matches = files.filter(file => (!lang || file.language === lang) && file.path.toLowerCase().includes(term));
  $('file-note').textContent = files.length ? `Showing ${Math.min(100, matches.length)} of ${matches.length} matching counted files, largest first.` : 'This imported/example summary has no file-level data. Run a local scan or import cloc --json --by-file output to inspect it.';
  const fragment = document.createDocumentFragment();
  for (const file of matches.slice(0, 100)) {
    const tr = document.createElement('tr');
    for (const value of [file.path, file.language, file.code.toLocaleString('en-US'), file.comment.toLocaleString('en-US'), file.blank.toLocaleString('en-US')]) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    fragment.append(tr);
  }
  $('file-rows').replaceChildren(fragment);
}
const filename = () => (report?.title || 'cloc-report').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'cloc-report';
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
$('preview').addEventListener('load', () => { $('dimensions').textContent = `${$('preview').naturalWidth} x ${$('preview').naturalHeight} / vector master`; });
$('title').addEventListener('input', () => { if (report) { report.title = $('title').value.trim() || 'Codebase'; draw(); } });
$('preset').addEventListener('change', () => { applyPreset($('preset').value); message('Preset changed. Scan the directory to apply these filters; the current report is unchanged.'); });
for (const id of ['root', 'languages', 'exclude-dirs', 'exclude-files']) $(id).addEventListener('input', () => message('Configuration changed. Scan again to update the report.'));
$('file-language').addEventListener('change', showFiles);
$('file-search').addEventListener('input', showFiles);
$('scan-form').addEventListener('submit', async event => {
  event.preventDefault(); $('scan-button').disabled = true; $('scan-button').textContent = 'Scanning with cloc...';
  message('Counting local files. Large repositories may take a while (120-second limit).');
  try {
    const value = await api('/api/scan', { root: $('root').value, title: $('title').value, preset: $('preset').value,
      languages: $('languages').value, excludeDirs: $('exclude-dirs').value, excludeFiles: $('exclude-files').value });
    showReport(value);
    message(`${report.totals.code.toLocaleString('en-US')} code lines across ${report.totals.files.toLocaleString('en-US')} counted files. ${report.warnings.length ? 'Warnings were captured; review diagnostics below.' : 'Scan complete. Review the largest files below.'}`);
  } catch (error) { message(error.message, true); }
  finally { $('scan-button').disabled = false; $('scan-button').textContent = 'Scan directory'; }
});
async function demo() {
  showReport(await api('/api/demo'));
  message('Example snapshot from your supplied table, not a live scan. Enter a project path and scan to use your current files.');
}
$('demo').addEventListener('click', () => demo().catch(error => message(error.message, true)));
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async () => {
  const file = $('import-file').files[0]; if (!file) return;
  try {
    if (file.size > 15 * 1024 * 1024) throw new Error('Choose a JSON file smaller than 15 MB.');
    showReport(await api('/api/import', { report: JSON.parse(await file.text()) }));
    message('JSON imported. Filters not recorded in raw cloc JSON remain explicitly marked as unknown.');
  } catch (error) { message(error.message, true); }
  finally { $('import-file').value = ''; }
});
$('svg-export').addEventListener('click', () => { if (report) download(new Blob([currentSvg], { type: 'image/svg+xml' }), `${filename()}.svg`); });
$('json-export').addEventListener('click', () => { if (report) download(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `${filename()}.json`); });
$('png-export').addEventListener('click', async () => {
  if (!report) return;
  $('png-export').disabled = true;
  let url;
  try {
    const scale = Number($('scale').value), img = new Image();
    url = URL.createObjectURL(new Blob([currentSvg], { type: 'image/svg+xml' }));
    const ready = new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Could not load the report SVG for export.')); });
    img.src = url; await ready;
    const width = img.naturalWidth * scale, height = img.naturalHeight * scale;
    if (width * height > 64_000_000 || height > 32000) throw new Error('This report is too tall for PNG at this scale. Choose 1x or export SVG.');
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas is unavailable in this browser.');
    context.drawImage(img, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG export failed. Try 1x or export SVG.');
    download(blob, `${filename()}@${scale}x.png`);
    message(`PNG exported at ${width} x ${height}. SVG remains available as a resolution-independent export.`);
  } catch (error) { message(error.message, true); }
  finally { if (url) URL.revokeObjectURL(url); $('png-export').disabled = false; }
});
try {
  const init = await api('/api/init'); token = init.token; presets = init.presets;
  for (const [key, preset] of Object.entries(presets)) $('preset').add(new Option(preset.label, key));
  applyPreset('original'); $('root').value = init.root;
  $('cloc-status').textContent = init.cloc.available ? `cloc ${init.cloc.version} / ready` : 'cloc not installed';
  $('cloc-status').title = init.cloc.message || 'Local executable available';
  await demo();
  if (init.title) { $('title').value = init.title; report.title = init.title; draw(); }
  if (!init.cloc.available) message(`${init.cloc.message} The example and JSON import/export still work.`, true);
} catch (error) { message(error.message, true); }
