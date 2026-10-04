# AGENTS.md

Decisions locked for this plugin. Read this before changing anything; it
caps the traps agents keep hitting in this specific repo.

This directory is the live DMS plugin checkout, linked at
`~/.config/DankMaterialShell/plugins/dankDictionary`. This is a Git checkout. Editing files changes the plugin on reload; switching
branches also changes the live plugin. Files under `data/webster/` are
generated; do not hand-edit them.

## Run the tests before and after any change

```bash
bash tests/run.sh
```

Suites: `lint.test.js` (2), `model.test.js` (292),
`run-state-runtime.sh` (24), `run-panel-runtime.sh` (36),
`build-webster.test.py` (10): 364 checks total.
All must be green before a push.

- `Model.js` is QML-loaded JavaScript. **No `const`/`let`** — the engine
  requires `var` (lint enforces this). Top-level declarations only.
- The tests load `Model.js` through a `new Function("module", "exports",
  src + exportLines)` harness driven by the `PUBLIC_SYMBOLS` list in
  `tests/model.test.js`. Any new public helper **must be added to
  `PUBLIC_SYMBOLS`** or it will be invisible to the Node test harness. QML accesses top-level
  declarations independently of that test export list.
- Tests run against a tiny synthetic wordlist; they never touch network or
  the real `data/webster` buckets. A real-data smoke check is manual:
  `gzip -dc data/webster/<bucket>.json.gz | <adapter parse>`.

## Dictionary adapters are the one real architecture here

Dictionary sources are pluggable **adapters**, not branches. An adapter is a
plain object:

```
{ id, label, languages: ["en"],            // "*" = every language
  argsFor: function(word, lang) -> argv,   // [] = skip this adapter
  parse:   function(stdout, word, lang) -> { ok:true, entry } | { ok:false, kind, error } }
```

- `ADAPTERS` registry **order IS the fallback chain order**. English resolves
  to `[webster1913, wiktionary]` (offline-first, network fallback); every
  other language to `[wiktionary]` via `adaptersFor(lang)`.
- The panel tries the chain in order: first `ok` wins; `notfound`/`empty`/
  `invalid`/process-failure advances; an exhausted chain falls back to the
  existing fuzzy-recovery / notfound UI.
- Adding a source = new adapter object + one line in `ADAPTERS`. Do not
  reorder the registry and do not add per-language ad-hoc branches in
  `Panel.qml`.

## Offline data layout

`scripts/build-webster.py` produces `data/webster/<first-letter>.json.gz`
(plus `other.json.gz` for keys not starting a-z) from GCIDE XML. Keys are
normalized lowercased/collapsed-whitespace. A bucket decompresses to up to
~1 MB, so the panel streams it through a `gzip -dc` Process and parses
stdout — never read a bucket whole into memory.

Known issue: ~12.6% of headwords carry literal U+FFFD in their phonetic
field (upstream GCIDE data loss, not a build-script bug — the build decodes
UTF-8 strictly). Tracked as issue #14; sanitization is a deliberate
future change, not something to bolt on ad hoc.

## Version metadata

The release version is tracked in `plugin.json`. The user removed the popup
version label; do not add a build/version tag to the panel.

## No shortcut installer

The user removed the selection-hotkey feature. Do not add a script installer,
write to `~/.local/bin`, or configure keyboard shortcuts. Bar search and the
existing DMS IPC commands remain available.

## DMS runtime ownership

- `plugin.json` is a composite widget + daemon with ID `dankDictionary`.
- `DictionaryDaemon.qml` owns the one IPC handler. Never duplicate it per bar.
- `DictionaryState.qml` registers live hosts and routes to the last-used host;
  unregister on destruction and hand over to another live host.
- `PluginComponent.triggerPopout()` toggles and calls custom pillClickAction
  when present. Do not route a custom click action back through this helper.
- `Panel.qml` receives `parentPopout` and `closePopout` from DMS. Enable
  `contentHandlesKeys` and use the inner DankTextField focus API.
- Actual QML runtime checks run in `tests/run.sh`: `run-state-runtime.sh` (24)
  and `run-panel-runtime.sh` (36).
  They run in a temporary offscreen Quickshell config, never in the live shell.

## Lookup correctness

- First-block removal is restricted to actual headword/inflection headers.
  Do not classify every alphabetic line as a header or reject short definitions.
- Metadata labels and date attribution need structural recognition; plain senses
  beginning with May, Source, or Notes are definitions. Short attributed quotes
  remain quotations, not senses.
- English POS allowlisting includes abbreviation, acronym, and ellipsis.
  Non-English POS can appear below etymology at level 4 or deeper.
- Prefer the selected edition's corresponding language section, including
  registered native aliases and decorated headings such as `Haus (Deutsch)`.
  If absent, the first language section is an intentional fallback: `language`
  records the source edition, not necessarily the headword's language.
- English fuzzy recovery is English-only. Preserve `originalQuery` through a
  failed automatic correction so the notfound UI names the typed word.
- Use Layout sizing for the POS label/divider row. Keep the search editor focused
  after DMS queues container focus, and guard deferred focus after popup dismissal.
- No unused debounce timer: Enter/Search submit directly.

## Building and publishing

- Download GCIDE 0.53 over HTTPS, verify the pinned SHA-256 for both cached and
  downloaded archives, use bounded transfer time, and atomically publish the cache.
  The pin is locally observed from the official source, not a signed publisher hash.
- Updating the source version requires explicitly updating the URL/hash and tests.
  Downloader tests must stay offline; do not rebuild generated data during tests.
- Public repository: `https://github.com/quantavil/dank-dictionary`.
- Preserve the original MIT copyright and the separate GCIDE data license.
- Run the full suite and validate `plugin.json` against the target DMS schema
  before committing/pushing. Check live QML after a restart when reload caches it.
