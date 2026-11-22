"""Produce a source + static site archive with an exhaustive checksum inventory."""
import argparse
import hashlib
import os
import tempfile
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
DIRS = ('src','scripts','public','release','dist','fixtures','tests','examples','docs','evidence')
FILES = ('.gitattributes','.gitignore','.node-version','.npmrc','.oxlintrc.json',
         'package.json','package-lock.json','index.html','print.html','vite.config.ts',
         'vitest.config.ts','tsconfig.json','CHANGELOG.md','README.md','README_MULAI_DI_SINI.md',
         'dist.build-manifest.json')
def project_files():
    result={name:ROOT/name for name in FILES}
    for name in DIRS:
        for file in sorted((ROOT/name).rglob('*')):
            if file.is_symlink(): raise ValueError(f'Unexpected symbolic link: {file}')
            if not file.is_file() or '__pycache__' in file.parts: continue
            rel=file.relative_to(ROOT)
            if file.suffix in ('.pyc','.tmp','.crdownload'): continue
            # Runtime raster previews are local QA aids. Source PDF and machine
            # checks are part of the deliverable. Preserve original RC5 references.
            if rel.parts[0]=='evidence' and rel.parts[1] not in ('rc5','rc9','rc10','rc11','rc12') and file.suffix.lower() in ('.png','.jpg','.jpeg'): continue
            result[rel.as_posix()]=file
    return result
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    output=args.output.resolve()
    if ROOT==output.parent or ROOT in output.parents:raise ValueError('Use a destination outside the release tree')
    output.parent.mkdir(parents=True,exist_ok=True)
    entries=project_files()
    checks=[]
    fd,tmp=tempfile.mkstemp(prefix='.paperforma-',suffix='.zip',dir=output.parent)
    os.close(fd)
    def write(z,path,data):
        item=ZipInfo(path,date_time=(2026,11,22,0,0,0))
        item.external_attr=0o100644<<16
        z.writestr(item,data,compress_type=ZIP_DEFLATED,compresslevel=6)
    try:
        with ZipFile(tmp,'w') as z:
            for name,file in sorted(entries.items()):
                data=file.read_bytes()
                checks.append(hashlib.sha256(data).hexdigest()+'  '+name+'\n')
                write(z,name,data)
            write(z,'SHA256SUMS',''.join(checks).encode())
        os.replace(tmp,output)
    finally:
        Path(tmp).unlink(missing_ok=True)
    print(f'{output.name} {output.stat().st_size} bytes, {len(checks)} checksums, SHA256 {hashlib.sha256(output.read_bytes()).hexdigest()}')
if __name__=='__main__':main()
