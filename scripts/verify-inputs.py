"""Validate the authenticated RC6, RC7 and RC7 audit archives without modifying them."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
from zipfile import ZipFile

EXPECTED = {
    'rc6': ('82e6d021c1b042a498440c0ce8957c035eb011f4c1b1fe8c16a450697a52be53', 'SHA256SUMS'),
    'rc7': ('2dc30a40212a2b41bbc98e44fb91ae61154b0a79ae8f275bcdcafa5402b98206', 'SHA256SUMS'),
    'audit': ('f1ac3a44fd5a6efa5d00ad5aa987521bce133d25d7eb4cce54666732361487f0', 'SHA256SUMS_AUDIT.txt'),
}
def digest(data):
    return hashlib.sha256(data).hexdigest()

def check(path, sha, sums):
    if digest(path.read_bytes()) != sha:
        raise ValueError(f'Unexpected input SHA-256 for {path.name}')
    with ZipFile(path) as archive:
        names = [item.filename for item in archive.infolist() if not item.is_dir()]
        if (len(names) != len({name.casefold() for name in names})
                or any(PurePosixPath(n).is_absolute() or '..' in PurePosixPath(n).parts or ':' in n or chr(92) in n for n in names)
                or any(stat.S_ISLNK(item.external_attr >> 16) for item in archive.infolist()) or archive.testzip()):
            raise ValueError(f'Invalid archive structure in {path.name}')
        lines = archive.read(sums).decode('utf-8-sig').splitlines()
        checks = {name: value for value, name in (line.split('  ', 1) for line in lines)}
        if len(lines) != len(checks) or {n: digest(archive.read(n)) for n in names if n != sums} != checks:
            raise ValueError(f'Internal checksum inventory differs in {path.name}')
        return {'filename':path.name,'sha256':sha,'bytes':path.stat().st_size,'files':len(names),'verifiedChecksums':len(lines),'pathsAndCRC':'PASS'}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in EXPECTED:parser.add_argument(name,type=Path)
    args=parser.parse_args()
    records={name:check(getattr(args,name),*values) for name,values in EXPECTED.items()}
    with ZipFile(args.audit) as a, ZipFile(args.rc7) as z:
        receipt=json.loads(a.read('input/VERIFIKASI_PAPERFORMA_RC7.json'))
        assert receipt['archive']['zipSha256']==records['rc7']['sha256']
        source=z.read('fixtures/rc6/user-trigonometry.md')
        accepted=z.read('examples/reference-rc6/RUMUS TRIGONOMETRI 1.html')
        assert len(source)==15280 and digest(source)=='1f4b9345ef5a092c40e66290821f110cee2656a093a889c0f51800bdd54bb16f'
        assert digest(accepted)==receipt['originalRC6']['acceptedHtmlSha256']=='a82ecec4f37617d9730b1aeaf427c446c1e0f1acaa3ea9ffa37372f0126108ff'
        assert receipt['originalRC6']['zipSha256']==records['rc6']['sha256']
    print(json.dumps({'status':'PASS','inputs':records,'fixtureBytes':len(source),'fixtureSha256':digest(source),'originalHtmlSha256':digest(accepted)},indent=2))

if __name__=='__main__':
    main()
