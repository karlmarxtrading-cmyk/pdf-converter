"""Validate release entry points, archive contents, and active documentation links."""
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

root = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[2]
active = ['README.md','README_MULAI_DI_SINI.md','docs/ACCEPTANCE.md','docs/RELEASE_ACCEPTANCE.md',
          'docs/PERFORMANCE_REPORT.md','docs/TESTING.md','docs/KNOWN_LIMITS.md','docs/COMPATIBILITY_RC12.md',
          'docs/RELEASE_REPORT.md','docs/DEPLOYMENT.md','docs/DEPLOY_CLOUDFLARE.md','docs/RECOVERY.md']
pkg = json.loads((root/'package.json').read_text())
if pkg['version'] != '3.0.0-rc.12' or pkg['scripts']['verify:release'] != 'node scripts/verify-all-gates.mjs':
    raise ValueError('Active release settings differ from documentation')
issues, commands, references = [], set(), 0
for name in active:
    file = root/name
    text = file.read_text()
    for cmd in re.findall(r'npm run ([a-z][a-z0-9:-]*)', text):
        commands.add(cmd)
        if cmd not in pkg['scripts']:
            issues.append((name,'unknown npm script',cmd))
    if re.search(r'npm test\s+--',text):
        issues.append((name,'chained test CLI','use separate Vitest command'))
    for target in re.findall(r'\[[^\]\n]+\]\(([^)\s]+)\)', text):
        if target.startswith(('https://','http://','#')):
            continue
        path = (file.parent/unquote(target.split('#')[0])).resolve()
        if not path.is_relative_to(root) or not path.exists():
            issues.append((name,'missing local target',target))
        references += 1
print(json.dumps({'version':pkg['version'], 'documents':len(active),'relativeLinks':references,
                  'npmScripts':sorted(commands),'problems':issues,'status':'FAIL' if issues else 'PASS'}))
sys.exit(bool(issues))
