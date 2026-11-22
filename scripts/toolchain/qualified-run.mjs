// Recreate and probe the complete PDF verifier before using the production gates.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from '../fingerprint.mjs';

export function runQualified(mode = 'verify') {
  if (!['verify', 'check', 'acceptance-tests'].includes(mode)) throw new Error('Unknown verifier mode');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
  const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
  const [npmMajor, npmMinor] = npmVersion.split('.').map(Number);
  if (process.versions.node !== pkg.engines.node || npmMajor !== 11 || npmMinor < 6) {
    throw new Error(`Verifier requires Node ${pkg.engines.node} and npm ${pkg.engines.npm}. Found ${process.version}, npm ${npmVersion}.`);
  }
  console.log(`Node ${process.version}; npm ${npmVersion}`);
  const work = mkdtempSync(join(tmpdir(), 'paperforma-verifier-'));
  const prefix = join(work, 'install');
  try {
    execFileSync(process.env.PF_PYTHON || 'python3', ['scripts/toolchain/provision.py', prefix], { cwd: root, stdio: 'inherit' });
    const bin = join(prefix, 'env', 'bin');
    // A trailing host directory must not override the locked GNU/Python tools.
    const env = { ...process.env, PATH: bin + delimiter + process.env.PATH,
      PF_PYTHON: join(bin, 'python'), PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1', LC_ALL: 'C.UTF-8' };
    delete env.PYTHONPATH;
    delete env.PYTHONHOME;
    const options = { cwd: root, stdio: 'inherit', env };
    execFileSync(env.PF_PYTHON, ['-I', 'scripts/toolchain/check.py', '--prefix', join(prefix, 'env')], options);
    if (mode === 'verify') execFileSync(process.execPath, ['scripts/verify-all-gates.mjs'], options);
    if (mode === 'acceptance-tests') execFileSync('npm', ['run', 'test:acceptance'], options);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runQualified(process.argv[2]);
}
