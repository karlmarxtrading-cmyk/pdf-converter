"""Independently reopen a saved PDF and both official HTML downloads. Six audited
fixtures use GFM, A4 portrait, empty metadata, Indonesian UI and BUS defaults.
The source oracle uses Pandoc, never the application's document renderer.
Usage: python verify-product-book.py SOURCE STANDALONE_HTML BOOK_HTML PDF SETTINGS_JSON
Only counts, digests, numeric diagnostics and code points go to stdout.
"""
import base64
import bisect
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import unicodedata
import urllib.parse

import fitz
from lxml import html
from text_boundaries import html_units, word_gaps

source, standalone_file, book_file, pdf_file = map(Path, sys.argv[1:5])
settings = json.loads(sys.argv[5])
raw_source = source.read_bytes()
sha = lambda value: hashlib.sha256(value).hexdigest()
digest = lambda value: sha(value.encode('utf8'))
def digest_json(value):
    return digest(json.dumps(value, ensure_ascii=False, separators=(',', ':')))
def norm(value, physical=False):
    result = unicodedata.normalize('NFC', value)
    if not has_fe0e:
        result = result.replace('\ufe0e', '')
    if physical:
        result = result.replace('\ufe0f', '')
    return re.sub(r'\s+', '', result)

long_table_fixture = sha(raw_source)=='dc36b244e653be7c2594261e6849850e03ef875a5be565234057d02f6ca3d620'
has_fe0e = '\ufe0e' in raw_source.decode('utf-8-sig')
ref = html.fragment_fromstring(subprocess.check_output(
    ['pandoc', '--from=gfm', '--to=html5', '--wrap=none', str(source)]
).decode('utf8'), create_parent='div')
source_blocks = list(ref)
structural_tags = set('blockquote pre code h1 h2 h3 h4 h5 h6 ol ul li table thead tbody tfoot tr th td a img hr br'.split())
def projection(nodes):
    text, shape = [], []
    for node in nodes:
        text.append(html_units(node, omit_text_selector=not has_fe0e))
        shape.append([node.tag, [[e.tag, e.get('start'), e.get('reversed') is not None,
                                  e.get('value'), e.get('colspan', '1'), e.get('rowspan', '1'),
                                  norm(e.text_content()) if e.tag in ('td', 'th') else None]
                                 for e in node.iter() if e.tag in structural_tags]])
    return {'text':digest_json(text), 'shape':digest_json(shape), 'blocks':len(nodes)}
expected_projection = projection(source_blocks)
def read_html(path):
    doc = html.document_fromstring(path.read_bytes())
    blocks = doc.xpath('//article//*[@data-block-id and not(ancestor::*[@data-block-id])]')
    css = '\n'.join(doc.xpath('//style/text()'))
    faces = re.findall(r'url\(["\']?data:font/[^;]+;base64,([\w+/=]+)', css)
    bad_faces=0
    for encoded in faces:
        try:
            font = base64.b64decode(encoded,validate=True)
            if font[:4] not in (b'wOF2', b'wOFF', b'OTTO', b'\0\1\0\0'): bad_faces+=1
        except ValueError: bad_faces+=1
    external = len(re.findall(r'(?:url\(["\']?(?:https?:)?//|@import\b)', css, flags=re.I))
    attrs = doc.xpath('//@src | //@srcset | //@poster | //link/@href')
    return doc, blocks, projection(blocks), {
        'scripts':len(doc.xpath('//script')),'invalidFonts':bad_faces,'fontPayloads':len(faces),
        'externalResources':external+sum(not s.startswith(('data:', '#')) for s in attrs),
        'duplicateIds':sum(v-1 for v in Counter(doc.xpath('//@id')).values() if v>1)}
standalone, _, html_projection, standalone_assets = read_html(standalone_file)
book, book_blocks, book_projection, book_assets = read_html(book_file)
heading_levels = {'h'+str(i):i for i in range(1,7)}
headings = [(i,n) for i,n in enumerate(source_blocks) if n.tag in heading_levels]
toc_expected = [(i,n) for i,n in headings if settings['toc'] and heading_levels[n.tag] <= int(settings['tocDepth'])]
if len(toc_expected)<2:
    toc_expected=[]
title = 'Table of Contents' if settings.get('contentLang')=='en' else 'Daftar Isi'
def toc_anchors(doc):
    return doc.xpath('//article/nav[contains(@class,"pf-toc")]//a')
def verify_toc(doc, blocks):
    entries = toc_anchors(doc)
    return len(entries)==len(toc_expected) and all(
        norm(a.text_content())==norm(n.text_content()) and urllib.parse.unquote(a.get('href','')[1:])==blocks[i].get('id')
        for a,(i,n) in zip(entries,toc_expected))
html_blocks=standalone.xpath('//article//*[@data-block-id and not(ancestor::*[@data-block-id])]')
markers = []
def printable(node):
    # Preserve every source text node and its own following tail exactly once.
    parts = [node.text or '']
    number = int(node.get('start') or 1)
    for child in node:
        if node.tag in ('ol','ul') and child.tag=='li':
            number = int(child.get('value') or number)
            label = (str(number)+'.') if node.tag=='ol' else '•'
            if not norm(child.text_content()): markers.append(label)
            parts.append(label)
            number += -1 if node.get('reversed') is not None else 1
        parts.extend((printable(child), child.tail or ''))
    return ''.join(parts)
segments=[]
required_gaps=set()
body_offset=0
for i,node in enumerate(source_blocks):
    before=len(markers)
    source_value = unicodedata.normalize('NFC', printable(node)).replace('\ufe0f', '')
    if not has_fe0e:
        source_value = source_value.replace('\ufe0e', '')
    required_gaps.update(body_offset + gap for gap in word_gaps(source_value))
    content=norm(source_value, True)
    body_offset += len(content)
    rows=[norm(row.text_content(),True) for row in node.xpath('.//tr')] if node.tag=='table' else []
    head=norm(''.join(node.xpath('./thead//text()')),True) if rows else ''
    segments.append((i,node.tag,content,rows,head,len(markers)-before))
expected_body=''.join(s[2] for s in segments)
expected_prefix=(norm(title,True)+''.join(norm(n.text_content(),True) for _,n in toc_expected)) if toc_expected else ''
cover_count=len(book.xpath('//main/header[contains(@class,"pf-cover")]'))
# The six fixtures were imported with blank title, subtitle, organization, author
# and date. An enabled cover is deliberately omitted by the UI for empty metadata.
expected_cover=bool(settings.get('cover') and settings.get('coverHasMetadata',False))
if expected_cover:
    raise ValueError('This GFM corpus has no nonempty cover metadata; use the cover fixture suite for other settings')
css='\n'.join(book.xpath('//style/text()'))
def margin(edge):
    return float(re.search('--pf-m-'+edge+r':([\d.]+)mm',css).group(1))*72/25.4
def extract(path):
    pages=[]; starts=[]; end=0; footer_fail=[]; header_fail=[]; links=[]; shape_bad=[]
    nul=0; repl=0; outside=0; invisible=0; unpainted=0; raster_codes=Counter(); glyph0=Counter(); font_ids=set(); blank=[]; table_fill=[]
    extracted_gaps = set()
    with fitz.open(path) as doc:
        names=doc.resolve_names()
        for ix,page in enumerate(doc):
            r=page.rect; starts.append(end)
            if abs(r.width-595.28)>2 or abs(r.height-841.89)>2: shape_bad.append(ix+1)
            header=norm(page.get_text(clip=fitz.Rect(0,0,r.width,margin_top-2)),True)
            footer=norm(page.get_text(clip=fitz.Rect(0,r.height-margin_bottom+2,r.width,r.height)),True)
            if header!=(norm(expected_title,True) if ix else ''):header_fail.append(ix+1)
            expected_footer=str(ix+int(settings['pageNumberStart'])) if settings['pageNumbers'] else ''
            if footer!=expected_footer:footer_fail.append(ix+1)
            body=page.get_text(clip=fitz.Rect(0,margin_top-2,r.width,r.height-margin_bottom+2))
            ordered = unicodedata.normalize('NFC', body).replace('\ufe0f', '')
            if not has_fe0e:
                ordered = ordered.replace('\ufe0e', '')
            extracted_gaps.add(end)
            # A text extraction can introduce line wrapping inside one source word.
            # Only gaps required by the source are mandatory.
            for piece in re.findall(r'\S+', ordered):
                extracted_gaps.add(end)
                end += len(piece)
            body=norm(body,True);pages.append(body)
            if not body:blank.append(ix+1)
            nul+=body.count('\x00');repl+=body.count('\ufffd')
            traces=page.get_texttrace()
            if long_table_fixture and ix+1<len(doc):
                bottom=max((s['bbox'][3] for s in traces if s['bbox'][1]>=margin_top-2 and s['bbox'][3]<r.height-margin_bottom+2),default=margin_top)
                table_fill.append((bottom-margin_top)/(r.height-margin_bottom-margin_top))
            for span in traces:
                if span.get('type')==3 or span.get('opacity',1)==0:invisible+=len(span['chars'])
                for code,gid,origin,(x0,y0,x1,y1) in span['chars']:
                    if chr(code).isspace():continue
                    if span.get('type')==3 or span.get('opacity',1)==0:
                        # Type3 fallback can use an invisible searchable text layer
                        # above a separate drawing of the actual glyph.
                        crop=page.get_pixmap(matrix=fitz.Matrix(3,3),clip=fitz.Rect(x0,y0,x1,y1),colorspace=fitz.csGRAY)
                        if sum(pixel<180 for pixel in crop.samples)<3:unpainted+=1
                        raster_codes[code]+=1
                    if gid==0:glyph0[code]+=1
                    if min(x0,y0)<-1 or x1>r.width+1 or y1>r.height+1:outside+=1
            font_ids.update(f[0] for f in page.get_fonts())
            for link in page.get_links():
                identifier=urllib.parse.unquote(link.get('nameddest',''))
                resolved=names.get(identifier,{})
                dest=link.get('page',resolved.get('page',-1))
                links.append((ix,identifier,dest,link['kind']))
        embedded=[ref for ref in font_ids if doc.extract_font(ref)[3] or doc.xref_get_key(ref,'Subtype')[1]=='/Type3']
    return pages,starts,links,extracted_gaps,{
        'footerFailures':footer_fail,'headerFailures':header_fail,'unexpectedMediaBoxes':shape_bad,
        'nulCharacters':nul,'replacementCharacters':repl,'outsideMediaBoxGlyphs':outside,
        'invisibleTextLayerGlyphs':invisible,'unpaintedTextLayerGlyphs':unpainted,'rasterCheckedFallback':{f'U+{c:04X}':n for c,n in raster_codes.items()},'missingGlyphCodepoints':{f'U+{c:04X}':n for c,n in glyph0.items()},
        'blankPages':blank,'longTableFit':{'applies':long_table_fixture,'nonterminalPagesChecked':len(table_fill),
        'minimumFractionOfPrintableHeightReached':round(min(table_fill),4) if table_fill else None,
        'threshold':0.5,'nonterminalPagesEndingInUpperHalf':[i+1 for i,val in enumerate(table_fill) if val<0.5]},
        'fontObjects':len(font_ids),'embeddedOrType3Fonts':len(embedded)}
margin_top,margin_bottom=margin('top'),margin('bottom')
# BUS uses the first H1 as its imported title when available. In these
# fixtures the original has no H1 and empty project metadata.
expected_title = next((n.text_content() for _,n in headings if n.tag=='h1'),'')
title_setting_matches = settings.get('settingsTitleSha256',digest(expected_title))==digest(expected_title)
title_meta = book.xpath('//title/text()')
book_title_matches = title_meta==[expected_title or next(n.text_content() for _,n in headings)]
pages,starts,links,extracted_gaps,geometry=extract(pdf_file)
actual=''.join(pages)
def consume(body):
    pos=0; duplicates=[]; diff=[]; places={}; offsets={}; counts=Counter()
    if not body.startswith(expected_prefix):
        return {'diff':[{'kind':'generated-prefix'}],'counts':counts,'pos':0,'deduped':'','duplicates':duplicates,'places':places,'offsets':offsets}
    pos=len(expected_prefix)
    boundary=set(starts)
    for index,tag,wanted,rows,head,marker_count in segments:
        places[index]=bisect.bisect_right(starts,pos)-1; offsets[index]=pos
        if rows:
            for j,row in enumerate(rows):
                k=0
                while k<len(row):
                    if (j or k) and pos in boundary and head and body.startswith(head,pos):
                        duplicates.append((pos,len(head)));pos+=len(head)
                    stop=bisect.bisect_right(starts,pos)
                    chunk=len(row)-k if stop==len(starts) else min(len(row)-k,starts[stop]-pos)
                    if body[pos:pos+chunk]!=row[k:k+chunk] or not chunk:
                        diff.append({'kind':'cell-text','block':index,'row':j,'offset':pos});break
                    pos+=chunk;k+=chunk
                if diff:break
        elif body.startswith(wanted,pos):pos+=len(wanted)
        else:diff.append({'kind':'source-block','block':index,'tag':tag,'offset':pos})
        if diff:break
        counts['blocks']+=1;counts['text']+=int(bool(norm(source_blocks[index].text_content())))
        counts['markers']+=marker_count;counts['headings']+=int(tag in heading_levels)
    if pos!=len(body):diff.append({'kind':'trailing-or-unconsumed','offset':pos,'actualLength':len(body)})
    chunks=[];keep=len(expected_prefix)
    for offset,length in duplicates:chunks.append(body[keep:offset]);keep=offset+length
    chunks.append(body[keep:])
    return {'diff':diff,'counts':counts,'pos':pos,'deduped':''.join(chunks),'duplicates':duplicates,'places':places,'offsets':offsets}
result=consume(actual)
counts=result['counts'];clean=result['deduped']
# Subtract the generated TOC and only the repeated source headers already located by consume().
actual_gaps=set()
duplicate_index=0
removed=len(expected_prefix)
for gap in sorted(extracted_gaps):
    while duplicate_index < len(result['duplicates']):
        offset, length = result['duplicates'][duplicate_index]
        if gap < offset+length:
            break
        removed+=length
        duplicate_index+=1
    if duplicate_index < len(result['duplicates']) and gap > result['duplicates'][duplicate_index][0]:
        continue
    if gap >= removed:
        actual_gaps.add(gap-removed)
missing_gaps=sorted(required_gaps-actual_gaps)
pdf_targets=[(identifier,dest) for _,identifier,dest,kind in links if kind in (fitz.LINK_NAMED,fitz.LINK_GOTO)]
expected_targets=[(book_blocks[i].get('id'),result['places'].get(i)) for i,n in toc_expected]
# Chromium can emit adjacent rectangles for one logical link with wrapped text.
actual_targets=[v for i,v in enumerate(pdf_targets) if i==0 or v!=pdf_targets[i-1]]
link_match=sum(x==y for x,y in zip(actual_targets,expected_targets))
with fitz.open(pdf_file) as reopened:
    doc_title_matches=reopened.metadata['title']==title_meta[0]
source_structure={'tables':len(ref.xpath('.//table')),'rows':len(ref.xpath('.//tr')),'cells':len(ref.xpath('.//th|.//td')),
    'heads':len(headings),'blocks':len(source_blocks)}
# Exercise the same sequential PDF-body comparator on tampered actual extraction.
first_heading = next((i for i,n in headings if i in result['offsets'] and n.text_content().strip()),None)
def rejects(actual_mutation):
    return bool(consume(actual_mutation)['diff'])
controls={'validAccepted':not result['diff'] and expected_body==clean,
          'addedTextRejected':rejects(actual+'X'),'missingEndRejected':rejects(actual[:-1])}
if first_heading is not None:
    start=result['offsets'][first_heading]
    index=next(i for i in range(start,min(len(actual),start+len(segments[first_heading][2]))) if actual[i].isalpha())
    controls['changedCaseRejected']=rejects(actual[:index]+actual[index].swapcase()+actual[index+1:])
table_index=next((s[0] for s in segments if s[3] and s[0] in result['offsets']),None)
if table_index is not None:
    at=result['offsets'][table_index]
    controls['changedTableCellRejected']=rejects(actual[:at]+'~'+actual[at+1:])
ordered=[s for s in segments if s[2] and s[0] in result['offsets']]
if len(ordered)>=2:
    one,two=ordered[:2]; a,b=result['offsets'][one[0]],result['offsets'][two[0]]; end=b+len(two[2])
    controls['reorderedBlocksRejected']=one[2]!=two[2] and rejects(actual[:a]+two[2]+actual[a+len(one[2]):b]+one[2]+actual[end:])
visible_markers=0; marker_ink=[]; used_words=set()
if markers:
    with fitz.open(pdf_file) as doc:
        marker_index=0
        for seg in segments:
            i,tag,content,_,_,count=seg
            if count and i in result['places']:
                page_index=result['places'][i];page=doc[page_index]
                known=page.get_text('words')
                for label in markers[marker_index:marker_index+count]:
                    candidates=[(j,w) for j,w in enumerate(known) if w[4]==label and (page_index,j) not in used_words]
                    if not candidates:continue
                    j,w=candidates[0];used_words.add((page_index,j))
                    crop=page.get_pixmap(matrix=fitz.Matrix(3,3),clip=fitz.Rect(w[:4]),colorspace=fitz.csGRAY)
                    ink=sum(v<180 for v in crop.samples);visible_markers+=int(ink>=3);marker_ink.append(ink)
                if marker_index==0:
                    at=actual.find(markers[0],result['offsets'][i],result['offsets'][i]+len(content))
                    controls['missingListMarkerRejected']=at>=0 and rejects(actual[:at]+actual[at+len(markers[0]):])
            marker_index+=count
if expected_targets:
    broken=actual_targets.copy()
    if broken:broken[0]=(broken[0][0],-1)
    controls['brokenTocDestinationRejected']=broken!=expected_targets
p={
    'pass':False,'sourceWordGaps':len(required_gaps),'missingWordGapCount':len(missing_gaps),'firstMissingGapOffsets':missing_gaps[:10],'normalization':'HTML compares NFC prose with separated words and verbatim code. Physical comparisons check ordered characters and source word gaps after pagination; FE0E removed only if absent from source. Physical extraction also excludes FE0F. Table header repetitions removed only at real page boundaries inside the source table.',
    'oracle':'Pandoc GFM → independent ordered block, list and table projections; PyMuPDF reopen of the saved document',
    'pandoc':subprocess.check_output(['pandoc','--version'],text=True).splitlines()[0],'pymupdf':fitz.VersionBind,
    'sourceSha256':sha(raw_source),'pdfSha256':sha(pdf_file.read_bytes()),'pdfBytes':pdf_file.stat().st_size,
    'pages':len(pages),'sourceBlocks':len(source_blocks),'visitedBlocks':counts['blocks'],'sourceTextBlocks':sum(bool(norm(n.text_content())) for n in source_blocks),
    'confirmedTextBlocks':counts['text'],'expectedEmptyMarkers':len(markers),'confirmedEmptyMarkers':counts['markers'],
    'sourceTables':source_structure['tables'],'sourceRows':source_structure['rows'],'sourceCells':source_structure['cells'],
    'sourceHeadings':len(headings),'confirmedHeadings':counts['headings'],'expectedBodySha256':digest(expected_body),'actualBodySha256':digest(clean),
    'expectedBodyCharacters':len(expected_body),'actualBodyCharacters':len(clean),'endMatches':bool(clean) and clean[-120:]==expected_body[-120:],
    'verifiedFooterPages':len(pages)-len(geometry['footerFailures']),'expectedFooterPages':len(pages),
    'visibleEmptyMarkers':visible_markers,'minimumMarkerInkPixels':min(marker_ink,default=None),'titleSettingMatchesSource':title_setting_matches,'pdfDocumentTitleMatchesSource':book_title_matches and doc_title_matches,'expectedCoverPages':int(expected_cover),'actualCoverHeaders':cover_count,'expectedTocLinks':len(expected_targets),
    'resolvedTocLinks':link_match,'physicalLinkAnnotations':len(links),'targetSequenceMatches':actual_targets==expected_targets and len(pdf_targets)==len(links),
    'standaloneTocMatchesSource':verify_toc(standalone,html_blocks),'bookTocMatchesSource':verify_toc(book,book_blocks),
    'standaloneAssets':standalone_assets,'bookAssets':book_assets,'htmlSourceProjection':expected_projection,
    'standaloneProjection':html_projection,'bookProjection':book_projection,'repeatedTableHeaders':len(result['duplicates']),
    'geometry':geometry,'negativeControls':controls,'differences':result['diff']}
p['pass']=all([not missing_gaps,not p['differences'],p['expectedBodySha256']==p['actualBodySha256'],p['endMatches'],all(controls.values()),p['targetSequenceMatches'],
              p['standaloneTocMatchesSource'],p['bookTocMatchesSource'],expected_projection==html_projection==book_projection,
              int(expected_cover)==cover_count,visible_markers==len(markers),title_setting_matches,p['pdfDocumentTitleMatchesSource'],not any(geometry[k] for k in ('footerFailures','headerFailures','unexpectedMediaBoxes','nulCharacters',
              'replacementCharacters','outsideMediaBoxGlyphs','unpaintedTextLayerGlyphs','missingGlyphCodepoints','blankPages')),
              not geometry['longTableFit']['nonterminalPagesEndingInUpperHalf'],geometry['fontObjects']==geometry['embeddedOrType3Fonts']>0,
              all(not stats[k] for stats in (standalone_assets,book_assets) for k in ('externalResources','scripts','invalidFonts','duplicateIds'))])
print(json.dumps(p,ensure_ascii=False))
