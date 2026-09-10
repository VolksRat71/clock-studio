# cloc / studio

A small, local-only browser GUI and CLI that turns cloc results into polished,
shareable reports. The navy table, numeric columns, language dots, totals, cards,
and scope footer are a programmatic SVG template, not an AI-generated image.

## Start on your Mac

Requirements: Node.js 20 or newer and an existing `cloc` executable on PATH.
The app has **no runtime npm dependencies**, so no `npm install` is needed.

```sh
# Only needed if cloc is not installed already:
brew install cloc

cd /path/to/cloc-studio
npm start -- --root "$HOME/Desktop/projects/kerv-studio" --title "KERV Studio"
```

Open the local address printed in the terminal, normally:

```text
http://127.0.0.1:4317
```

Click **Scan directory**. The initial KERV Studio preview is explicitly labeled
as an example snapshot transcribed from the supplied screenshot, not a live scan.
Press Ctrl+C in the terminal to stop the app. The GUI is a local web page, not a
native desktop app; enter/paste the directory path rather than using a native
folder picker.

## What works

- Scan a local directory with cloc and see a live SVG report preview.
- Change the report title without recounting files.
- Edit included languages, excluded directory basenames, and excluded filename
  patterns. Changes to these filters require a new scan.
- Export PNG at 1x, 2x, or 3x; export SVG; export or import a JSON snapshot.
- Inspect up to the 100 largest matching counted files, sorted by code lines.
  Filter those results by language or path text.
- Render SVG or JSON directly from the CLI without opening the GUI.
- Import standard `cloc --json` or `cloc --json --by-file` output.
- Use the demo and import/export features even without cloc installed.

The PNG export draws the same SVG into a browser canvas and saves a PNG. It does
not use a screenshot service or a remote API. An unusually tall report may need
1x PNG or SVG instead because of browser canvas limits. SVG text uses available
system fonts, so exact typography can vary between machines; the layout geometry
and counts are generated deterministically. No font files or CDN fonts are bundled.

## Presets and counting semantics

**Source - your last command** is the default. Its language and directory filters
match the final command shown in the conversation:

```text
Included: TypeScript,JavaScript,CSS,HTML,Python,Bourne Shell
Excluded directories: node_modules,.git,dist,build,coverage,.next
Excluded filenames: none explicitly specified
```

**Source - broader exclusions** additionally includes JSX, SCSS, and Bourne Again
Shell, and excludes other common output/cache directories, lockfiles, source maps,
and minified JavaScript. Its counts may therefore differ from the default.

**All recognized languages - broader exclusions** includes JSON, Markdown, YAML,
and other languages recognized by your installed cloc, retaining broader exclusions.

The tool invokes cloc once with `--json --quiet --by-file`, then aggregates its
file-level results by language. It validates those totals against cloc's SUM
when present. A blank shipped cloc config prevents a personal cloc config from
silently adding switches; the exact executed command is available in the UI.
This can differ from your shell command if you normally rely on personal cloc
configuration. Other cloc defaults, including duplicate-file handling and
file-size/language-recognition rules, remain in effect.

Directory exclusions are **basenames at any depth**, not full paths. Filename
exclusions are comma-separated basenames with `*` and `?` wildcards; they are
escaped and translated to cloc's filename regular expression. Path exclusions
and arbitrary regex switches are not exposed in this prototype.

Tests are included unless you explicitly exclude them. Filtering directories
and languages does not prove the remaining code is all handwritten, application
code, or actively maintained. Use the largest-files view to investigate generated
or vendored files in unexpected locations. The report calls the metric "counted
files" for this reason.

The cards deliberately show only reliable report metrics: counted files, code
lines, comment lines, and total physical lines (code + comments + blanks). They
do not guess the separate console counters for discovered text files, unique
files, or ignored files. Raw cloc JSON does not record your complete filter
configuration, so filters on a raw import are labeled unknown.

## CLI

```sh
# Scan and render a vector report:
node cli.mjs render "$HOME/Desktop/projects/kerv-studio" \
  --title "KERV Studio" --out kerv-studio.svg

# Scan with broader exclusions:
node cli.mjs render ./my-project --preset clean --out report.svg

# All recognized languages, while excluding lockfiles and build output:
node cli.mjs render ./my-project --preset all --out report.json

# Custom filters; language names are cloc names, not extensions:
node cli.mjs render ./my-project \
  --languages "TypeScript,JavaScript,JSX,CSS" \
  --exclude-dirs "node_modules,.git,dist,build,coverage,cdk.out" \
  --exclude-files "*.min.js,*.map" --out report.svg

# Re-render an existing report without rescanning:
node cli.mjs render --from report.json --title "Release snapshot" --out report.svg

# Render the supplied example:
npm run demo

# A different local UI port:
npm start -- --port 4318

# Custom cloc executable:
CLOC_BIN=/opt/homebrew/bin/cloc npm start

# All options:
node cli.mjs --help
```

CLI outputs are SVG and JSON. PNG export is currently GUI-only. There is no TUI,
watch mode, Git-history diff, native directory chooser, or headless PNG CLI yet.

## Architecture

```text
cli.mjs                 Commands: ui / render
lib/scan.mjs            Validated args -> child_process.execFile -> cloc JSON
lib/report.mjs          Presets, normalization, validation, totals
lib/render.mjs          Pure SVG template, shared by GUI and CLI
lib/server.mjs          Node HTTP server, loopback only
public/                 Vanilla HTML, CSS, and JavaScript interface
config/empty-cloc.conf   Explicit empty cloc config for reproducible filters
examples/               Supplied screenshot data, clearly marked as an example
test/                   Built-in Node tests; no test package install required
```

To change the exported design, edit `lib/render.mjs`. The UI and CLI consume the
same template. To change the control-panel UI, edit `public/app.css` and
`public/index.html`. A future TUI can reuse `scan.mjs`, `report.mjs`, and
`render.mjs`; a native wrapper can reuse the browser interface.

## Local execution and privacy

The server binds only to `127.0.0.1`. It validates Host/Origin and requires a
per-process token for API POST requests. cloc is launched using an argument array,
not shell interpolation. No telemetry, accounts, code uploads, or runtime network
dependencies are present. Source files are not sent to the browser; cloc counts
and file paths are. Scan a trusted repository and do not expose this server via
a public proxy or use it as a multi-user service.

Reports exported as JSON can include local paths and the exact command. PNG/SVG
show only the root directory basename, project title, counts, and filter scope.
Review names and filter text before sharing reports. These precautions are not a
security audit or a sandbox for scanning untrusted repositories.

Scans have a 120-second timeout and a 64 MB process-output cap. Imported GUI JSON
is limited to 15 MB. Large reports can still be rendered by the CLI. The app does
not modify source files; CLI output is written to the path you specify and can
overwrite an existing output file.

## Tests and validation status

```sh
npm test
```

17 tests cover summary/file aggregation, totals, preset filters, glob escaping,
XML escaping, JSON round trips, unknown metadata, and the server/API/scan wrapper.
The server and subprocess integration test uses a controlled cloc stub, clearly
marked as such in the test source.

During construction, the actual GUI rendering code was exercised in Chromium
with offline fixture API responses: SVG, JSON, and 2x PNG export succeeded; title
escaping was checked; mobile layout had no horizontal overflow; there were no
JavaScript page errors. The programmatic example export is 3072 x 2118 pixels at
2x.

**Important:** cloc itself was not available in the construction environment and
could not be installed there. A real cloc subprocess/repository scan and a full
browser-to-live-server run were therefore not validated end-to-end. The supplied
KERV Studio numbers are example input, not a fresh scan of your repository. The
next validation step is to run the default preset against your local repo and
compare its counts with your existing cloc command. macOS execution and Safari
export have not been tested in this environment.
# clock-studio
