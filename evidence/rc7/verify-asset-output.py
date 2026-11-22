"""Read an actual PaperForma HTML export from disk. No network calls."""
import argparse
import base64
import ctypes as C
import ctypes.util
import hashlib
import io
import json
import re
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image


def digest(data):
    return hashlib.sha256(data).hexdigest()


class Inventory(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.images = []
        self.links = []
        self.styles = {}
        self.meta = {}
        self.style_id = None
        self.active = []
        self.text = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'style':
            self.style_id = a.get('data-pf', '')
            self.styles[self.style_id] = ''
        elif tag == 'img':
            self.images.append(a)
        elif tag == 'a':
            self.links.append(a)
        elif tag == 'meta':
            self.meta[a.get('name') or a.get('http-equiv')] = a.get('content', '')
        if tag in {'script','link','iframe','object','embed'} or any(k.startswith('on') for k in a):
            self.active.append(tag)

    def handle_endtag(self, tag):
        if tag == 'style':
            self.style_id = None

    def handle_data(self, text):
        if self.style_id is None:
            self.text.append(text)
        else:
            self.styles[self.style_id] += text


def validate_fonts(css, font_dir):
    known = {digest(path.read_bytes()) for path in font_dir.glob('*.woff2')}
    ft = C.CDLL(ctypes.util.find_library('freetype'))
    def fn(name, args, result=C.c_int):
        func = getattr(ft,name)
        func.argtypes, func.restype = args,result
        return func
    P, U, UL = C.c_void_p, C.c_uint, C.c_ulong
    library = P()
    assert fn('FT_Init_FreeType',[C.POINTER(P)])(C.byref(library)) == 0
    open_face = fn('FT_New_Memory_Face',[P,P,C.c_long,C.c_long,C.POINTER(P)])
    set_size = fn('FT_Set_Pixel_Sizes',[P,U,U])
    first_char = fn('FT_Get_First_Char',[P,C.POINTER(U)],UL)
    next_char = fn('FT_Get_Next_Char',[P,UL,C.POINTER(U)],UL)
    load_char = fn('FT_Load_Char',[P,UL,C.c_int32])
    close_face = fn('FT_Done_Face',[P])
    result = []
    for face in re.findall(r'@font-face\{([^}]*)\}',css):
        family = re.search(r"font-family:'([^']+)'",face)[1]
        data = base64.b64decode(re.search(r'base64,([^\)]+)',face)[1],validate=True)
        assert digest(data) in known
        buf = C.create_string_buffer(data)
        font = P()
        assert open_face(library,buf,len(data),0,C.byref(font)) == 0
        assert set_size(font,0,20) == 0
        index = U()
        ch = first_char(font,C.byref(index))
        while ch <= 32 and index.value:
            ch = next_char(font,ch,C.byref(index))
        assert index.value and load_char(font,ch,4) == 0
        assert close_face(font) == 0
        result.append({'family':family,'bytes':len(data),'sha256':digest(data),'renderedCodepoint':f'U+{ch:04X}'})
    assert fn('FT_Done_FreeType',[P])(library) == 0 and result
    return result


def check(file, root):
    data = file.read_bytes()
    inventory = Inventory()
    inventory.feed(data.decode('utf-8'))
    assert len(inventory.images) == 2 and not inventory.active
    chart = (root/'fixtures/korpus/assets/chart.png').read_bytes()
    expect_pixels = bytes([210,81,22,242,201,76,32,60,92,59,115,141,244,243,238,15,26,34])
    checked_images = []
    labels = [('Kotak warna tiga kali dua','Palet inline'),('Grafik proyek','Grafik lokal')]
    for i, img in enumerate(inventory.images):
        assert (img['alt'],img['title']) == labels[i]
        assert img['src'].startswith('data:image/png;base64,')
        raw = base64.b64decode(img['src'].split(',',1)[1],validate=True)
        with Image.open(io.BytesIO(raw)) as image:
            image.load()
            if i == 0:
                assert image.size == (3,2) and image.convert('RGB').tobytes() == expect_pixels
            else:
                assert image.size == (32,32) and raw == chart
            checked_images.append({'alt':img['alt'],'title':img['title'],'dimensions':list(image.size),'pngSha256':digest(raw)})
    assert len([a for a in inventory.links if a.get('href','').startswith('http')]) == 1
    target = next(a for a in inventory.links if a.get('href','').startswith('https://'))
    assert target['href'] == 'https://example.org/paperforma?x=1&y=2' and target['title'] == 'Rujukan pengujian'
    assert 'Lihat penjelasan' in inventory.text and 'Akhir uji.' in inventory.text
    csp = inventory.meta['Content-Security-Policy']
    assert all(s in csp.split('; ') for s in ["default-src 'none'",'font-src data:','img-src data:'])
    for css in inventory.styles.values():
        assert not re.search(r'url\(\s*[\x22\x27]?(?:https?:|//)|@import\b',css,re.I)
    faces = validate_fonts(inventory.styles['fonts'],root/'dist/assets')
    return {'bytes':len(data),'sha256':digest(data),'generator':inventory.meta['generator'],'pngImages':checked_images,'externalNavigationLink':target,'embeddedFonts':faces,'scriptOrStylesheetLinks':0,'csp':csp}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('file',type=Path)
    parser.add_argument('repository',type=Path)
    args = parser.parse_args()
    print(json.dumps(check(args.file,args.repository),indent=2))
