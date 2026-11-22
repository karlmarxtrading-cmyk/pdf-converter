"""Create the Pages verifier in a fresh user-owned prefix (Linux x86_64)."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile
import time
from urllib.request import urlopen

LOCK = Path(__file__).with_name('linux-64.lock.json')


def fetch(url, dest, record):
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            digest = hashlib.sha256()
            size = 0
            with urlopen(url, timeout=90) as response, dest.open('wb') as out:
                for block in iter(lambda: response.read(1024 * 1024), b''):
                    size += len(block)
                    if size > record['size']:
                        raise ValueError(f'{dest.name} exceeds locked size')
                    out.write(block)
                    digest.update(block)
            if size != record['size'] or digest.hexdigest() != record['sha256']:
                raise ValueError(f'Checksum or length mismatch for {dest.name}')
            return dest
        except OSError:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def provision(target):
    if platform.system() != 'Linux' or platform.machine() not in ('x86_64', 'AMD64'):
        raise SystemExit('Pages provisioning requires Linux x86_64. For native Windows see docs/TOOLCHAIN.md.')
    target.mkdir(mode=0o700)
    lock = json.loads(LOCK.read_bytes())
    print('Bootstrap lock SHA-256:', hashlib.sha256(LOCK.read_bytes()).hexdigest(), flush=True)
    def package(row):
        return fetch(lock['channel'] + row['path'], target / 'downloads' / row['path'], row)
    archive = package(lock['bootstrap'])
    executable = target / 'micromamba'
    with tarfile.open(archive, 'r:bz2') as tar:
        entry = tar.getmember('bin/micromamba')
        if not entry.isfile():
            raise ValueError('Expected a regular bootstrap executable')
        with tar.extractfile(entry) as src, executable.open('xb') as dst:
            shutil.copyfileobj(src, dst)
    executable.chmod(0o700)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        paths = list(pool.map(package, lock['packages']))
    wheel = lock['wheel']
    wheel_path = fetch(wheel['url'], target / 'downloads' / wheel['url'].split('/')[-1], wheel)
    spec = target / 'explicit.txt'
    spec.write_text('@EXPLICIT\n' + ''.join(path.as_uri() + '#' + row['sha256'] + '\n'
                    for path, row in zip(paths, lock['packages'])))
    env = os.environ.copy()
    env.update(PYTHONNOUSERSITE='1', PIP_CONFIG_FILE=os.devnull)
    env.pop('PYTHONPATH', None)
    prefix = target / 'env'
    subprocess.run([str(executable), '--no-rc', 'create', '-y', '--offline',
                    '-r', str(target / 'cache'), '-p', str(prefix), '-f', str(spec)],
                   env=env, check=True)
    subprocess.run([str(prefix / 'bin/python'), '-I', '-m', 'pip', 'install',
                    '--isolated', '--disable-pip-version-check', '--no-index', '--no-deps',
                    str(wheel_path)], env=env, check=True)
    print('Installed locked packages:', len(paths), '+ 1 Python wheel', flush=True)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 scripts/toolchain/provision.py NEW_DIRECTORY')
    provision(Path(sys.argv[1]).resolve())
