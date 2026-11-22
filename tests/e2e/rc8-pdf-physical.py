"""Check stored PDF bytes independently against text fixtures and frozen RC7 equation images."""
from hashlib import sha256
import json
from pathlib import Path
import re
import sys
import fitz

artifact_dir = Path(sys.argv[1])
evidence_dir = Path(sys.argv[2])
results = json.loads((evidence_dir / 'results.json').read_text())
baselines = {
    'trigonometry-BUS-01-A4-portrait': 'trigonometry-BUS-A4.pdf',
    'trigonometry-EDU-01-A4-portrait': 'trigonometry-EDU-A4.pdf',
    'trigonometry-EDT-01-A5-portrait': 'trigonometry-EDT-A5.pdf',
    'trigonometry-CON-01-Letter-landscape': 'trigonometry-CON-Letter-landscape.pdf',
}
expected = json.loads(Path('fixtures/rc6/user-trigonometry.expected.json').read_text())['formulas']

def digest(data):
    return sha256(data).hexdigest()

def glyph_boxes(page):
    glyphs = []
    for block in page.get_text('rawdict')['blocks']:
        for line in block.get('lines', []):
            for span in line['spans']:
                if 'KaTeX' not in span['font']:
                    continue
                for ch in span['chars']:
                    if not ch['c'].isspace():
                        bounds = fitz.Rect(ch['bbox'])
                        glyphs.append((bounds.tl + bounds.br) * 0.5)
    return glyphs

def formula_proof(pdf, record, baseline):
    samples = []
    by_page = {}
    for index, formula in enumerate(record['review']['boxes']):
        n = formula['page'] - 1
        page = pdf[n]
        w,h = page.rect.width,page.rect.height
        clip = fitz.Rect(*[a*b for a,b in zip(formula['box'],[w,h,w,h])]) & page.rect
        image = page.get_pixmap(clip=clip, matrix=fitz.Matrix(1.5,1.5), colorspace=fitz.csGRAY)
        if n not in by_page:
            by_page[n] = glyph_boxes(page)
        physical_glyphs = sum(clip.contains(point) for point in by_page[n])
        item = {'i':index+1, 'page':n+1,'inkPx':sum(c<170 for c in image.samples),'pdfMathChars':physical_glyphs,
                'glyphRasterSha256':digest(image.samples),'oracleIndexMatches':formula['tex']==expected[index]['expected']}
        if baseline is not None:
            ref = baseline[n].get_pixmap(clip=clip, matrix=fitz.Matrix(1.5,1.5), colorspace=fitz.csGRAY)
            item['sameRasterAsRC7']=image.width==ref.width and image.height==ref.height and image.samples==ref.samples
        samples.append(item)
    return samples

def code_proof(record, pdf, source):
    expected_lines = source.split('```python\n',1)[1].split('\n```',1)[0].split('\n')
    parts=record['review']['codeParts']
    if 'mixed-' in record['id']:
        lines=[line for part in parts for line in part['lines']]
        exact=lines==[[str(n),v] for n,v in enumerate(expected_lines)]
        any_labels_alone=False
        for part_num, part in enumerate(parts):
            page=pdf[part['page']-1]
            text=page.get_text()
            correct_label='PYTHON · LANJUTAN' if part_num else 'PYTHON'
            if correct_label not in text or not part['lines']:
                any_labels_alone=True
        page_before=parts[0]['page']-1 if parts else 0
        boundary_ok=bool(parts and parts[0]['begin']=='0' and all(
            ('lanjutan' in part['label'].lower())==(n>0) for n,part in enumerate(parts)))
        if page_before:
            boundary_ok=boundary_ok and 'PYTHON' not in pdf[page_before-1].get_text()
        page_text='\n'.join(p.get_text() for p in pdf)
        indents=[re.search(r'^    '+re.escape(line.lstrip().split(' = ')[0])+
                           (r'\s*=' if ' = ' in line else ''),page_text,re.M) is not None
                 for line in expected_lines if line.startswith('    ')]
        return {'linesExpected':len(expected_lines),'exactDomCodeAndWhitespace':exact,
                'allIndentedPrefixesPresentInPdf':all(indents),'indentedLines':len(indents),
                'firstRealPage':page_before+1,'physicalPagesWithCode':[p['page'] for p in parts],
                'labelHasCodeOnEveryPage':not any_labels_alone,'continuationAfterActualContent':boundary_ok}
    # The short conversation fixture includes a deliberate empty line in a code fence.
    lines=[]
    for pg in pdf:
        for block in pg.get_text('dict')['blocks']:
            for line in block.get('lines',[]):
                string=''.join(s['text'] for s in line['spans'])
                lines.append((pg.number,string,line['bbox'][1]))
    first_line=next((line for line in lines if 'def selisih' in line[1]),None)
    prior=next((line for line in lines if '# cek baris' in line[1]),None)
    after=next((line for line in lines if 'return x - 1' in line[1]),None)
    blank=bool(first_line and prior and after and first_line[0]==prior[0]==after[0] and
               (after[2]-prior[2]) >= (prior[2]-first_line[2])*1.6)
    return {'linesExpected':len(expected_lines),'deliberateBlankLine':blank,
            'indentPreserved':bool(prior and after and prior[1].startswith('    ') and after[1].startswith('    '))}

observed=[]
for record in results['results']:
    rid=record['id']
    if 'pdfSha256' not in record:
        observed.append({'id':rid,'passed':False,'error':record.get('error','PDF absent')})
        continue
    blocked=record['status']=='UNSUPPORTED_BLOCKED'
    file=Path(record['pdfPath']) if record.get('pdfPath') else artifact_dir/(('DIAGNOSTIC-' if blocked else '')+rid+'.pdf')
    pdf=fitz.open(file)
    artifact_hash=digest(file.read_bytes())
    out={'id':rid,'pdfSha256':artifact_hash,'pages':len(pdf),'class':'diagnostic' if blocked else 'export',
         'hashMatches':artifact_hash==record['pdfSha256']}
    visible='\n'.join(page.get_text() for page in pdf)
    source=Path(record['file']).read_text()
    out['embeddedType3Count']=sum('Type3' in f[2].replace(' ','') for p in pdf for f in p.get_fonts())
    checks=[out['hashMatches'],out['embeddedType3Count']==0,record['status'] in ('PASS','UNSUPPORTED_BLOCKED')]
    if 'trigonometry-' in rid:
        base_file=baselines.get(rid)
        baseline=fitz.open(Path('examples/rc7/pdf')/base_file) if base_file else None
        samples=formula_proof(pdf,record,baseline)
        out['formulas']=samples
        checks += [len(samples)==231, all(s['inkPx']>0 and s['pdfMathChars']>0 and s['oracleIndexMatches'] for s in samples)]
        if baseline:
            checks.append(all(s['sameRasterAsRC7'] for s in samples))
            out['referenceSha256']=digest((Path('examples/rc7/pdf')/base_file).read_bytes()); baseline.close()
    else:
        out['emojiExtracted']={s:s in visible for s in ['😀','🚀','👩‍💻']}
        out['outlineEmojiFont']=any('NotoEmoji' in f[3].replace(' ','') and 'Type3' not in f[2] for p in pdf for f in p.get_fonts())
        checks += [all(out['emojiExtracted'].values()),out['outlineEmojiFont']]
        if blocked:
            out['strictRefusal']=record['refusal']
            out['diagnosticPrivateText']={'containsNul':'\0' in visible,'f8ffExtracted':'\uf8ff' in visible}
            checks.extend((record['refusal']['disabled'],record['refusal']['rawSourceUnchanged']))
        code=code_proof(record,pdf,source);out['code']=code
        checks.extend(v for v in code.values() if isinstance(v,bool))
    out['passed']=all(checks)
    observed.append(out)
    pdf.close()
summary={'method':'Independent checks of actual PyMuPDF text, span fonts, physical page geometry and equation ink at 108 DPI. Four reference configurations compare each physical formula crop byte-for-byte with the corresponding frozen RC7 PDF. Other layouts check source oracle sequence, actual nonempty ink and KaTeX font glyphs per region. For mixed original the PDF is strictly a diagnostic of preview; export is refused.','cases':observed}
(evidence_dir/'physical-verification.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False)+'\n')
def write_json(name, data):
    (evidence_dir/name).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')

matrix=[{'id':r['id'],'template':r['template'],'paper':r['paper'],'orientation':r['orientation'],
         'fixture':r['file'],'sourceSha256':r['sourceSha256'],'class':o.get('class'),'pages':r.get('pages'),
         'uiResult':r['status'],'physicalPass':o['passed'],'pdfSha256':r.get('pdfSha256')}
        for r,o in zip(results['results'],observed)]
write_json('portrait-landscape.json',matrix)
originals=[o for o in observed if o.get('class')=='diagnostic']
supported=[o for o in observed if o.get('class')=='export' and o.get('code')]
refs=[o for o in observed if o.get('referenceSha256')]
a5=next((o for o in originals if o['id']=='mixed-original-EDT-01-A5-portrait'),{})
boundary=a5.get('code',{})
codes=[o['code'] for o in supported if o['code'].get('linesExpected')==112]
conversations=[o['code'] for o in supported if o['code'].get('linesExpected')==4]
all_checked=bool(observed) and all(o['passed'] for o in observed)
coverage={'distTree':results['distTree'],'engine':results['engine'],'nativeSave':'NOT_TESTED_BY_THIS_AUTOMATION',
          'layoutSettings':len({(r['template'],r['paper'],r['orientation']) for r in matrix}),
          'totalJobs':len(matrix),'exported':sum(r['uiResult']=='PASS' for r in matrix),
          'privateSourcesRefused':sum(r['uiResult']=='UNSUPPORTED_BLOCKED' for r in matrix),
          'originalMixed':len(originals)==3 and all(o['passed'] for o in originals),
          'supportedText':bool(supported) and all(o['passed'] for o in supported),
          'emoji':bool(supported) and all(all(o['emojiExtracted'].values()) and o['outlineEmojiFont'] for o in supported),
          'privateUseDecision':len(originals)==3 and all(o['strictRefusal']['disabled'] and o['strictRefusal']['rawSourceUnchanged'] for o in originals),
          'type3Policy':all_checked and all(o['embeddedType3Count']==0 for o in observed),'actualPdf':all_checked,
          'code112Lines':bool(codes) and all(c['exactDomCodeAndWhitespace'] for c in codes),
          'indentationAndBlankLines':bool(conversations) and all(c['indentPreserved'] and c['deliberateBlankLine'] for c in conversations)
                   and all(c['allIndentedPrefixesPresentInPdf'] for c in codes),
          'labelWithCode':boundary.get('labelHasCodeOnEveryPage',False),
          'continuation':boundary.get('continuationAfterActualContent',False),
          'a5Boundary':boundary.get('firstRealPage') is not None and bool(boundary.get('exactDomCodeAndWhitespace')) and bool(boundary.get('labelHasCodeOnEveryPage')),
          'referenceFormulaCrops':sum(len(o['formulas']) for o in refs),
          'identicalReferenceCrops':sum(sum(s['sameRasterAsRC7'] for s in o['formulas']) for o in refs),
          'physicalChecksPass':all_checked}
write_json('coverage.json',coverage)
print('Physical PDF cases:',len(observed),'passed:',sum(o['passed'] for o in observed),'failed:',[o['id'] for o in observed if not o['passed']])
sys.exit(not all(o['passed'] for o in observed))
