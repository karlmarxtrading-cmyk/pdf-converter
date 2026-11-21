# PaperForma RC3 → RC4: UI and storage audit

Date: 2026-11-21. Scope: the UI and project/storage modules listed below. Original source: `original/repository`; repaired candidate: `candidate`. This is one component of the parent audit, not an independent certification of the complete release.

## Result

Confirmed defects in asynchronous asset ownership, filename alias replacement, undo/history restoration, cumulative image admission, malformed historical metadata, review responsiveness and readiness feedback were repaired. Snapshot preparation now hashes each cloned asset once and does not clone revision history that cannot affect rendering. These repairs preserve the original document and keep explicit approval for conversion/repair changes.

The current focused tests pass: **20 tests in 4 files**. A wider selected regression run passed **40 tests in 7 files**. TypeScript and the scoped linter passed. The tests include the actual UI handler source with controlled asynchronous pauses and a DOM fixture; they are **not browser E2E tests**. A new Chromium process could not be launched in this execution environment, so keyboard interaction, native dialogs, layout, actual rendering, IndexedDB durability and browser performance remain outside this agent's fresh verification.

## Findings and repairs

| ID | Severity | Confirmed original behavior | Repair | Evidence |
| --- | --- | --- | --- | --- |
| PF-AUD-A01 | P1 | An image import paused during hashing could complete into a different project. Concurrent import batches could overwrite one another's asset arrays. Reopening the same project ID did not invalidate the pending work. A later completion could replace a newer same-path image. | Bind work to project ID and activation generation; recheck after file reading and hashing; merge independent paths into the latest project; reject stale same-path writes. The ownership checks also cover remote-copy/brand pickers and asynchronous paste/file imports. | Five actual-handler regressions in `asset-operations.test.ts`, including the alias case below. Original handlers: 5/5 fail. Repaired handlers: 5/5 pass. Additional defensive picker/paste checks were source-reviewed; they are not separate end-to-end test claims. |
| PF-AUD-A02 | P1 | Two distinct filenames with identical bytes share an asset ID. Clicking Replace for the second filename selected the first asset with that ID. | Use the clicked path as the replacement identity; keep the content hash as a content identity. Preserve an unrelated logo reference when another alias still retains its bytes. | The replacement test derives its selector from the actual UI row wiring, so it exercises the original ID selection and repaired path selection. See `before-ui-actual-selectors.txt`. |
| PF-AUD-A03 | P1 | Undo of replacing an image with different bytes at the same path retained both versions under the same filename, causing project validation to reject the state. The UI also consumed an undo/redo entry before knowing whether the restoration was admissible. | Merge retained assets by normalized path, with the restored path taking precedence. Apply and validate a peeked undo/redo state before moving the stack. The displaced bytes remain available in the redo snapshot. | Core regression fails before the path fix and passes afterward; admission-failure control verifies a peek does not consume history. Atomic UI ordering was source-reviewed. |
| PF-AUD-A04 | P2 | Persistent history recorded only hashes. Same-byte filename aliases could restore as duplicate paths or select the wrong name. | Store optional `{id,path}` references alongside legacy `assetIds`; restore references by path and bytes; map legacy aliases to distinct current assets; retain only nonconflicting extra paths. Drop a missing historical logo reference instead of rejecting all restored text/settings. | New/legacy alias tests plus bundle round-trip and project validation. New histories preserve aliases. Legacy histories cannot reconstruct historical names or bytes that were never retained. |
| PF-AUD-A05 | P2 | ZIP and project admission paths could accept a collection above the existing cumulative 200-megapixel image budget, even though individual files met their limits. | Enforce the cumulative budget in both ZIP import and the shared project validator used by commits, bundles and storage. Reject the operation without modifying the existing project. | Project, ZIP and storage boundary tests use image headers totaling 216 MP. These are header-admission tests, not claims of real image decoding, memory consumption or a browser crash. |
| PF-AUD-A06 | P2 | Syntactically valid but malformed history state JSON, such as `null` or a wrongly shaped `assetIds`, could throw during revision restoration. | Validate historical metadata before use and degrade to source-text-only restoration when invalid. Final project admission still validates the restored project. | Malformed-state regression and valid legacy/new-history tests. |
| PF-AUD-U01 | P2 | When a new processing attempt failed while an older preview revision remained, readiness displayed “Processing…” indefinitely because the revision-mismatch condition overrode the failure condition. | Give a failed processing verdict priority over stale-preview readiness. | Actual `updateReadiness` source with a DOM fixture fails against original UI and passes against repaired UI. |
| PF-AUD-U02 | P2 | Repair/conversion approval built an unbounded synchronous line diff and potentially thousands of DOM nodes before the user could decide. | Bound characters, lines, edit distance, diff timeout and rendered diff rows. Use the installed diff library's asynchronous callback. Fall back to two complete readonly before/after texts with exact downloads; Apply/Cancel remain explicit. Small diffs retain the detailed line review. | Actual `showDiff` source for a 2,200-line input; complete text equality, fewer than 20 panel descendants and declined approval. Separate small-diff and complexity-budget tests. The original UI lacks the bounded full-text view. |
| PF-AUD-P01 | Performance | Snapshot preparation cloned irrelevant revision history and hashed the same cloned image bytes twice. | Clone only the rendering identity fields, hash each owned asset buffer once, and reuse those digests in the render hash. No persistent cache relies on mutable caller data. | Actual digest-call regression: original 2 calls versus candidate 1 for one asset. A mutation-during-await test verifies the snapshot and public render hash still match independently computed values. Timing is reserved for the parent's controlled benchmark. |

Additional integration repairs: font planning now receives the complete brand kit, and completed workflow badges use the theme's foreground color token. Fresh visual/browser validation is still required for these UI changes.

## Review mode and preservation guarantees

Large or complex text comparisons are a review-mode change, not permission to truncate or transform content. Both panes retain the entire exact original and proposed string; both can be downloaded, and neither is automatically applied. The limits are 200,000 combined characters, 2,000 lines per input, 1,200 rendered diff rows, an 80 ms library comparison budget and maximum edit length 600. The timeout is a library work budget, not an assertion that every browser completes the whole dialog in 80 ms. Full-text browser layout and download interactions require later browser verification.

The installed `diff` library's local type declarations and implementation were checked for asynchronous callbacks, `timeout`, `maxEditLength` and the undefined result returned on budget exhaustion. An undefined result selects the full-text review; it does not authorize the proposed change.

## Test evidence and how to interpret it

| Evidence file | Meaning |
| --- | --- |
| `before.txt` | Initial original-source regressions: 11 failures and one passing control in 12 tests. The first alias UI test was subsequently strengthened to derive its selector from actual UI wiring; use the next file for the final replacement proof. |
| `before-ui-actual-selectors.txt` | Five actual original UI-handler tests fail. The harness uses repaired core helpers and controlled asynchronous pauses; this isolates the original UI defects rather than claiming a complete original build/browser execution. |
| `before-review.txt` | Original readiness and oversized-review UI regressions fail; two new helper control cases pass. |
| `before-snapshot.txt` | The original snapshot digest-count case fails (two image digests); the mutation-preservation control passes. |
| `after-initial.txt` | Initial 12/12 regression run after the first repairs. |
| `after.txt` | Wider selected run: 40/40 pass, 7 test files. |
| `after-final-focus.txt` | Final focused run after defensive import guards: 20/20 pass, 4 test files. |
| `typecheck.txt` | `npm run typecheck` succeeds. |
| `lint.txt` | Scoped `npx oxlint` succeeds; npm emits an environment configuration warning. |
| `snapshot-benchmark.mjs` | Prepared paired Node microbenchmark runner. It is not a browser benchmark and does not decode the synthetic image buffers. This agent did not execute it; the parent coordinates final timing. |

New test files:

- `tests/unit/core/rc4-asset-integrity.test.ts` — 9 cases.
- `tests/unit/core/snapshot-efficiency.test.ts` — 2 cases.
- `tests/unit/ui/asset-operations.test.ts` — 5 cases.
- `tests/unit/ui/review-state.test.ts` — 4 cases.

The wider selected run additionally includes existing `budget-hash`, `undo-project` and `storage-boundary` coverage. Tests were chosen for confirmed defects and state/integrity risks; they do not establish universal format compatibility or guarantee that all writes will survive a browser/OS crash.

## Source inspection coverage

All assigned runtime source files were read. Files with no material changes remain part of the inspection scope; “read” is not a claim that every branch was executed.

UI:

- `src/ui/compat.ts`
- `src/ui/i18n.ts`
- `src/ui/main.ts`
- `src/ui/samples.ts`
- `src/ui/shell.ts`
- `src/ui/styles.css`
- `src/ui/theme.ts`
- `src/ui/review-diff.ts` (new)

Core:

- `src/core/assets.ts`
- `src/core/hash.ts`
- `src/core/paste.ts`
- `src/core/projects.ts`
- `src/core/save-base.ts`
- `src/core/schema.ts`
- `src/core/storage.ts`
- `src/core/undo.ts`
- `src/core/verdict.ts`
- `src/core/zip.ts`
- `src/core/index.ts`
- `src/core/contracts.ts`: the history-state interface only, coordinated with its primary owner.

Related existing test source inspected includes `project-ownership`, `contrast`, `compat`, `asset-replace`, `undo-project`, `projects-storage`, `assets-zip`, `paste`, `storage-boundary` and fixture helpers. Other repo modules, math parsing/rendering and release tooling are covered by their respective owners.

## Remaining limitations and follow-up

1. No fresh browser E2E, native clipboard, native file picker, actual IndexedDB restart/crash durability, screen-reader or visual layout result is claimed here. Node/DOM tests do not replace those checks.
2. Persistent revision history refers to asset bytes available in the project; it does not silently archive every deleted or replaced historical image. Missing assets are reported. Legacy hash-only history cannot recreate a filename it never stored.
3. Snapshot timing improvements must be reported from the parent's paired benchmark, with the same explicit renderer/template version, dataset and environment. Digest counts alone are not an end-user speed figure.
4. The application's historical browser-matrix copy in `print.help.matrix` needs the parent's release-evidence update. Old browser evidence must not be described as fresh RC4 verification.
5. This scope does not add OCR, arbitrary binary/document format decoding, or promise to interpret every possible text. Supported conversions must remain explicit and faithful; unsupported or ambiguous content must be visible to the user.

## Files changed by this agent

`src/core/contracts.ts` (optional history refs only), `src/core/hash.ts`, `src/core/projects.ts`, `src/core/schema.ts`, `src/core/undo.ts`, `src/core/zip.ts`, `src/ui/main.ts`, `src/ui/i18n.ts`, `src/ui/styles.css`, new `src/ui/review-diff.ts`, and the four test files above. No new dependency, package install policy, build output or deployment was introduced by this agent.
