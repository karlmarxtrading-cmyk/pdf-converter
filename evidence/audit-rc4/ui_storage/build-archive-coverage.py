"""Inventory original archive members and join actual review/validation evidence.

This is accounting, not a claim of manual review for generated/vendor bytes.
It never edits original or candidate application files.
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

BASE = Path(__file__).resolve().parents[2]
ORIGINAL = BASE / "original"
EVIDENCE = BASE / "evidence"
archive = json.loads((BASE / "archive_inventory.json").read_text())
initial = {x["path"]: x for x in json.loads((EVIDENCE / "source-file-inventory.json").read_text())}
binary = {"repository/" + x["path"]: x for x in json.loads((EVIDENCE / "binary-structured-validation.json").read_text())}
fonts = {x["path"]: x for x in json.loads((EVIDENCE / "font-decode-validation.json").read_text())}
pdfs = {x["path"]: x for x in json.loads((EVIDENCE / "pdf-text-validation.json").read_text())}
core = {"repository/" + x["path"]: x for x in json.loads((EVIDENCE / "math_core/coverage.json").read_text())}
render = {"repository/" + x["path"]: x for x in json.loads((EVIDENCE / "render_exports/coverage.json").read_text())}
manual_test_review_file = EVIDENCE / "math_core/manual-test-review.json"
manual_test_review = {x["archive_path"]: x for x in json.loads(manual_test_review_file.read_text())["files"]} if manual_test_review_file.exists() else {}
visual_dir = EVIDENCE / "render_exports/pdf-visual-history"
visual = {}
if (visual_dir / "FINDINGS.md").exists():
    visual_inventory = {Path(x["source"]).relative_to(ORIGINAL).as_posix(): x for x in json.loads((visual_dir / "inventory.json").read_text())}
    for item in json.loads((visual_dir / "render-log.json").read_text()):
        assert item["exitCode"] == 0
        name = Path(item["source"]).relative_to(ORIGINAL).as_posix()
        visual.setdefault(name, {"pages": [], "total_pages": len(visual_inventory[name]["pages"]), "sha256": visual_inventory[name]["sha256"]})["pages"].append(item["page"])
    for item in visual.values():
        item["pages"] = sorted(set(item["pages"]))
        item["complete"] = item["pages"] == list(range(1, item["total_pages"] + 1))

ui_files = {"src/ui/" + x for x in ["compat.ts", "i18n.ts", "main.ts", "samples.ts", "shell.ts", "styles.css", "theme.ts"]}
ui_core = {"src/core/" + x + ".ts" for x in ["assets", "hash", "paste", "projects", "save-base", "schema", "storage", "undo", "verdict", "zip", "index"]}
ui_tests = {"tests/unit/ui/" + x + ".test.ts" for x in ["compat", "contrast", "project-ownership"]}
ui_tests |= {"tests/unit/core/" + x + ".test.ts" for x in ["asset-replace", "undo-project", "projects-storage", "assets-zip", "paste", "storage-boundary"]}
ui_tests.add("tests/unit/core/fx.ts")
root_source = {"src/engine/" + x + ".ts" for x in ["client", "handler", "protocol", "analyze", "engine.worker"]}
root_scripts = {"scripts/" + x + ".mjs" for x in ["build", "fingerprint", "sbom", "secret-scan", "serve-dist", "verify-static-release", "verify-deployment-math"]}
root_e2e = {"tests/e2e/" + x + ".mjs" for x in ["lib", "run-e2e", "static-smoke", "release-gate", "cross-browser", "perf-matrix", "stress-pages", "pdf-engine-eval"]}
root_config = {"index.html", "print.html", "vite.config.ts", "vitest.config.ts", "tsconfig.json", "package.json", ".npmrc", ".node-version", ".oxlintrc.json", ".gitignore", "public/_headers", "public/404.html", "public/docs/panduan.html"}
ui_docs = {"docs/" + x + ".md" for x in ["PRIVACY", "RECOVERY", "MIGRATION", "TEMPLATES"]}
root_docs = {"docs/" + x + ".md" for x in ["AGENT_RULES", "CORE_API", "RENDER_API", "TESTING", "RELEASE_REPORT", "ACCEPTANCE", "PERFORMANCE_REPORT", "KNOWN_LIMITS", "DEPLOYMENT", "DEPLOY_CLOUDFLARE"]} | {"README.md", "CHANGELOG.md"}
# Set true only after the root reviewer confirms completion, not merely intent.
root_docs_complete = (EVIDENCE / "root-doc-review-complete.json").exists()

manual_fixture = {"fixtures/einstein/make-html.mjs", "fixtures/einstein/chatgpt-literal.html", "fixtures/einstein/einstein.md", "fixtures/operator/clipboard-id.txt", "fixtures/ordered-token-pairs.json", "fixtures/mixed-document.md", "fixtures/korpus/README.md", "fixtures/korpus/MANIFEST_KORPUS.json", "fixtures/rc3-project.pfproj"}
manual_fixture |= {p.relative_to(ORIGINAL / "repository").as_posix() for p in (ORIGINAL / "repository/fixtures/korpus").iterdir() if p.is_file() and re.match(r"\d\d_", p.name)}

all_actual = {p.relative_to(ORIGINAL).as_posix() for p in ORIGINAL.rglob("*") if p.is_file()}
all_archive = {x["path"] for x in archive}
assert len(archive) == len(all_archive) == 520
assert all_actual == all_archive == set(initial), "Archive/initial/extracted sets differ"

structured = []
rows = []
for member in sorted(archive, key=lambda x: x["path"]):
    path = member["path"]
    p = ORIGINAL / path
    data = p.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    assert len(data) == member["size"] == initial[path]["bytes"], path
    assert digest == initial[path]["sha256"], path
    assert not p.is_symlink(), path
    rel = path.removeprefix("repository/")
    suffix = p.suffix.lower()
    methods = ["full-file SHA-256 recomputed; size and path matched original archive inventory and initial extracted-file inventory"]
    evidence = ["evidence/archive-inventory-original.json", "evidence/source-file-inventory.json", "evidence/archive-safety.json"]
    owners = ["coverage integrator"]
    limits = []
    manual = False
    status = "INVENTORIED_ONLY"
    category = "other"

    detail = {"path": path, "sha256": digest, "size": len(data)}
    if suffix not in {".woff2", ".png", ".pdf", ".pfproj"}:
        text = data.decode("utf-8", errors="strict")
        detail.update(utf8=True, lines=len(text.splitlines()))
        methods.append("entire text decoded as UTF-8")
        evidence.append("evidence/audit-structure-checks.json")
        if suffix == ".json":
            value = json.loads(text)
            detail.update(json=True, topLevel=type(value).__name__)
            methods.append("JSON syntax parsed")
        if suffix == ".svg":
            xml = ElementTree.fromstring(text)
            detail.update(xml=True, root=xml.tag)
            methods.append("SVG XML structure parsed")
        if suffix in {".log", ".txt"} and rel.startswith("evidence/"):
            # This extraction is not a re-execution or certification of old logs.
            detail["resultLines"] = [line[:1000] for line in text.splitlines() if re.search(r"(?i)(pass|fail|lulus|gagal|not.run|not.available|skip|warning|error|version)", line)][-30:]
            methods.append("historical log result/status lines extracted for provenance review; not re-executed")
        structured.append(detail)

    if not path.startswith("repository/"):
        category = "archive_metadata"
        status = "MANUAL_METADATA_REVIEW"
        manual = True
        owners.append("root")
        methods.append("archive README/audit metadata/checksum manifest read and checked by root")
    elif rel.startswith("dist/"):
        category = "built_font" if suffix == ".woff2" else "built_javascript" if suffix == ".js" else "built_css" if suffix == ".css" else "built_static_metadata"
        status = "BUILD_REPRODUCED"
        methods.append("unmodified RC3 application independently rebuilt; 281/281 dist files byte-identical")
        evidence += ["evidence/baseline-dist-rebuild.json", "evidence/baseline-build-restored.log"]
        limits.append("Generated/minified/vendor output was checked by build/structure/hash, not manually reviewed line by line; no fresh browser execution implied.")
    elif rel.startswith("src/"):
        category = "runtime_source"
        status = "MANUAL_SOURCE_REVIEW"
        manual = True
        methods.append("runtime source read for correctness, integrity and ownership; relevant baseline/candidate automated suite run")
        evidence += ["evidence/baseline-unit-recheck.log", "evidence/candidate-test.log", "evidence/candidate-typecheck.log", "evidence/candidate-lint.log"]
        if path in core:
            owners.append("core/math reviewer")
            evidence += ["evidence/math_core/coverage.json", "evidence/math_core/CORE_AUDIT.md"]
        if path in render:
            owners.append("render/export reviewer")
            evidence += ["evidence/render_exports/coverage.json", "evidence/render_exports/RENDER_AUDIT.md"]
        if rel in ui_files | ui_core:
            owners.append("UI/storage reviewer")
            evidence.append("evidence/ui_storage/AUDIT_UI_STORAGE.md")
        if rel in root_source:
            owners.append("root; independent UI/storage cross-review")
            evidence += ["evidence/engine-before.log", "evidence/engine-after.log"]
        assert len(owners) > 1, f"No source owner: {path}"
        if rel.endswith("font-coverage.generated.ts"):
            status = "GENERATED_SOURCE_REGENERATED"
            manual = False
            methods.append("font coverage generator reviewed; generated cmap table regenerated and byte-compared")
            evidence.append("evidence/render_exports/font-coverage-regeneration.log")
            limits.append("Generated font range data verified by regeneration, not a manual review of every numeric interval.")
    elif rel.startswith("tests/unit/"):
        category = "unit_test_source"
        status = "AUTOMATED_TEST_EXECUTED"
        methods.append("original 30-file unit suite executed successfully; corresponding candidate suite executed")
        evidence += ["evidence/baseline-unit-recheck.log", "evidence/candidate-test.log"]
        if rel in ui_tests:
            manual = True
            owners.append("UI/storage reviewer")
            evidence.append("evidence/ui_storage/AUDIT_UI_STORAGE.md")
        if path in render:
            manual = True
            owners.append("render/export reviewer")
            evidence.append("evidence/render_exports/coverage.json")
        if rel.startswith("tests/unit/engine/"):
            manual = True
            owners.append("root")
        if manual:
            methods.append("test source manually read in the owning domain")
            status = "MANUAL_REVIEW_AND_TEST_EXECUTED"
        else:
            limits.append("Test suite executed; no claim that every assertion in this file was independently manually reviewed.")
        if rel.endswith("/fx.ts") or rel.endswith("/helpers.ts"):
            category = "test_helper_source"
            methods.append("helper imported by the executed tests; not itself a standalone test case")
    elif rel.startswith("tests/e2e/"):
        category = "browser_test_source"
        status = "MANUAL_SOURCE_REVIEW_NOT_FRESHLY_EXECUTED" if rel in root_e2e or path in render else "STATIC_CHECK_ONLY_NOT_FRESHLY_EXECUTED"
        manual = rel in root_e2e or path in render
        methods.append("included in repository static lint/type checking")
        evidence += ["evidence/baseline-lint.log", "evidence/candidate-lint.log"]
        if rel in root_e2e:
            owners.append("root")
            methods.append("complete runner/helper source manually reviewed")
        if path in render:
            owners.append("render/export reviewer")
            methods.append("complete PDF/stress helper source reviewed")
            evidence += ["evidence/render_exports/coverage.json", "evidence/render_exports/RENDER_AUDIT.md"]
        limits.append("Historical browser results are separate artifacts; current environment did not produce a fresh browser E2E run.")
        if not manual:
            limits.append("Full scenario body has static-check coverage but no recorded complete manual line review.")
    elif rel.startswith("docs/") or rel in {"README.md", "CHANGELOG.md"}:
        category = "documentation"
        manual = rel in ui_docs or rel == "docs/AGENT_RULES.md" or (rel in root_docs and root_docs_complete)
        status = "MANUAL_DOCUMENT_REVIEW" if manual else "DOCUMENT_REVIEW_PENDING_CONFIRMATION"
        methods.append("documentation claims, recovery/compatibility/deployment guidance and limitations read against audit evidence" if manual else "full UTF-8 text check; root complete-read confirmation pending")
        owners.append("UI/storage reviewer" if rel in ui_docs else "root")
        evidence.append("evidence/ui_storage/AUDIT_UI_STORAGE.md" if rel in ui_docs else "evidence/root-doc-review-complete.json")
        limits.append("Old version/test claims in the original are historical, not proof of the repaired candidate.")
    elif rel.startswith("fixtures/"):
        category = "binary_fixture" if suffix in {".png", ".pfproj"} else "test_fixture"
        if suffix == ".pfproj":
            with zipfile.ZipFile(p) as z:
                assert z.testzip() is None
                manifest = json.loads(z.read("manifest.json"))
                checked = []
                for item in manifest["files"]:
                    itemdata = z.read(item["path"])
                    assert hashlib.sha256(itemdata).hexdigest() == item["sha256"]
                    assert len(itemdata) == item["bytes"]
                    checked.append(item["path"])
                structured.append({"path": path, "zipCrc": True, "members": z.namelist(), "manifestChecksums": checked})
            status = "BUNDLE_STRUCTURE_AND_COMPATIBILITY_TESTED"
            manual = True
            methods += ["bundle entries, embedded source/settings/history/manifest read; ZIP CRC and every declared internal hash verified", "legacy bundle exercised by executed rc3-compat unit test"]
            evidence += ["evidence/audit-structure-checks.json", "evidence/baseline-unit-recheck.log", "evidence/candidate-test.log"]
        elif rel in manual_fixture:
            status = "MANUAL_FIXTURE_REVIEW"
            manual = True
            methods.append("fixture text and intended cases read; manifest marks synthetic corpus as input-only")
            owners.append("UI/storage reviewer")
        elif rel in {"fixtures/einstein/chatgpt-katex.html", "fixtures/einstein/chatgpt-conversation.html"}:
            status = "AUTOMATED_FIXTURE_TESTED"
            methods.append("generated HTML fixture exercised by Einstein/clipboard/conversation unit regression suites; generator source reviewed")
            evidence += ["evidence/baseline-unit-recheck.log", "evidence/math_core/final-focused.txt"]
            limits.append("Generated KaTeX markup not manually reviewed element by element; synthetic fixture is not a live provider clipboard capture.")
        else:
            status = "STRUCTURE_VALIDATED"
        if suffix != ".pfproj":
            limits.append("Input fixture inspection does not establish its paginated/visual browser result.")
    elif rel.startswith("evidence/"):
        category = "historical_pdf" if suffix == ".pdf" else "historical_image" if suffix == ".png" else "historical_html" if suffix == ".html" else "historical_report" if suffix == ".json" else "historical_log"
        status = "HISTORICAL_STRUCTURE_INSPECTED"
        methods.append("archive evidence identified as historical and inspected for parseability/provenance only")
        limits.append("Not a fresh RC4 run and not treated as current release proof.")
        if rel == "evidence/pdf/README.txt":
            manual = True
            methods.append("historical PDF description read")
            owners.append("UI/storage reviewer")
        if suffix not in {".json", ".pdf", ".png"}:
            limits.append("No claim of complete semantic revalidation of this historical result/log.")
    elif rel == "package-lock.json":
        category = "dependency_lock"
        status = "DEPENDENCY_STRUCTURE_CHECKED"
        methods += ["lock JSON parsed; clean npm ci reproduced dependencies", "dependency advisory audit executed and lock changes compared; not every dependency source line audited"]
        evidence += ["evidence/baseline-npm-ci.log", "evidence/npm-audit-current.json", "evidence/math_core/CORE_AUDIT.md"]
        limits.append("An advisory scan with zero findings is not proof that dependencies contain no vulnerabilities.")
    elif rel in root_config:
        category = "build_or_hosting_config"
        status = "MANUAL_CONFIG_REVIEW"
        manual = True
        methods.append("configuration/source HTML read by root; build/typecheck/lint exercised relevant configuration")
        owners.append("root")
        evidence += ["evidence/baseline-build-restored.log", "evidence/candidate-typecheck.log", "evidence/candidate-lint.log"]
    elif rel in root_scripts or rel == "scripts/generate-stress.mjs":
        category = "build_or_release_script"
        status = "MANUAL_SOURCE_REVIEW"
        manual = True
        methods.append("complete script source read; actual execution scope is limited to linked logs")
        owners.append("UI/storage reviewer" if rel.endswith("generate-stress.mjs") else "root")
        evidence += ["evidence/baseline-build-restored.log", "evidence/candidate-lint.log"]
    elif rel.startswith(("scripts/licenses/", "public/licenses/", "release/")):
        category = "license_or_sbom"
        status = "PROVENANCE_STRUCTURE_CHECKED"
        methods.append("license/SBOM generation path reviewed; full bytes retained and inventory checked; JSON parsed when applicable")
        evidence += ["evidence/baseline-build-restored.log", "evidence/audit-structure-checks.json"]
        limits.append("Generated notices/dependency entries are not a manual line-by-line license or legal assessment.")
    elif rel == "public/favicon.svg":
        category = "static_icon"
        status = "STRUCTURE_VALIDATED"
        methods.append("SVG XML parse and copied build-byte consistency")
        evidence += ["evidence/archive-safety.json", "evidence/baseline-dist-rebuild.json"]

    if path in binary:
        b = binary[path]
        assert b["pass"]
        methods.append(b["kind"] + " completed successfully")
        evidence.append("evidence/binary-structured-validation.json")
    if path in fonts:
        assert fonts[path]["pass"]
        methods.append("WOFF2 decoded with fontTools; glyph count recorded")
        evidence.append("evidence/font-decode-validation.json")
    if path in pdfs:
        assert pdfs[path]["exit"] == 0
        methods.append("PDF text extraction completed; extracted character count and raw-TeX scan recorded")
        evidence.append("evidence/pdf-text-validation.json")
        limits.append("Text extraction is not proof that every fraction, glyph, image or visual layout is correct.")
    if path in visual:
        v = visual[path]
        assert v["sha256"] == digest
        status = "HISTORICAL_VISUAL_REVIEW_FULL_DOCUMENT" if v["complete"] else "HISTORICAL_VISUAL_REVIEW_SAMPLED"
        methods.append("historical PDF rendered by Poppler at 150 dpi and visually inspected by render/export reviewer: physical pages " + ", ".join(map(str, v["pages"])) + f" of {v['total_pages']}; " + ("complete document" if v["complete"] else "selected-page sample only"))
        evidence += ["evidence/render_exports/pdf-visual-history/FINDINGS.md", "evidence/render_exports/pdf-visual-history/inventory.json", "evidence/render_exports/pdf-visual-history/render-log.json"]
        owners.append("render/export reviewer")
        limits.append("Visual inspection concerns the original archived PDF, never a newly generated RC4 PDF; it found defects rather than certifying every property.")
        if not v["complete"]:
            limits.append("Pages outside the explicit selected-page list were not visually reviewed by this subaudit.")
    if path in manual_test_review:
        review = manual_test_review[path]
        assert review["manual_complete_read"] is True
        assert review["original_sha256"] == digest and review["original_bytes"] == len(data)
        manual = True
        status = review["review_status"]
        owners.append("core/math reviewer")
        methods.append("complete original test/scenario source manually read; exact original hash and byte size match the final test-source review record")
        methods.append(review["execution_note"])
        evidence.append("evidence/math_core/manual-test-review.json")
        evidence.extend(review["evidence"])
        limits = [x for x in limits if x not in {"Test suite executed; no claim that every assertion in this file was independently manually reviewed.", "Full scenario body has static-check coverage but no recorded complete manual line review."}]
    assert status != "INVENTORIED_ONLY", f"Unclassified/unreviewed member: {path}"
    rows.append({"archive_path": path, "size_bytes": len(data), "sha256": digest, "category": category, "review_status": status, "manual_complete_read": manual, "methods": list(dict.fromkeys(methods)), "evidence": list(dict.fromkeys(evidence)), "reviewers": list(dict.fromkeys(owners)), "limitations": limits})

# Additional deterministic provenance checks; these are not legal/visual validation.
repo = ORIGINAL / "repository"
notices = ["public/licenses/THIRD_PARTY_NOTICES.txt", "release/THIRD_PARTY_NOTICES.md", "dist/licenses/THIRD_PARTY_NOTICES.txt"]
assert len({(repo / x).read_bytes() for x in notices}) == 1
assert (repo / "public/licenses/FONT_NOTICES.txt").read_bytes() == (repo / "dist/licenses/FONT_NOTICES.txt").read_bytes()
structured.append({"check": "third-party notices copy equality", "paths": notices, "pass": True})
structured.append({"check": "font notices public/dist copy equality", "pass": True})
manifest = json.loads((repo / "fixtures/korpus/MANIFEST_KORPUS.json").read_text())
for entry in manifest["cases"] + manifest["assets"]:
    data = (repo / "fixtures/korpus" / entry["file"]).read_bytes()
    assert hashlib.sha256(data).hexdigest() == entry["sha256"]
    assert len(data) == entry["bytes"]
structured.append({"check": "corpus manifest original hashes/sizes", "cases": len(manifest["cases"]), "assets": len(manifest["assets"]), "pass": True})

summary = {
    "archive_files": len(archive), "coverage_rows": len(rows), "unique_paths": len(all_archive),
    "all_original_hashes_and_sizes_unchanged": True, "unaccounted_files": [],
    "categories": dict(sorted(Counter(x["category"] for x in rows).items())),
    "statuses": dict(sorted(Counter(x["review_status"] for x in rows).items())),
    "manual_complete_read_count": sum(x["manual_complete_read"] for x in rows),
    "runtime_source_files": sum(x["category"] == "runtime_source" for x in rows),
    "runtime_source_without_recorded_manual_read": [x["archive_path"] for x in rows if x["category"] == "runtime_source" and not x["manual_complete_read"]],
    "test_or_script_files_without_recorded_complete_manual_read": [x["archive_path"] for x in rows if x["category"] in {"unit_test_source", "test_helper_source", "browser_test_source", "build_or_release_script"} and not x["manual_complete_read"]],
    "source_or_tests_without_manual_review_or_fresh_execution": [x["archive_path"] for x in rows if x["review_status"] in {"STATIC_CHECK_ONLY_NOT_FRESHLY_EXECUTED", "DOCUMENT_REVIEW_PENDING_CONFIRMATION"}],
    "font_files_decoded": len(fonts), "png_files_decoded": sum(x["kind"] == "PNG decode" for x in binary.values()), "pdf_files_structurally_parsed_and_text_extracted": len(pdfs),
    "historical_pdf_visual_documents": len(visual), "historical_pdf_visual_pages": sum(len(x["pages"]) for x in visual.values()),
    "historical_pdf_visual_complete_documents": sum(x["complete"] for x in visual.values()),
    "historical_pdf_visual_sampled_documents": sum(not x["complete"] for x in visual.values()),
    "original_dist_files_reproduced": 281,
}
payload = {
    "schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
    "scope": "Every file member of the original 520-file archive. Hashes describe original, not repaired candidate bytes.",
    "review_semantics": "Statuses describe methods actually used, not release PASS. Complete inventory does not mean every vendor/generated byte was manually reviewed or every browser flow freshly executed.",
    "summary": summary, "files": rows,
}
(EVIDENCE / "audit-file-coverage.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
(EVIDENCE / "audit-structure-checks.json").write_text(json.dumps(structured, ensure_ascii=False, indent=2) + "\n")
columns = ["archive_path", "size_bytes", "sha256", "category", "review_status", "manual_complete_read", "methods", "evidence", "reviewers", "limitations"]
with (EVIDENCE / "audit-file-coverage.csv").open("w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=columns)
    writer.writeheader()
    for row in rows:
        writer.writerow({k: "; ".join(v) if isinstance(v, list) else v for k, v in row.items()})
print(json.dumps(summary, ensure_ascii=False, indent=2))
