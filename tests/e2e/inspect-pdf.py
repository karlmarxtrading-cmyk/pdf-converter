"""Strict structural/annotation inspection using pypdf; not a qpdf-equivalent validator."""
import json
import sys
from pypdf import PdfReader

reader = PdfReader(sys.argv[1], strict=True)
uris = []
internal = 0
for page in reader.pages:
    # Parse the content stream too; merely opening the trailer is insufficient.
    stream = page.get_contents()
    if stream is not None:
        # ContentStream parses operators lazily: get_data() alone only decodes bytes.
        list(stream.operations)
    for reference in page.get('/Annots', []):
        annotation = reference.get_object()
        action = annotation.get('/A')
        if action is not None:
            action = action.get_object()
        if action and action.get('/S') == '/URI':
            uris.append(str(action.get('/URI', '')))
        if annotation.get('/Dest') is not None or (action and action.get('/S') == '/GoTo'):
            internal += 1
print(json.dumps({'checker': 'pypdf strict reader + page streams', 'pages': len(reader.pages),
                  'uri': len(uris), 'uriTargets': sorted(set(uris)), 'internal': internal}))
