"""Word boundaries for prose and verbatim whitespace for code in the GFM book corpus."""
import re
import unicodedata

BLOCK = {'article', 'blockquote', 'div', 'p', 'ol', 'ul', 'li', 'table', 'thead',
         'tbody', 'tfoot', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br'}

def html_units(node, omit_text_selector=False):
    """Inline wrappers do not create spaces. Structural boxes separate their contents."""
    units, pending = [], []
    def flush():
        value = unicodedata.normalize('NFC', ''.join(pending))
        if omit_text_selector:
            value = value.replace('\ufe0e', '')
        value = ' '.join(value.split())
        if value:
            units.append(('text', value))
        pending.clear()
    def visit(el):
        if el.tag in ('pre', 'code'):
            flush()
            units.append((el.tag, el.text_content()))
            return
        if el.tag in BLOCK:
            flush()
        pending.append(el.text or '')
        for child in el:
            if isinstance(child.tag, str):
                visit(child)
            pending.append(child.tail or '')
        if el.tag in BLOCK:
            flush()
    visit(node)
    flush()
    return units

def word_gaps(value):
    """Offsets in the space-free NFC stream where two word characters require a gap."""
    gaps, pos, last = set(), 0, ''
    for piece in re.findall(r'\S+', value):
        if last and last.isalnum() and piece[0].isalnum():
            gaps.add(pos)
        pos += len(piece)
        last = piece[-1]
    return gaps
