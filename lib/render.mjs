const fmt = value => Number(value).toLocaleString('en-US');
export function xml(value) {
  return String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);
}
function clip(value, max) { const s = String(value); return s.length > max ? `${s.slice(0, max - 3)}...` : s; }
function wrap(value, max = 130) {
  const words = String(value).split(/\s+/);
  const lines = []; let line = '';
  for (let word of words) {
    while (word.length > max) {
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, max)); word = word.slice(max);
    }
    if ((line + ' ' + word).trim().length > max) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
const COLORS = { TypeScript: '#57a6eb', JavaScript: '#ffd35c', 'Bourne Shell': '#b384ee', CSS: '#f181be', HTML: '#56d7d1', Python: '#77d584', JSON: '#e9ad74', JSX: '#7cd2f1', SCSS: '#db91c4' };
export function renderSvg(report) {
  const { rows, totals } = report;
  const width = 1536, x = 44, inner = 1448, tableY = 226, rowH = 65, headerH = 58;
  const dataCount = Math.max(rows.length, 1);
  const totalY = tableY + headerH + dataCount * rowH;
  const tableH = headerH + dataCount * rowH + 70;
  const cardY = tableY + tableH + 24;
  const scope = report.options ? [
    `Included languages: ${report.options.languages.length ? report.options.languages.join(', ') : 'All languages recognized by cloc'}`,
    `Excluded directories: ${report.options.excludeDirs.join(', ') || 'None explicitly specified'}`,
    ...(report.options.excludeFiles.length ? [`Excluded filenames: ${report.options.excludeFiles.join(', ')}`] : [])
  ] : ['Scan filters: Not recorded in this imported report.'];
  const scopeLines = scope.flatMap(line => wrap(line, 131));
  const scopeY = cardY + 138, scopeH = 36 + scopeLines.length * 25;
  const height = scopeY + scopeH + 67;
  const titleSize = report.title.length > 43 ? 32 : report.title.length > 30 ? 40 : 50;
  const date = new Date(report.generatedAt);
  const dateText = Number.isNaN(date.valueOf()) ? 'Date unavailable' : date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: '2-digit', year: 'numeric' });
  const codePct = totals.code + totals.blank + totals.comment ? (100 * totals.code / (totals.code + totals.blank + totals.comment)).toFixed(1) : '0.0';
  const texts = [];
  const text = (tx, ty, value, attrs = '') => `<text x="${tx}" y="${ty}" ${attrs}>${xml(value)}</text>`;
  const rect = (rx, ry, w, h, fill = 'url(#panel)', radius = 16, more = '') => `<rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" ${more}/>`;
  texts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${xml(report.title)} - Codebase Summary</title><desc id="desc">${xml(`${fmt(totals.code)} code lines across ${fmt(totals.files)} counted files. Counts from cloc; exclusions are listed in the report.`)}</desc>
<defs>
<linearGradient id="bg" x2="1" y2="1"><stop stop-color="#111c27"/><stop offset="1" stop-color="#0b131c"/></linearGradient>
<linearGradient id="panel" x2="1" y2="1"><stop stop-color="#182634"/><stop offset="1" stop-color="#121f2c"/></linearGradient>
<linearGradient id="total" x2="1"><stop stop-color="#1c344d"/><stop offset="1" stop-color="#162a3f"/></linearGradient>
<clipPath id="tableClip"><rect x="${x}" y="${tableY}" width="${inner}" height="${tableH}" rx="16"/></clipPath>
</defs>
<style>text{font-family:Arial,Helvetica,sans-serif;fill:#f4f7fb;font-size:25px}.muted{fill:#aabbd0}.small{font-size:18px}.mono{font-family:Menlo,Consolas,'DejaVu Sans Mono',monospace}.num{font-family:Menlo,Consolas,'DejaVu Sans Mono',monospace;font-size:25px}.label{fill:#afbed0;font-size:18px;font-weight:700;letter-spacing:1.2px}</style>`);
  texts.push(rect(1, 1, width - 2, height - 2, 'url(#bg)', 23, 'stroke="#34485c" stroke-width="2"'));
  texts.push(text(49, 77, clip(report.title, 63), `font-size="${titleSize}" style="font-size:${titleSize}px;font-weight:700"`));
  texts.push(text(49, 120, 'Codebase Summary', 'class="muted" style="font-size:32px"'));
  texts.push(rect(1040, 30, 451, 106, 'url(#panel)', 14, 'stroke="#2b4053"'));
  texts.push(text(1061, 62, `Generated  ${dateText} (UTC)`, 'class="muted small"'));
  texts.push(text(1061, 90, `cloc v${report.clocVersion}  |  ${report.elapsedSeconds === null ? 'Timing unavailable' : `${report.elapsedSeconds.toFixed(2)} s`}`, 'class="muted small mono"'));
  texts.push(text(1061, 116, report.source === 'example' ? 'EXAMPLE SNAPSHOT - NOT A LIVE SCAN' : report.source === 'scan' ? 'LOCAL SCAN  /  NO CODE UPLOADS' : 'IMPORTED REPORT', 'class="small" style="font-size:14px;fill:#71b8f6;letter-spacing:1px"'));
  texts.push(rect(x, 156, inner, 48, 'url(#panel)', 11, 'stroke="#2a3d50"'));
  texts.push(text(63, 186, `>  ${clip(report.rootLabel || 'Codebase', 90)}  /  language breakdown`, 'class="muted small mono"'));
  texts.push(`<g clip-path="url(#tableClip)">${rect(x, tableY, inner, tableH, '#101b26', 0)}${rect(x, tableY, inner, headerH, '#203040', 0)}`);
  const columns = [76, 549, 848, 1151, 1453];
  ['LANGUAGE', 'FILES', 'BLANK', 'COMMENT', 'CODE'].forEach((name, i) => texts.push(text(columns[i], tableY + 37, name, `class="label" ${i ? 'text-anchor="end"' : ''}`)));
  rows.forEach((row, i) => {
    const y = tableY + headerH + i * rowH;
    if (i % 2) texts.push(rect(x, y, inner, rowH, '#13202c', 0));
    texts.push(`<line x1="${x}" y1="${y}" x2="${x + inner}" y2="${y}" stroke="#2b3e50"/>`);
    texts.push(`<circle cx="85" cy="${y + 33}" r="10" fill="${COLORS[row.language] || '#8caac5'}"/>`);
    texts.push(text(115, y + 42, clip(row.language, 24), `style="font-size:${row.language.length > 20 ? 21 : 25}px"`));
    ['files', 'blank', 'comment', 'code'].forEach((key, j) => texts.push(text(columns[j + 1], y + 42, fmt(row[key]), `class="num" text-anchor="end" ${key === 'code' ? 'font-weight="700"' : ''}`)));
  });
  if (!rows.length) texts.push(text(77, tableY + headerH + 41, 'No counted files match this selection.', 'class="muted"'));
  texts.push(rect(x, totalY, inner, 70, 'url(#total)', 0));
  texts.push(text(76, totalY + 45, 'SUM:', 'font-weight="700"'));
  ['files', 'blank', 'comment', 'code'].forEach((key, j) => texts.push(text(columns[j + 1], totalY + 45, fmt(totals[key]), 'class="num" text-anchor="end" font-weight="700"')));
  [400, 640, 938, 1235].forEach(tx => texts.push(`<line x1="${tx}" y1="${tableY}" x2="${tx}" y2="${tableY + tableH}" stroke="#2b3e50"/>`));
  texts.push('</g>', rect(x, tableY, inner, tableH, 'none', 16, 'stroke="#31485f"'));
  const cards = [
    [totals.files, 'Counted files', 'After cloc filters'],
    [totals.code, 'Lines of code', 'Excludes comments / blanks'],
    [totals.comment, 'Comment lines', 'As classified by cloc'],
    [totals.code + totals.blank + totals.comment, 'Total physical lines', `${codePct}% classified as code`]
  ];
  cards.forEach(([value, label, caption], i) => {
    const cx = x + i * 368;
    texts.push(rect(cx, cardY, 344, 114, 'url(#panel)', 15, 'stroke="#2b4053"'));
    texts.push(rect(cx + 22, cardY + 25, 4, 64, ['#57a6eb', '#77d584', '#b384ee', '#56d7d1'][i], 2));
    texts.push(text(cx + 44, cardY + 43, fmt(value), 'style="font-size:32px;font-weight:700"'));
    texts.push(text(cx + 44, cardY + 72, label, 'class="muted" style="font-size:20px"'));
    texts.push(text(cx + 44, cardY + 95, caption, 'class="muted" style="font-size:14px"'));
  });
  texts.push(rect(x, scopeY, inner, scopeH, 'url(#panel)', 14, 'stroke="#2b4053"'));
  scopeLines.forEach((line, i) => texts.push(text(64, scopeY + 30 + i * 25, line, 'class="muted mono" style="font-size:16px"')));
  texts.push(text(47, height - 29, 'Counts describe selected files, not a guarantee of authored-only code. Tests are included unless filtered.', 'class="muted" style="font-size:14px"'));
  texts.push(text(1489, height - 29, 'CLOC / STUDIO', 'text-anchor="end" style="font-size:13px;fill:#6989a5;letter-spacing:2px"'));
  texts.push('</svg>');
  return texts.join('\n');
}
