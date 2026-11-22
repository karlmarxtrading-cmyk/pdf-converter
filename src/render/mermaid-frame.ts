// This layout realm cannot load images through any DOM or CSS mechanism.
// The only online read is the explicit, CORS-readable HTTPS byte stream.
import { checkedDiagram } from './diagram-policy';
import { readDiagramRaster, type DiagramRaster } from './diagram-raster';

const options = new URLSearchParams(location.search);
const reader = options.get('role') === 'raster-reader';
const online = options.get('images') === 'approved';
const policy = document.createElement('meta');
policy.httpEquiv = 'Content-Security-Policy';
policy.content = [
  "default-src 'none'", "script-src 'self'", "style-src 'unsafe-inline'",
  "img-src 'none'", reader ? 'connect-src https:' : "connect-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');
document.head.appendChild(policy);

type Resolve = (url: string) => Promise<DiagramRaster>;
export type DiagramRenderer = (id: string, source: string, resolve: Resolve, signal: AbortSignal) => Promise<string>;
export type DiagramWindow = Window & { paperFormaDiagram?: DiagramRenderer; paperFormaReadRaster?: typeof readDiagramRaster };

if (reader) (window as DiagramWindow).paperFormaReadRaster = readDiagramRaster;
else (window as DiagramWindow).paperFormaDiagram = async (id, source, get, signal) => {
  // Mermaid 11's image shape asks an Image for its intrinsic dimensions.
  // Supply checked header dimensions; this object has no native image loader.
  class LayoutImage {
    src = '';
    naturalWidth = 0;
    naturalHeight = 0;
    async decode() {
      signal.throwIfAborted();
      const raster = await get(this.src);
      this.naturalWidth = raster.width; this.naturalHeight = raster.height;
    }
  }
  Object.defineProperty(window, 'Image', {configurable: true, value: LayoutImage});
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false, securityLevel: 'strict', theme: 'neutral', htmlLabels: false,
    flowchart: { htmlLabels: false }, fontFamily: 'Inter, Arial, sans-serif',
    deterministicIds: true, deterministicIDSeed: id,
  });
  const drawing = checkedDiagram((await mermaid.render(id, source)).svg, online, document);
  // Other diagram types may emit SVG images without asking for dimensions.
  // Validate both href spellings on the detached result and use the exact
  // inspected bytes when it later enters the publication document.
  for (const img of drawing.querySelectorAll('image')) {
    for (const attr of [...img.attributes]) {
      if (attr.localName !== 'href' || attr.value.startsWith('#')) continue;
      const approved = await get(attr.value);
      img.setAttributeNS(attr.namespaceURI, attr.name, approved.dataUrl);
    }
  }
  signal.throwIfAborted();
  return drawing.outerHTML;
};
