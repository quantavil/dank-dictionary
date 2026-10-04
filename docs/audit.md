# Dictionary audit — 2026-10-04

All eleven reported findings were reproduced or verified against the pre-fix
source. No numbered finding was dismissed as a false positive. Item 10 concerns
test quality; item 11 concerns the offline-data build, not runtime lookups.

| # | Finding | Result and correction |
|---|---|---|
| 1 | Single-line definitions discarded as headwords | Confirmed. Match actual headwords/inflections, preserve ordinary and short senses. The old regex affected ASCII prose regardless of original capitalization. |
| 2 | May-led definitions discarded as attribution | Confirmed independently of the first-block bug. Require a recognizable date/attribution structure; ordinary month-led definitions survive. |
| 3 | Valid English POS excluded | Confirmed. Add abbreviation, acronym, and ellipsis while retaining strict exclusion of unrelated English metadata. |
| 4 | Nested non-English POS missed | Confirmed. Parse deeper POS sections under etymology; retain the native POS title. |
| 5 | Divider extends past the POS row | Confirmed by runtime geometry. Use RowLayout and fill the remaining width. |
| 6 | English fuzzy suggestions used for other languages | Confirmed. Only English invokes the English wordlist. French and Thai misses remain language-appropriate misses. |
| 7 | Failed auto-match loses the original query | Confirmed. Retain the typed query and use it in the notfound text/message. |
| 8 | Debounce timer never starts | Confirmed by call-site inspection. Remove the timer, delay property, and stop-only calls; submission remains explicit. |
| 9 | Loading status assigned before reset | Confirmed. Remove the overwritten assignment and enter loading once after reset. |
| 10 | Ambiguous fuzzy test is tautological | Confirmed. Use a controlled cat/cot wordlist and require both alternatives for cut, with no auto-match. An empty-candidates mutation fails this test. |
| 11 | Dataset download lacks transport/integrity bounds | Confirmed at build time. Use HTTPS, a verified version pin, timeouts/deadline, and atomic cache publication; validate cached archives too. |

The GCIDE hash was computed from the official HTTPS archive, not obtained from a
signed publisher checksum. Socket reads can extend the transfer deadline by one
socket timeout. Generated dictionary buckets were not changed by this audit.

Related parser defects found during review were also fixed: metadata-prefix false
positives such as “Source of a river.” and short quotations leaking into definitions.

An additional proposed finding about missing preferred-language sections was
rejected as a false positive. The selected language identifies a Wiktionary edition,
which can contain headwords from other languages. Its documented first-language
fallback is retained. Native-language preference recognizes French, Thai, German,
and Spanish aliases, including the decorated German `Haus (Deutsch)` heading.
German and Spanish multi-language fixtures verify preference without rejecting
other editions' existing fallback behavior.

The requested bar-click focus behavior is covered by a real-window regression:
the editor receives focus after the host's deferred container focus on both first
open and reopen; a closed popup cannot regain focus through a late callback.

Validation: 364 automated checks, installed DMS manifest schema validation, and
live English lookup/popup checks. Runtime tests stub DMS visual boundaries and do
not claim physical multi-monitor or cross-compositor coverage.

## Follow-up review — 14 findings

The original 11-item audit above describes the first migration commit. This
follow-up checks the subsequently reported findings against that commit.

| # | Verdict | Evidence / action |
|---|---|---|
| 1 | True | `Source:` and `Notes:` senses were filtered. Remove these words from the line metadata regex, preserving the locked definition rule. Add single-line and multiline regressions. |
| 2 | True | `1837, an early locomotive design.` was dropped. Year-comma lines now require a trailing citation colon or a quotation-reporting verb; preserve dated quotation filtering. |
| 3 | True as lifecycle fragility | Normal exits passed existing runtime tests, but callbacks could advance before stdout under a reversed signal order. Join EOF and exit explicitly in one transition; test both permutations, duplicate completion and stale generations. This is not evidence of a failure in the currently installed Quickshell signal order. |
| 4 | True | The request header duplicated `1.3.0`. Read `plugin.json` through FileView and inject its version into Model. A synthetic `9.8.7` manifest verifies actual Panel-to-adapter injection. |
| 5 | True for active adapters | No active lookup supplies multiple displayed entries. Remove Panel's `variants` state and suffix. Retain the parser's result metadata for compatibility callers. |
| 6 | Partly true; coverage claim false | No active adapter uses the Free Dictionary shape. However, existing tests already exercise legacy success/notfound, normalizeEntry, normalizeMeaning, normalizeDefinition and stringList. Retain the tested compatibility parser; adding duplicate tests or deleting it is unwarranted. The pre-fix AGENTS.md did not contain the alleged rollback-insurance rule. |
| 7 | True | No UI consumer reads `hint`. Remove that result field and update legacy notfound contract tests. |
| 8 | True | `panelInstance` has no assignment. Remove that fallback; retain `panelItem` and the host fallback used by runtime fixtures. |
| 9 | False positive | The expressions are not identical: the bar falls back to pending `opening`, while Panel falls back to false. The bar needs pending-open state before lazy content exists; Panel needs actual visibility for focus/cancellation, including standalone runtime fixtures. Keep both. |
| 10 | Duplicate of 3 | Addressed by the single completion transition. |
| 11 | Duplicate of 4 | Addressed by manifest version injection. |
| 12 | Duplicate of 1 | Regex corrected and definition rule clarified in AGENTS.md. |
| 13 | True as potential doc drift | Counts were accurate for the bundled artifact, but rebuilding could invalidate them. Remove hardcoded headword/size counts from README. |
| 14 | True | JavaScript pre-encodes the query; curl does not run encodeURIComponent. Correct the comment. |

Validation after the follow-up: 377 checks (lint 2, model 296, state runtime 24,
panel runtime 45, downloader 10). The lifecycle tests exercise real subprocesses
for lookup, cancellation, fuzzy recovery and failed launch, plus controlled event
permutations for the completion transition. DMS visual boundaries are stubbed.
Generated dictionary data and keyboard shortcut configuration were not changed.

## Follow-up static review (2026-10-04)

Reviewed against the installed DMS/Qt 6 runtime, with live extracts from all 23
editions, synthetic parser fixtures, real isolated Quickshell processes, and a
verified GCIDE rebuild. This table distinguishes faults from optional features.

| Finding | Verdict | Resolution / evidence |
|---|---|---|
| 1. Network failures become misses | True | Preserve exit code/crash status through EOF/exit join. Source errors override misses; only definitive missing entries permit fuzzy recovery. Test curl exit 28 and successful offline lookup afterward. |
| 2. Manifest JSON interrupts initialization | True | Initialize data independently; catch metadata parse errors. Corrupt-manifest runtime test verifies registration and offline search. |
| 3. Escape leaves results | False for installed DMS | DankTextField forwards TextInput.textChanged as textEdited, including programmatic clears. Runtime test confirms empty text resets results. |
| 4. Header-only pronunciation discarded | True | Store pronunciation before the no-definitions return; rebuild generated data. Restored 493 headwords; empty pronunciation count fell from 82,392 to 81,899. |
| 5. gzip timestamps | Version-dependent | Python 3.14 already defaults to zero, but supported Python 3.11 does not. Explicit mtime=0 and historical-default regression test. |
| 6. Data license URL drift | True | Regenerated notice now matches HTTPS source in the builder. |
| 7. User-Agent contact missing | True | Add repository URL; version still comes from plugin.json. |
| Case-sensitive titles | True as a general limitation; both haus and Haus actually exist | Optional adapter wordsFor supplies exact/lowercase/capitalized attempts. Retry only missing titles, never outages. One title per request: full-article extracts are limited to one extract even with multiple titles. |
| Native structural sections become POS / swallow nested senses | True | Recognize observed native etymology, pronunciation and auxiliary headings; recurse etymologies. German/Polish body labels and Indonesian direct senses also need format-specific extraction. |
| Native language headings missing | True; exact “17” count inaccurate | Correct native names and aliases, support level-one Russian/Portuguese languages and decorated headings. Preserve intentional first-language fallback. |
| Last pronunciation wins / numbered pronunciation omitted | True | Strip numbered suffixes consistently; first nonempty IPA wins. |
| Webster transitivity / raw common POS / repeating subtitle | True for stated display loss | Preserve transitive/intransitive verbs, participles and plural nouns; dedupe subtitle. Unknown POS still intentionally passes through. |
| All dogs/running/went miss offline | Partly false | Running and went already exist; dogs is absent. Suffix guessing is a new stemming feature, not a safe correctness fix: it can change the headword and sense. No guessing added. |
| Inflection detector returns null | True minor contract issue | Return false for a delimiter-only head. |
| Verb test needs parentheses | False positive | JavaScript precedence already gives the intended result. |
| Inherited data[key] | True hardening, no demonstrated exploit | Require own property; __proto__ now reports notfound. |
| XML double entity decoding | True | XML parser decodes entities; remove the second html.unescape pass. |
| Enter resubmits during loading | True | Guard accepted event, matching disabled Search button. |
| Keyboard scrolling / scrollbar / copying absent | True | PageUp/PageDown actions, native DankScrollbar and selectable read-only plain-text definitions. Runtime tests cover scrolling, selection and height. |
| Edition change discards word | True UX issue | Preserve word and rerun against chosen edition; clarify definition language in accessibility label and README. |
| Repeated notfound text | True | Remove duplicate message line. |
| Suggestions subtitle stays idle | True | Show choose-a-suggestion status. |
| Idle hint ignores selected edition | True | Non-English hint names its online edition. |
| API error wording | True UX issue | Use “lookup unavailable” and explain unavailable Wiktionary source. |
| Header width can vanish | True | RowLayout reserves headword width and caps phonetic width; source has its own line. Long-phonetic runtime regression. |
| Result height uses arbitrary reserve | True | Use measured control/header heights instead of a guessed reserve. Long-entry runtime verifies popup fits its maximum height. |
| Missing link/history | Feature proposals | No existing contract requires either; not bugs. |
| IPC punctuation stripping | Feature proposal | Input is a literal dictionary title; punctuation may itself be meaningful. No blanket stripping. |
| Hide U+FFFD phonetics | Deliberately deferred | Preserve locked upstream-data policy. Rebuild does not sanitize pronunciation. |
| Free Dictionary compatibility is dead production code | Factually inactive, removal conflicts with locked decision | Retain tested compatibility normalization and rendering. It has coverage, not “zero tests”; misleading one-line rollback comment corrected. |
| panelWidth unused | True | Remove unused competing width property. |
| typeof Model guards mask imports | True redundancy | Remove guards for required Model initialization, language and adapter functions. |
| Repeated focus scheduling | True redundancy | Coalesce pending focus work while retaining queued DMS-focus handling and close guard. |
| Duplicate etymology checks | True redundancy | Use structural key classification once. |
| programmaticEdit unnecessary | False for installed DMS | Programmatic edits emit textEdited; removing guard breaks automatic recovery. |
| var word twice | True harmless redundancy | Use title for the Wiktionary branch. |
| Accent handling dead | Not a correctness bug | Injected accented candidates are supported and tested; harmless generic support retained. |
| /tmp/gcide ignore ineffective | True | Remove ineffective repository-root pattern; archive/directory patterns remain. |
| Stale comments / missing README period | True | Update BCP 47, compatibility/fuzzy/path comments and README punctuation. |
| Frequency list suggests non-dictionary tokens | True | Remove frequency asset; use actual current Webster bucket keys, including rare words. |
| Transposition costs two edits | True algorithm limitation | Optimal-string-alignment Damerau distance counts adjacent swaps as one; ambiguous short words remain suggestions. |
| Bucket-memory claim contradicts implementation | True documentation error | Document buffered parsing of one bucket (largest current bucket ~2.2 MB), not streaming single-entry parsing. No unnecessary format migration. |
| Missing .pragma library | Not automatically a bug | Model contains per-panel mutable adapter configuration/candidates. Sharing it changes ownership semantics. Removed duplicated frequency asset instead. |
| Replace extracts with REST definitions | Incompatible feature proposal | Live English REST request worked; French and German returned HTTP 501. It cannot replace the 23-edition adapter. |
| No data smoke or CI | True coverage gap | Add separate read-only 27-bucket/20-word/8-pronunciation smoke check and CI pure checks. Main runtime suite stays synthetic and offline. |
| curl protocol/size limits | Useful hardening | Restrict to HTTPS and cap response at 2 MiB. Existing timeout, argv isolation, language allowlist and PlainText handling remain. |

Live probes returned usable selected-language senses for 21 sampled editions.
The sampled Arabic page had an empty extract, and Japanese 水 had no senses in
its Japanese section. Those are source/coverage limitations, not claimed fixes;
an unusable response now shows a source error instead of spelling correction.
Extracts still flatten examples into text, so heuristic parsing is not lossless.

References: [Wikimedia User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy),
[English-only structured definition implementation](https://www.mediawiki.org/wiki/Wikimedia_Apps/Wiktionary_definition_popups_in_the_Android_Wikipedia_app).
The installed DankTextField source, rather than stock Qt textEdited semantics,
establishes the Escape/programmatic-edit verdicts.

Validation: 419 checks pass (312 model, 24 state, 66 panel, 2 malformed-manifest,
13 build/downloader, 2 source lint), plus separate real-data smoke verification.
Generated buckets were rebuilt from the pinned verified archive, never edited by
hand. CI checks do not replace the required local Quickshell runtime suite.
