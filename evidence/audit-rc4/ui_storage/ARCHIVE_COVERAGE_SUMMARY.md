# Original archive coverage accounting

The CSV and JSON in `evidence/audit-file-coverage.*` contain **exactly 520 unique rows**, one for each file member of the uploaded original archive. Every original file was reread in full to recompute SHA-256 and size. All match the initial extracted-file inventory and archive entry sizes. The original tree is unchanged. No file is omitted or left unclassified.

Each row records the original archive-relative path, byte size, SHA-256, category, review status, methods actually used, evidence references, reviewers and limitations. These are coverage statuses, **not release PASS labels**. The original archive remains the subject of the hashes; candidate bytes differ by design.

## Coverage levels

- **57 runtime files:** 56 complete source reads across the core, UI/storage, render/export and engine reviewers. The remaining file is generated font coverage data; its generator was reviewed and regeneration produced identical output. Numeric intervals are not represented as individually manually audited.
- **281 original dist files:** independently rebuilt from the unmodified RC3 application and confirmed byte-identical. This includes **168 generated/bundled JavaScript files**, **104 font files**, one CSS file and eight other static files. Vendor/minified JavaScript is not represented as manually reviewed line by line.
- **104 WOFF2 fonts:** decoded with fontTools and glyph counts recorded. **14 PNGs:** decoded structurally. **11 PDFs:** structurally parsed and text-extracted. Six specific historical PDFs additionally received visual review of 29 rendered pages: three complete documents and three selected-page samples. These are not freshly produced RC4 outputs. The other five PDFs have no visual-review claim.
- **30 original unit-test files plus two helpers:** original suite executed and complete manual reads recorded for every file. The final core review closed the thirteen previously unrecorded manual-read entries; its original hashes and byte sizes were independently matched before updating the coverage rows.
- **10 browser/E2E scripts:** complete source reviews recorded for every file, including all 1,170 original lines of `scenarios.mjs`. A fresh browser run was unavailable in this environment, regardless of historical logs. The newly hardened assertions have syntax/lint verification, not a fresh browser-pass claim.
- **16 repository documentation files:** complete reads confirmed by the root and UI/storage reviewers. Historical version, acceptance and browser claims are not promoted into current candidate evidence.
- **30 fixtures:** manual text/intention review, generated Einstein fixture tests, PNG decoding and the legacy project bundle's ZIP CRC/internal manifest verification are recorded individually. The corpus remains synthetic input, not a live-provider capture or newly approved visual golden output.
- **61 historical evidence files:** individually accounted for and checked according to their type. Logs were UTF-8 decoded and status lines extracted; JSON parsed; images/PDFs structurally inspected. Old results are not treated as fresh candidate tests.
- Build/hosting configuration, release scripts, metadata, dependency lock, license notices and SBOM have their own explicit methods. Notice copies match byte-for-byte; the corpus manifest's 16 cases and three images match their declared hashes and sizes. This is not a legal assessment of every license paragraph or a security audit of every dependency source line.

## Remaining method limits

There is no remaining first-party runtime, script or test source with an unrecorded complete manual read, apart from generated font range data whose coverage is intentionally established by regeneration. The final test-source record is `evidence/math_core/manual-test-review.json`; semantic findings and test-only harness changes are documented in `TEST_SOURCE_REVIEW.md`. The 13 core tests retain their existing executed-suite evidence. `scenarios.mjs` is tagged `MANUAL_SOURCE_REVIEW_NOT_FRESHLY_EXECUTED` because reading and linting cannot establish a browser result.

Generated vendor bundles, historical artifacts, lockfile entries and notices retain their structural/build/provenance limits instead of being described as manually audited source. The PDF visual review is restricted to these original archive paths and physical pages:

| Original archived PDF under `repository/evidence/` | Visually reviewed pages | Scope |
| --- | --- | --- |
| `pdf/einstein-A4.chrome.pdf` | 1–2 of 2 | Complete document |
| `pdf/einstein-A4.firefox.pdf` | 1–2 of 2 | Complete document |
| `pdf/small-mixed-A4.chrome.pdf` | 1–11 of 11 | Complete document |
| `pdf/small-mixed-A4.firefox.pdf` | 1, 5, 6, 9, 10, 11 of 11 | Selected pages |
| `pdf/small-mixed-A5.chrome.pdf` | 7, 9, 10, 14, 21 of 21 | Selected pages |
| `pdf-eval/small.B1-jspdf-html.pdf` | 3, 5, 9 of 11 | Selected prototype pages |

The exact page counts, SHA-256 values and render commands are linked per affected PDF row. The reviewer found defects in archived output; visual inspection is not a blanket PASS label. Fresh candidate PDF generation and native print review remain unverified by this accounting task.

## Supporting files

- `evidence/audit-file-coverage.csv` — 520 rows for spreadsheet/filter use.
- `evidence/audit-file-coverage.json` — same rows, arrays of methods/evidence and aggregate counts.
- `evidence/audit-structure-checks.json` — additional complete UTF-8/JSON/XML checks, historical status-line extraction, legacy bundle CRC/internal hashes, fixture manifest and notice-copy checks.
- `evidence/archive-inventory-original.json` — original archive member metadata copied unchanged for self-contained references.
- `evidence/root-doc-review-complete.json` — records the root reviewer's explicit completion confirmation.
- `evidence/math_core/manual-test-review.json` and `TEST_SOURCE_REVIEW.md` — final full-read proof for all previously unrecorded test sources, retaining fresh browser `NOT_RUN`.
- `evidence/render_exports/pdf-visual-history/FINDINGS.md`, `inventory.json` and `render-log.json` — six-document visual scope, findings and page-level provenance.
- `evidence/ui_storage/build-archive-coverage.py` — reproducible accounting script; it reads the original and writes only evidence outputs.

No application source, test source, build script, original archive member or candidate documentation was changed by this accounting task. Root-authorized test harness and render fixes were made by their owning reviewers and remain separate from coverage accounting.
