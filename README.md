# Dank Dictionary

A dictionary plugin for DankMaterialShell with 23 Wiktionary editions,
offline English definitions, and English typo suggestions. Its popup follows
DMS colors, fonts, font scaling, and controls.

English lookups try the bundled Webster's 1913 dictionary first, then
Wiktionary when the offline source misses. Other language editions use
Wiktionary online. Webster's historical definitions can differ from modern usage.

## Requirements

- DankMaterialShell 1.6.2 or newer, with Quickshell
- `curl` and `gzip`
- Network access to `*.wiktionary.org` for online lookups

## Install

```sh
git clone https://github.com/quantavil/dank-dictionary.git \
  ~/.config/DankMaterialShell/plugins/dankDictionary
dms ipc call plugin-scan scan
```

Once DMS discovers the plugin, enable **Dank Dictionary** in its plugin settings,
or run:

```sh
dms ipc call plugins enable dankDictionary
```

Add **Dank Dictionary** to a DankBar section in DMS Settings. Its manifest ID
is `dankDictionary`. The bar widget displays the dictionary icon; one daemon
owns IPC across all bar instances. IPC uses the most recently opened instance
and requires at least one dictionary widget on a bar.

For an existing checkout, use a symlink in the plugin directory instead of
cloning again. Editing that checkout changes the live plugin after reload.
DMS can cache changed QML classes; restart the shell if a plugin reload retains
old behavior.

## Usage

Click the dictionary icon: the search field receives keyboard focus so you
can type immediately. Enter a word and press **Enter** or **Search**. The
language dropdown selects the Wiktionary edition and clears the previous lookup.
Press **Escape** to clear the focused field, then again to close the popup.

English misses may auto-correct a close typo or show clickable suggestions.
Other languages never receive suggestions from the English wordlist. A failed
automatic correction reports the word you originally typed. Editing the query
or closing the popup cancels pending lookups so stale results cannot replace
newer ones.

The plugin does not install scripts or create keyboard shortcuts.

### IPC

```sh
dms ipc call dankDictionary search "dictionary"
dms ipc call dankDictionary open
dms ipc call dankDictionary close
dms ipc call dankDictionary toggle
dms ipc call dankDictionary status
```

`open` is idempotent and preserves the current query. `search` opens the panel
and performs a lookup. `status` returns JSON with the host count, popup visibility,
lookup status, query, and selected Wiktionary edition.

## Offline data and adapters

The plugin bundles headwords from Webster's New International Dictionary
(1913), via GCIDE XML 0.53, in per-letter compressed files under `data/webster/`
A lookup runs `gzip -dc` on the relevant bucket and parses its output.
Generated buckets are never hand-edited.

Sources are adapters in `Model.js`. Each provides its ID, label, languages,
`argsFor` command builder, and `parse` function. Registry order determines the
fallback chain; the first successful adapter wins. Add a source by adding an
adapter object and registry entry, preserving Webster → Wiktionary for English.

Rebuild the generated data with Python 3.11 or newer:

```sh
scripts/build-webster.py
```

The build downloads GCIDE 0.53 from the [official HTTPS source](https://www.ibiblio.org/webster/)
and verifies SHA-256 before using either a downloaded or cached archive.
Downloads use a 30-second socket timeout, a 120-second transfer deadline checked
between reads, and atomic cache publication. A blocking read can extend the
transfer deadline by its socket timeout. `--zip PATH` selects a cache path for
the same pinned GCIDE version, not an arbitrary source archive.

The SHA-256 pin is `02a57fc9057d7f790dd5773af66c85e687ab8950b832dd9c0e1fda8749e4fcbb`,
computed from the official HTTPS archive on 2026-10-04. It is an observed archive
pin, not a publisher-signed checksum. Raw source archives are ignored by Git.

The Webster's 1913 core text is public domain; GCIDE markup and additions are GPL.
See [the data license](data/webster/LICENSE-DATA.txt).

## Tests and audit

```sh
bash tests/run.sh
```

The suite runs **377 checks**: 2 QML source checks, 296 model checks, 24 registry/IPC
runtime checks, 45 panel runtime checks, and 10 offline downloader checks.
It requires Node.js, Quickshell, Python 3.11+, and GNU coreutils. Runtime tests
use isolated offscreen windows, real Process/gzip/parsers, synthetic dictionary
data, and stubs for DMS visual boundaries. They cover initial/reopened keyboard
focus, divider geometry, cancellation, language-specific recovery, and command
startup failures, both completion signal orders, and manifest version injection.
Tests do not access the network or real Webster buckets.

[The audit report](docs/audit.md) records the verified findings and their fixes.
Offscreen tests do not establish physical multi-monitor or cross-compositor behavior.

## Remove

Disable the plugin, remove its bar widget in DMS Settings, and remove its
installation directory or development symlink:

```sh
dms ipc call plugins disable dankDictionary
rm -rf ~/.config/DankMaterialShell/plugins/dankDictionary
```

Removing a development symlink leaves its source checkout intact.

## Supported languages

23 Wiktionary editions, alphabetically by English label:

| Language | Code |
|---|---|
| Arabic | `ar` |
| Bengali | `bn` |
| Chinese | `zh` |
| Dutch | `nl` |
| English | `en` |
| French | `fr` |
| German | `de` |
| Hindi | `hi` |
| Indonesian | `id` |
| Italian | `it` |
| Japanese | `ja` |
| Korean | `ko` |
| Malay | `ms` |
| Persian | `fa` |
| Polish | `pl` |
| Portuguese | `pt` |
| Russian | `ru` |
| Spanish | `es` |
| Swahili | `sw` |
| Swedish | `sv` |
| Thai | `th` |
| Turkish | `tr` |
| Vietnamese | `vi` |

To add another edition, append it to the `LANGUAGES` array in `Model.js`.

## License and credits

Plugin code is MIT licensed; bundled dictionary data has separate licensing
as described above. Original Omarchy Dictionary by [Triston Armstrong](https://github.com/tristonarmstrong/omarchy-dictionary).
DMS migration and maintenance by [quantavil](https://github.com/quantavil).
