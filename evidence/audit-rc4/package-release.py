from pathlib import Path
import shutil,zipfile,hashlib,json,subprocess,re,datetime
b=Path('/workspace/scratch/69a766e93112/paperforma_rc3_review');c=b/'candidate';ev=b/'evidence'
summary=json.loads((ev/'release-summary.json').read_text());clean=json.loads((ev/'cleanroom/result.json').read_text());assert clean['pass']
qa=json.loads((ev/'render_exports/audit-report-qa.json').read_text());assert qa['keyFactsVerified'] and not qa['offPageTextBoxes']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(c/'docs/AUDIT_RC4.pdf')==qa['sha256']
for p in [c/'dist.build-manifest.json',c/'dist-qa.build-manifest.json',c/'evidence/release-gate.json',c/'evidence/http-verification.json',c/'evidence/secret-scan.json']:
    shutil.copy2(p,ev/p.name)
# Record every first-party code/config/test change separately from generated builds and reports.
changes=[];original=b/'original/repository'
for top in ['src','tests','scripts','public','fixtures']:
    old={p.relative_to(original).as_posix():p for p in (original/top).rglob('*') if p.is_file()}
    new={p.relative_to(c).as_posix():p for p in (c/top).rglob('*') if p.is_file()}
    for name in sorted(set(old)|set(new)):
        h1=sha(old[name]) if name in old else None;h2=sha(new[name]) if name in new else None
        if h1!=h2:changes.append({'path':name,'before':h1,'after':h2,'status':'added' if h1 is None else 'removed' if h2 is None else 'modified'})
for name in ['index.html','package.json','package-lock.json','.gitattributes','.gitignore']:
    old=original/name;new=c/name
    h1=sha(old) if old.exists() else None;h2=sha(new) if new.exists() else None
    if h1!=h2:changes.append({'path':name,'before':h1,'after':h2,'status':'added' if h1 is None else 'modified'})
(ev/'source-changes.json').write_text(json.dumps({'scope':'First-party source/config/test/fixture changes; documentation and generated dist have separate inventories','files':changes},indent=2)+'\n')
root=b/'release-stage';root.mkdir(exist_ok=False)
repo=root/'repository'
shutil.copytree(c,repo,ignore=shutil.ignore_patterns('node_modules','dist-qa','__pycache__','*.pyc','*.private','.core-bench-*','.gate-tmp'))
shutil.copytree(ev,repo/'evidence/audit-rc4',ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.private'))
readme=f'''# PaperForma 3.0.0-rc.4 — paket hasil audit\n\nMulai dari `repository/docs/AUDIT_RC4.pdf` (laporan 7 halaman) atau `repository/docs/AUDIT_RC4.md`. Inventaris audit mencakup 520 file ZIP asli; source aplikasi dan tes telah diperbaiki.\n\n**Status: kandidat untuk repository dan staging. Browser/PDF baru serta deployment Cloudflare pemilik belum terverifikasi.** Hasil lama RC3 dipisahkan dari bukti baru.\n\n## Untuk melihat hasil rumus\n\nBuka `repository/examples/TRIGONOMETRI_markdown.html` atau `TRIGONOMETRI_clipboard-html.html`. Keduanya ekspor API aktual dengan 21 formula dan font tersemat. Untuk menguji aplikasinya, buka `repository/fixtures/trigonometry/trigonometry.md` melalui tombol Buka berkas. Widget/grafik yang tidak ikut tersalin tidak dikarang.\n\n## GitHub dan Cloudflare Pages\n\nSalin **isi `repository/`** ke root checkout sehingga package.json berada di root; pertahankan .git dari checkout Anda. Jangan publish root source atau dist-qa.\n\nNode: 24.22.3. npm: >=11.6.0 <12 (audit memakai 11.19.1).\n\n```bash\nnpm ci\nnpm run typecheck\nnpm run lint\nnpm test\nnpm run build\nnpm run verify:http -- --local\n```\n\nPages: `NODE_VERSION=24.22.3`, build command `npm run build`, output `dist`. Setelah preview aktif, jalankan verify:http dan verify:deployment ke URL nyata; perintah kedua membutuhkan browser lokal. Panduan lengkap: repository/docs/DEPLOY_CLOUDFLARE.md.\n\n## Hasil aktual\n\n332 tes Vitest +8 tes Node lulus; build prod/QA, 13 kasus gate (12 mutasi ditolak),285 pemeriksaan HTTP lokal lulus. Rekonstruksi clean-room menghasilkan281 berkas dist identik. Laporan performa menyertakan seluruh sampel dan p95, termasuk skenario yang tidak membaik. E2E baru gagal diluncurkan karena izin lingkungan dan diberi BLOCKED_BY_ENVIRONMENT, bukan PASS.\n\nKandidat: `{summary['candidateSha256']}`.\nDist: `{summary['distTreeSha256']}`.\n\n`SHA256SUMS` memuat seluruh file selain dirinya sendiri. `AUDIT_ZIP.json` menjelaskan pengikatan paket ke kandidat yang diuji. Hash ZIP keseluruhan diberikan di pesan pengiriman, tidak dimasukkan ke dirinya sendiri.\n'''
(root/'README_RILIS.md').write_text(readme)
fingerprint=json.loads(subprocess.check_output(['node','scripts/fingerprint.mjs'],cwd=repo,text=True))
assert fingerprint['candidateSha256']==summary['candidateSha256'] and fingerprint['distTreeSha256']==summary['distTreeSha256']
# Compare all dist bytes to the independent clean-room output.
def tree(p):return {f.relative_to(p).as_posix():sha(f) for f in p.rglob('*') if f.is_file()}
assert tree(repo/'dist')==tree(b/'cleanroom-rc4-confirmed/repository/dist')
# Pattern scan includes audit logs and docs. It is not a universal secret detector.
rules={'private-key':re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----'),'aws-key':re.compile(r'\bAKIA[0-9A-Z]{16}\b'),'github-token':re.compile(r'\bgh[pousr]_[A-Za-z0-9]{36,}\b'),'slack-token':re.compile(r'\bxox[abpr]-[A-Za-z0-9-]{10,}'),'assigned-secret':re.compile(r'''(?:SESSION_SECRET|ADMIN_TOKEN|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|API_KEY)\s*[:=]\s*['"][^'"\s]{16,}['"]''')}
findings=[];scanned=0
for p in root.rglob('*'):
    if not p.is_file():continue
    try:text=p.read_text('utf-8')
    except UnicodeError:continue
    scanned+=1
    for kind,pattern in rules.items():
        for match in pattern.finditer(text):
            if 'not-for-production' in match.group() or 'test-session-secret' in match.group() or 'test-admin-token' in match.group():continue
            findings.append({'file':p.relative_to(root).as_posix(),'rule':kind})
if findings:raise RuntimeError('Potential secret patterns; inspect paths privately: '+json.dumps(findings))
files=[p for p in root.rglob('*') if p.is_file()]
audit={'version':summary['version'],'status':'AUDITED_CANDIDATE_NOT_GENERAL_PRODUCTION_APPROVED','sourceArchive':summary['input_archive'],'candidateSha256':summary['candidateSha256'],'distTreeSha256':summary['distTreeSha256'],'cleanroomSourceAndDistVerified':True,'cleanroomDistFiles':281,'cleanroomEvidence':'repository/evidence/audit-rc4/cleanroom/result.json','qaBuildIncluded':False,'tests':summary['tests'],'browserE2E':'BLOCKED_BY_ENVIRONMENT','nativePdf':'NOT_RUN','cloudflareOwner':'NOT_RUN','packageFileCount':len(files)+2,'checksumCount':len(files)+1,'patternSecretScan':{'filesScanned':scanned,'findings':findings,'scope':'UTF-8 files in final tree, including audit logs/docs; selected patterns, not universal detection'},'reportPdf':{'path':'repository/docs/AUDIT_RC4.pdf','sha256':qa['sha256'],'pages':len(qa['pages'])},'reproducibility':'A candidate source/dist ZIP was independently installed, tested and rebuilt before final reports/evidence were added. Final staged source fingerprint and all281 dist hashes equal that validated candidate. Final container is extracted and checked separately; no self-referential checksum.'}
(root/'AUDIT_ZIP.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
paths=sorted(p for p in root.rglob('*') if p.is_file())
(root/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(root).as_posix()}\n' for p in paths))
output=Path('/workspace/scratch/69a766e93112/outputs');output.mkdir(exist_ok=True)
zip_path=output/'PAPERFORMA_STATIC_3.0.0-rc.4_AUDITED_DEPLOY.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(root.rglob('*')):
        if p.is_file():
            info=zipfile.ZipInfo(p.relative_to(root).as_posix(),date_time=(2026,11,21,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(0o100644<<16);z.writestr(info,p.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
# Final actual ZIP is independently extracted; checksum inventory and candidate identities rechecked.
verify=b/'final-zip-extracted';verify.mkdir(exist_ok=False)
with zipfile.ZipFile(zip_path) as z:
    assert z.testzip() is None
    names=z.namelist();assert len(names)==len(set(names)) and len(names)==audit['packageFileCount']
    assert all(not n.startswith('/') and '..' not in Path(n).parts for n in names)
    z.extractall(verify)
count=0
for line in (verify/'SHA256SUMS').read_text().splitlines():
    digest,name=line.split('  ',1);assert sha(verify/name)==digest,name;count+=1
assert count==audit['checksumCount']
actual=json.loads(subprocess.check_output(['node','scripts/fingerprint.mjs'],cwd=verify/'repository',text=True))
assert actual==fingerprint
assert tree(verify/'repository/dist')==tree(b/'cleanroom-rc4-confirmed/repository/dist')
r={'file':str(zip_path),'bytes':zip_path.stat().st_size,'sha256':sha(zip_path),'files':len(names),'checksumsVerified':count,'candidateSha256':actual['candidateSha256'],'distTreeSha256':actual['distTreeSha256'],'distFiles':281,'allChecksumsMatch':True,'actualZipExtracted':True,'finalSourceAndDistMatchCleanroom':True,'noNodeModules':not any('/node_modules/' in n for n in names),'noQaBuild':not any('/dist-qa/' in n for n in names),'reportPdfSha256':qa['sha256']}
(b/'final-delivery.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
