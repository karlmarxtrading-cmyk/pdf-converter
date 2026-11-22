"""Validate final downloaded HTML against explicit fixture and accepted math branches."""
import importlib.util
import json
from pathlib import Path
import sys
from lxml import html

root = Path.cwd()
spec = importlib.util.spec_from_file_location('baseline_oracle', root / 'scripts/verify-trigonometry.py')
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
reference = root / 'examples/reference-rc6/RUMUS TRIGONOMETRI 1.html'
expected = json.loads((root / 'fixtures/rc6/user-trigonometry.expected.json').read_text())['formulas']
reference_summary = oracle.summarize(reference, expected)
if reference_summary['sha256'] != 'a82ecec4f37617d9730b1aeaf427c446c1e0f1acaa3ea9ffa37372f0126108ff':
    raise ValueError('Accepted HTML reference changed')


def branches(path):
    doc = html.fromstring(path.read_bytes().decode('utf-8'))
    nodes = doc.xpath('//*[contains(concat(" ", normalize-space(@class), " "), " pf-math ")]')
    result = []
    for node in nodes:
        formula = []
        for name in ['katex-html', 'katex-mathml']:
            sub, = node.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), $class)]', **{'class': ' '+name+' '})
            # Attribute order is immaterial. MathML structure/content and visual
            # glyphs/placement classes/styles are compared, not merely counted.
            def tree(e):
                return (e.tag, sorted(e.attrib.items()), e.text, [(tree(child), child.tail) for child in e])
            formula.append(tree(sub))
        result.append(formula)
    return result


expected_branches = branches(reference)
if len(expected_branches) != 231 or len(sys.argv) != 5:
    raise ValueError('Four trigonometry downloads required')
seen = set()
version = json.loads((root / 'package.json').read_text())['version']
for file in sys.argv[1:]:
    p = Path(file)
    data = oracle.summarize(p, expected)
    if not (all(data['checks'].values()) and data['generator'].startswith('PaperForma '+version+' (')
            and data['bodyDigest'] == reference_summary['bodyDigest']
            and data['title'] == reference_summary['title']
            and data['payloadRecoveries'] == 17 and branches(p) == expected_branches
            and (data['template'] != 'BUS-01' or data['tocLinks'] == 22)):
        raise ValueError(f'Download differs from formula/structure oracle: {file}')
    seen.add(data['template'])
if seen != {'BUS-01','EDU-01','EDT-01','CON-01'}:
    raise ValueError('Four distinct templates required')
