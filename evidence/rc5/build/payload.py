"""Compare LOCAL build sizes. The index category contains directly declared assets only."""
import gzip
from html.parser import HTMLParser
import json
from pathlib import Path
import sys


class Index(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = ['index.html']

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'script' and 'src' in attrs:
            self.paths.append(attrs['src'].lstrip('/'))
        if tag == 'link' and attrs.get('rel') in ('modulepreload', 'stylesheet'):
            self.paths.append(attrs['href'].lstrip('/'))


def inspect(directory):
    directory = Path(directory)
    index = Index()
    index.feed((directory / 'index.html').read_text('utf-8'))
    def size(path):
        data = (directory / path).read_bytes()
        return {'path': path, 'bytes': len(data), 'gzip9': len(gzip.compress(data, compresslevel=9, mtime=0))}
    eager = [size(p) for p in dict.fromkeys(index.paths)]
    groups = {key: [size(p.relative_to(directory).as_posix()) for p in sorted(directory.glob(pattern))]
              for key, pattern in [('worker', 'assets/engine.worker-*.js'), ('onDemandTeX', 'assets/tex-renderer-*.js')]}
    return {'indexDeclared': eager, 'indexDeclaredGzip9': sum(x['gzip9'] for x in eager), **groups}


if __name__ == '__main__':
    print(json.dumps([inspect(p) for p in sys.argv[1:]], indent=2))
