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
