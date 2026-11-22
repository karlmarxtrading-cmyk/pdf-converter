"""Independent HTML byte audit using Python and lxml. Run from the project root."""
import argparse
import base64
from hashlib import sha256
import json
from pathlib import Path
import re
from urllib.parse import unquote

from lxml import html


def digest(data):
    return sha256(data).hexdigest()


def classes(node):
    return set(node.get('class', '').split())


def semantic_tree(node):
    """Preserve the hierarchy and interleaved prose, ignoring style and generated navigation."""
    if 'pf-math' in classes(node):
        return ['math', node.get('data-source-tex'), node.get('data-tex'),
                'display' if 'pf-math-display' in classes(node) else 'inline']
    children = [node.text or '']
    for child in node:
        if isinstance(child.tag, str) and child.get('data-pf-generated') is None:
            children.append(semantic_tree(child))
        children.append(child.tail or '')
    attrs = {key: value for key, value in node.attrib.items()
             if key in ('alt', 'title', 'href', 'src', 'colspan', 'rowspan')}
    return [node.tag, attrs, children]


def summarize(path, expected):
    data = path.read_bytes()
    doc = html.fromstring(data.decode('utf-8'))
    article, = doc.xpath('//article[@data-template]')
    nodes = [n for n in article.iter() if 'pf-math' in classes(n)]
    formulas = [(n.get('data-source-tex'), n.get('data-tex'), 'pf-math-display' in classes(n),
                 n.xpath('.//annotation[@encoding="application/x-tex"]/text()')) for n in nodes]
    target = [(r['raw'], r['expected'], r['display'], [r['expected']]) for r in expected]
    ids = doc.xpath('//*[@id]/@id')
    hrefs = [unquote(h[1:]) for h in doc.xpath('//a[starts-with(@href,"#")]/@href')]
    css = ''.join(doc.xpath('//style[@data-pf="s0"]/text()'))
    fonts = ''.join(doc.xpath('//style[@data-pf="fonts"]/text()'))
    blobs = [base64.b64decode(x, validate=True) for x in re.findall(r'data:font/woff2;base64,([A-Za-z0-9+/=]+)', fonts)]
    assets = doc.xpath('//*[@src]/@src | //link/@href')
    styles = ''.join(doc.xpath('//style/text()'))
    font_hashes = {digest(f.read_bytes()) for f in Path('dist/assets').glob('*.woff2')}
    rules = {names: decl for names, decl in re.findall(r'([^{}]+)\{([^{}]*)\}', css)}
    selection = {'.katex .vlist-t': 'display:inline-table', '.katex .mfrac .frac-line': 'border-bottom-style:solid',
                 '.katex .katex-mathml': 'position:absolute', '.katex-display': 'display:block'}
    css_ok = all(decl in rules.get(selector, '') for selector, decl in selection.items())
    structural = semantic_tree(article)
    # The generated TOC and newlines between article blocks vary by template.
    # Keep exact text and inline whitespace throughout each content block.
    structural[2] = [entry for entry in structural[2]
                     if not isinstance(entry, str) or entry.strip()]
    tree_digest = digest(json.dumps(structural, ensure_ascii=False).encode())
    counts = dict(blocks=len(article.xpath('.//*[@data-block-id]')),
                  headings=len(article.xpath('.//h1|.//h2|.//h3|.//h4|.//h5|.//h6')),
                  tables=len(article.xpath('.//table')), rows=len(article.xpath('.//tr')),
                  cells=len(article.xpath('.//th | .//td')))
    checks = dict(orderedFormulaProvenanceAndAnnotations=formulas == target,
                  counts=counts == dict(blocks=254, headings=77, tables=5, rows=33, cells=115),
                  oneVisualAndMathMLPerFormula=all(
                      sum('katex' in classes(x) for x in n.iterdescendants()) == 1
                      and len(n.xpath('.//math')) == 1 for n in nodes),
                  noFormulaErrors=not any('katex-error' in classes(n) or 'pf-math-error' in classes(n) for n in article.iter()),
                  anchors=len(ids) == len(set(ids)) and all(h in ids for h in hrefs),
                  katexLayoutCSS=css_ok, allEmbeddedFontsMatchBuild=bool(blobs) and len(blobs) == fonts.count('@font-face')
                  and all(b.startswith(b'wOF2') and digest(b) in font_hashes for b in blobs),
                  standalone=not doc.xpath('//script|//iframe|//embed|//object|//base')
                  and not any(k.lower().startswith('on') for n in doc.iter() for k in n.attrib)
                  and all(a.startswith(('data:', '#')) for a in assets)
                  and not re.search(r'(?:url\(\s*|@import\s*)["\']?(?:https?:)?//', styles, re.I))
    return dict(name=path.name, bytes=len(data), sha256=digest(data), title=doc.xpath('string(//title)'),
                template=article.get('data-template'), generator=doc.xpath('string(//meta[@name="generator"]/@content)'),
                formulas=len(nodes), inline=sum(not v[2] for v in formulas), display=sum(v[2] for v in formulas),
                payloadRecoveries=sum(a != b for a, b, _, _ in formulas), cssBytes=len(css.encode()), embeddedFonts=len(blobs),
                tocLinks=len(article.xpath('.//nav//a')), **counts, bodyDigest=tree_digest, checks=checks)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='*', type=Path)
    args = parser.parse_args()
    oracle = json.loads(Path('fixtures/rc6/user-trigonometry.expected.json').read_text())
    assert digest(Path('fixtures/rc6/user-trigonometry.md').read_bytes()) == oracle['input_sha256']
    bus = Path('examples/reference-rc6/RUMUS TRIGONOMETRI 1.html')
    edu = Path('examples/RC6_TRIGONOMETRI_PENGGUNA.html')
    refs = [summarize(p, oracle['formulas']) for p in (bus, edu)]
    assert refs[0]['sha256'] == 'a82ecec4f37617d9730b1aeaf427c446c1e0f1acaa3ea9ffa37372f0126108ff'
    assert refs[1]['sha256'] == '328dbc489d9ba51b77f96d53b1d1c9ed54e53a1066e6b86f2839057b41a85ac1'
    assert all(refs[0]['checks'].values()) and refs[0]['tocLinks'] == 22
    assert [k for k, v in refs[1]['checks'].items() if not v] == ['katexLayoutCSS']
    assert refs[0]['bodyDigest'] == refs[1]['bodyDigest']
    reports = []
    for p in args.files:
        item = summarize(p, oracle['formulas'])
        item['checks']['bodyMatchesAcceptedBUS'] = item['bodyDigest'] == refs[0]['bodyDigest']
        item['checks']['titleMatchesReference'] = item['title'] == refs[0]['title']
        if item['template'] == 'BUS-01':
            item['checks']['allBUSNavigationEntries'] = item['tocLinks'] == refs[0]['tocLinks']
        reports.append(item)
    ok = all(all(r['checks'].values()) for r in reports)
    print(json.dumps(dict(method='Parsed HTML structure/bytes, no renderer or browser',
                          referenceBUS=refs[0], referenceEDU=refs[1], candidates=reports, passChecks=ok), indent=2))
    if not ok:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
