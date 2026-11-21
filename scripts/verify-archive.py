"""Verify the delivered ZIP and rebuild its production tree in a clean directory.

  python scripts/verify-archive.py ../PAPERFORMA_STATIC_3.0.0-rc.5.zip
  python scripts/verify-archive.py ../PAPERFORMA_STATIC_3.0.0-rc.5.zip --offline

Requires the Node/npm versions specified by package.json. With --offline, npm's
package cache must already contain every locked package for the local platform.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import tempfile
import zipfile


def digest(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def inventory(folder):
    return {f.relative_to(folder).as_posix(): digest(f)
            for f in sorted(folder.rglob('*')) if f.is_file()}


def validate_names(archive):
    names = set()
    for info in archive.infolist():
        path = PurePosixPath(info.filename)
        if (path.is_absolute() or '..' in path.parts or ':' in info.filename
                or '\\' in info.filename or stat.S_ISLNK(info.external_attr >> 16)
                or info.filename.casefold() in names):
            raise ValueError(f'Invalid release ZIP entry: {info.filename}')
        names.add(info.filename.casefold())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    archive_path = args.archive.resolve(strict=True)
    npm = shutil.which('npm')
    if npm is None:
        raise RuntimeError('npm is required')
    with tempfile.TemporaryDirectory(prefix='paperforma-verify-') as temp:
        root = Path(temp)
        with zipfile.ZipFile(archive_path) as archive:
            validate_names(archive)
            archive.extractall(root)
        listed = {}
        for line in (root / 'SHA256SUMS').read_text('utf-8').splitlines():
            hexdigest, filename = line.split('  ', maxsplit=1)
            if filename in listed:
                raise ValueError(f'Duplicate checksum: {filename}')
            listed[filename] = hexdigest
        actual = inventory(root)
        del actual['SHA256SUMS']
        if listed != actual:
            raise ValueError('ZIP contents differ from SHA256SUMS')
        pristine = inventory(root / 'dist')
        saved_manifest = (root / 'dist.build-manifest.json').read_bytes()
        # Force a fresh output; never let stale files satisfy the comparison.
        shutil.rmtree(root / 'dist')
        (root / 'dist.build-manifest.json').unlink()
        command = ['ci', '--no-audit', '--no-fund']
        if args.offline:
            command.append('--offline')
        steps = [command, ['run', 'typecheck'], ['run', 'lint'], ['test'],
                 ['run', 'build'], ['run', 'verify:http', '--', '--local']]
        for step in steps:
            subprocess.run([npm, *step], cwd=root, check=True)
        if inventory(root / 'dist') != pristine:
            raise ValueError('Rebuilt dist differs from the ZIP')
        if (root / 'dist.build-manifest.json').read_bytes() != saved_manifest:
            raise ValueError('Rebuilt production manifest differs from the ZIP')
        print(json.dumps({'archive': archive_path.name, 'zipBytes': archive_path.stat().st_size,
                          'zipSha256': digest(archive_path), 'verifiedChecksums': len(listed),
                          'identicalDistFiles': len(pristine),
                          'build': json.loads(saved_manifest), 'status': 'PASS'}))


if __name__ == '__main__':
    main()
