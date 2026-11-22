"""Compare actual offline HTML and native ordered-list output with their fixed source."""
import re
import subprocess
import sys
import unicodedata
from pathlib import Path
from lxml import html
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'docs' / 'verification-tools'))
from text_boundaries import html_units


def normalized(text):
    return re.sub(r'\s+', '', unicodedata.normalize('NFC', text))


def check_offline(source, standalone):
    original = Path(source).read_text(encoding='utf-8')
    rendered = subprocess.check_output(['pandoc', '--from=gfm', '--to=html5', '--wrap=none', source])
    reference = html.fragment_fromstring(rendered.decode(), create_parent='div')
    doc = html.fromstring(Path(standalone).read_text(encoding='utf-8'))
    article, = doc.xpath('//article')
    blocks = article.xpath('.//*[@data-block-id and not(ancestor::*[@data-block-id])]')
    expected = normalized(''.join(reference.itertext()))
    if '\ufe0e' not in original:
        expected = expected.replace('\ufe0e', '')
    assert expected and expected == normalized(''.join(''.join(b.itertext()) for b in blocks)), 'Offline text/order differs from GFM source'
    assert [html_units(n, '\ufe0e' not in original) for n in reference] == [
        html_units(n, '\ufe0e' not in original) for n in blocks
    ], 'Word boundaries or verbatim code differ from source'
    for tag in ['table', 'tr', 'th', 'td', 'h1', 'h2', 'h3', 'img']:
        assert len(reference.xpath('.//'+tag)) == sum(len(b.xpath('descendant-or-self::'+tag)) for b in blocks), 'Structure differs: '+tag
    assert not doc.xpath('//script|//*[@src and starts-with(@src,"http")]'), 'Active or remote content in offline output'


def check_list(source, standalone):
    def structure(doc):
        def node(el):
            nested = [c for c in el.iterdescendants() if c.tag in ('li','ol','ul') and next(
                (a for a in c.iterancestors() if a.tag in ('ol','ul','li')), None) is el]
            # Direct label text excludes nested lists but includes harmless inline wrappers.
            attrs = {k: (True if k == 'reversed' else el.get(k)) for k in ['type','start','reversed','value'] if k in el.attrib}
            return el.tag, attrs, html_units(el), [node(c) for c in nested]
        return [node(el) for el in doc.xpath('.//ol[not(ancestor::ol) and not(ancestor::ul)]')]
    ref = html.fragment_fromstring(Path(source).read_text(), create_parent='div')
    doc = html.fromstring(Path(standalone).read_text())
    top = doc.xpath('//article[@id="pf-content"]')
    actual = structure(top[0] if top else doc)
    assert actual and actual == structure(ref), 'Native ordered-list attributes, nesting or labels differ'


if __name__ == '__main__':
    {'offline': check_offline, 'list': check_list}[sys.argv[1]](*sys.argv[2:])
