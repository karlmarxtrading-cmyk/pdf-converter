"""From the project root. Read actual HTML downloads from the production UI, run independent oracles, compare layout and complete KaTeX subtrees."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from lxml import html


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fingerprint():
    result = subprocess.check_output(['node', 'scripts/fingerprint.mjs'], text=True)
    return json.loads(result)


def class_contains(token):
    return 'contains(concat(" ",normalize-space(@class)," ")," '+token+' ")'


def tree(element):
    # Keep tag, every attribute, text, child order, and interleaved tail whitespace.
    # Attribute order in serialized HTML/MathML has no bearing on rendered content.
    return [element.tag, sorted(element.attrib.items()), element.text or '', [[tree(c), c.tail or ''] for c in element if isinstance(c.tag, str)]]


def branches(path):
    document = html.fromstring(path.read_bytes().decode('utf-8'))
    formulas = document.xpath('//article//*['+class_contains('pf-math')+']')
    representations = []
    for node in formulas:
        visual, = node.xpath('.//*['+class_contains('katex-html')+']')
        semantic, = node.xpath('.//math')
        representations.append([tree(visual), tree(semantic)])
    css, = document.xpath('//style[@data-pf="s0"]/text()')
    return representations, css


def main():
    opts=argparse.ArgumentParser(description=__doc__)
    opts.add_argument('--examples',type=Path,default=Path('examples/rc9/html'))
    opts.add_argument('--evidence',type=Path,default=Path('evidence/rc9/browser/results'))
    args=opts.parse_args()
    args.examples.mkdir(parents=True,exist_ok=True);args.evidence.mkdir(parents=True,exist_ok=True)
    before=fingerprint()
    expected_path=Path('fixtures/rc6/user-trigonometry.expected.json')
    expected=json.loads(expected_path.read_text())
    fixture_path=Path('fixtures/rc6/user-trigonometry.md')
    assert digest(fixture_path.read_bytes())==expected['input_sha256']=='1f4b9345ef5a092c40e66290821f110cee2656a093a889c0f51800bdd54bb16f'
    ref_path=Path('examples/reference-rc6/RUMUS TRIGONOMETRI 1.html')
    assert digest(ref_path.read_bytes())=='a82ecec4f37617d9730b1aeaf427c446c1e0f1acaa3ea9ffa37372f0126108ff'
    original,rc6_css=branches(ref_path)
    with tempfile.TemporaryDirectory(prefix='paperforma-trig-') as tmp:
        child=subprocess.run(['node','tests/e2e/rc7-output.mjs'],env=dict(os.environ,PF_OUTPUT_DIR=tmp))
        report=json.loads((Path(tmp)/'browser.json').read_text())
        paths=[]
        for rec in report['records']:
            src=Path(tmp)/(rec['template']+'.html')
            if src.exists():
                dst=args.examples/(rec['template']+'.html')
                shutil.copyfile(src,dst)
                paths.append(dst)
        assert len(paths)==len(report['records'])==4 and child.returncode==0,report
    proc=subprocess.run(['python','scripts/verify-trigonometry.py',*[str(x) for x in paths]],capture_output=True,text=True,check=True)
    semantic=json.loads(proc.stdout);assert semantic['passChecks']
    assert all(record['payloadRecoveries']==17 for record in semantic['candidates'])
    (args.evidence/'oracle.json').write_text(json.dumps(semantic,ensure_ascii=False,indent=2)+'\n')
    css_sha=digest(rc6_css.encode());assert len(rc6_css.encode())==19710
    binary=os.environ.get('PF_CHROME') or os.environ.get('CHROME_PATH')
    report['browserBinarySha256']=digest(Path(binary).read_bytes()) if binary else None
    report['fixtureOracleInputHash']=digest(expected_path.read_bytes())
    report['reference']={'path':str(ref_path),'sha256':digest(ref_path.read_bytes()),'oracleSha256':digest(expected_path.read_bytes()),'cssSha256':css_sha}
    report['sourceFixture']={'path':str(fixture_path),'bytes':fixture_path.stat().st_size,'sha256':expected['input_sha256']}
    for rec,path in zip(report['records'],paths,strict=True):
        rendered,css=branches(path)
        differences=[i+1 for i,items in enumerate(zip(original,rendered,strict=True)) if items[0]!=items[1]]
        rec['sha256Verified']=digest(path.read_bytes())==rec['sha256'];rec['file']=path.as_posix()
        rec['cssSha256']=digest(css.encode());rec['cssMatchesOriginal']=rec['cssSha256']==css_sha
        rec['rc6VisualAndMathMLSiblingsCompared']=len(rendered);rec['differentBranchPairs']=differences
        if differences or not rec['cssMatchesOriginal'] or not rec['sha256Verified']:rec['status']='FAIL'
    after=fingerprint();report['identityBefore']=before;report['identityAfter']=after
    report['derivation']='Literal SHA-256 over file bytes, full DOM trees of every KaTeX visual branch and MathML (including attributes and text) compared against the accepted user BUS-01 HTML, independent expected raw/canonical/display/annotation array and semantic block tree. Native office print and screen reader speech are separate gates.'
    report['sameBytes']=before==after
    report['status']='PASS' if before==after and all(r['status']=='PASS' for r in report['records']) else 'FAIL'
    (args.evidence/'trigonometry-downloads.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'outputs':[(r['template'],r['status'],len(r['differentBranchPairs'])) for r in report['records']]}))
    if report['status']!='PASS':raise SystemExit(1)


if __name__=='__main__':
    main()
