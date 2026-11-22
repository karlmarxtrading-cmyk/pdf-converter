import { inspectInlineImage } from '../core/assets';
import type { DiagramRasterBudget } from './diagram-raster';
import type { DiagramWindow } from './mermaid-frame';

// A revision or project switch can revoke a grant while a child frame loads.
let grantGeneration = 0;
const onlineJobs = new Set<AbortController>();
export function revokeDiagramRequests(): void {
  grantGeneration++;
  for (const job of onlineJobs) job.abort();
}
export const diagramGrantGeneration = (): number => grantGeneration;

export async function openDiagramFrame(online: boolean, generation: number, budget: DiagramRasterBudget, signal?: AbortSignal) {
  if (online && generation !== grantGeneration) throw new Error('Izin gambar dicabut.');
  signal?.throwIfAborted();
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.title = 'Mermaid';
  frame.referrerPolicy = 'no-referrer';
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1024px;height:768px;visibility:hidden;border:0';
  const url = new URL('src/render/mermaid-frame.html', document.baseURI);
  if (online) url.searchParams.set('images', 'approved');
  let readerFrame: HTMLIFrameElement | undefined;
  const lifetime = new AbortController();
  const interrupted = new Promise<never>((_, reject) => {
    lifetime.signal.addEventListener('abort', () => {
      frame.remove(); readerFrame?.remove();
      onlineJobs.delete(lifetime);
      reject(new Error('Render Mermaid dibatalkan.'));
    }, { once: true });
  });
  const abort = () => lifetime.abort();
  signal?.addEventListener('abort', abort, {once: true});
  lifetime.signal.addEventListener('abort', () => signal?.removeEventListener('abort', abort), {once: true});
  if (online) onlineJobs.add(lifetime);
  // Each browser operation has its own deadline. A document containing many
  // small diagrams does not lose the remaining diagrams to a shared timeout.
  async function withinLifetime<T>(operation: Promise<T>): Promise<T> {
    lifetime.signal.throwIfAborted();
    const timeout = setTimeout(() => lifetime.abort(), 60_000);
    try { return await Promise.race([operation, interrupted]); }
    finally { clearTimeout(timeout); }
  }
  function load(target: HTMLIFrameElement, href: URL): Promise<DiagramWindow> {
    return new Promise((resolve, reject) => {
      target.onload = () => resolve(target.contentWindow as DiagramWindow);
      target.onerror = () => reject(new Error('Renderer Mermaid tidak tersedia.'));
      target.src = href.href;
      document.body.appendChild(target);
    });
  }
  let readerReady: Promise<DiagramWindow> | undefined;
  async function readRemote(href: string, maximum: number) {
    lifetime.signal.throwIfAborted();
    if (!online || generation !== grantGeneration) throw new Error('Izin gambar dicabut.');
    if (!readerReady) {
      readerFrame = frame.cloneNode(false) as HTMLIFrameElement;
      readerFrame.title = 'Mermaid raster reader';
      const readerUrl = new URL(url); readerUrl.search = '?role=raster-reader';
      readerReady = load(readerFrame, readerUrl);
    }
    const reader = (await readerReady).paperFormaReadRaster;
    if (!reader) throw new Error('Pembaca gambar HTTPS tidak tersedia.');
    lifetime.signal.throwIfAborted();
    return reader(href, maximum, lifetime.signal);
  }
  try {
    await withinLifetime(load(frame, url));
    const draw = (frame.contentWindow as DiagramWindow | null)?.paperFormaDiagram;
    if (!draw) throw new Error('Renderer Mermaid tidak tersedia.');
    return {
      render: (id: string, source: string) => withinLifetime((async () => {
        lifetime.signal.throwIfAborted();
        const transaction = budget.begin(online);
        const svg = await draw(id, source, href => transaction.resolve(href, readRemote), lifetime.signal);
        const drawing = checkedDiagram(svg, false, document);
        const decoded = new Set<string>();
        for (const image of drawing.querySelectorAll('image')) {
          for (const attr of image.attributes) {
            if (attr.localName !== 'href' || attr.value.startsWith('#') || decoded.has(attr.value)) continue;
            lifetime.signal.throwIfAborted();
            // Native decoding starts only after all image references have passed
            // content inspection and this diagram's prospective aggregate limit.
            const native = new Image();
            const clear = () => native.removeAttribute('src');
            lifetime.signal.addEventListener('abort', clear, {once: true});
            try {
              native.src = attr.value;
              await native.decode();
            } catch { throw new Error('Data raster diagram gagal didekode. Sumber diagram disimpan.'); }
            finally { lifetime.signal.removeEventListener('abort', clear); clear(); }
            decoded.add(attr.value);
          }
        }
        lifetime.signal.throwIfAborted();
        transaction.commit();
        return drawing;
      })()),
      close: () => lifetime.abort(),
    };
  } catch (error) { lifetime.abort(); throw error; }
}

// The offline/export DOM must remain safe after SVG leaves the frame.
// The CSS subset allows local paint servers and ordinary drawing functions.
// Fail closed on unknown resource syntax; show the exact source to the user.
const cssFunctions = new Set(('rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix var calc min max clamp ' +
  'matrix matrix3d translate translatex translatey translatez translate3d rotate rotatex rotatey rotatez rotate3d scale scalex scaley scalez scale3d skew skewx skewy ' +
  'cubic-bezier steps repeat linear-gradient radial-gradient drop-shadow blur brightness contrast grayscale hue-rotate invert opacity saturate sepia ' +
  'nth-child nth-last-child nth-of-type is where has not lang path polygon circle ellipse inset').split(' '));
function drawingCss(value: string): boolean {
  if (value.includes('\\') || value.includes('/*') || /@(?!keyframes\b|media\b|supports\b)/i.test(value)) return false;
  const plain = value.replace(/url\(\s*(?:(["'])#[\w.:-]+\1|#[\w.:-]+)\s*\)/gi, '');
  return [...plain.matchAll(/([-\w]+)\s*\(/g)].every(match => cssFunctions.has(match[1]!.toLowerCase()));
}

export function checkedDiagram(svg: string, online: boolean, doc: Document): SVGElement {
  // Template contents are inert, including image loads and CSS imports.
  const template = doc.createElement('template');
  template.innerHTML = svg;
  const root = template.content.firstElementChild;
  if (root?.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg' || template.content.childElementCount !== 1)
    throw new Error('SVG Mermaid tidak valid.');
  const safeHtml = new Set(['div','span','b','br','i','em','strong','p','sup','sub']);
  const blockedSvg = new Set(['script','audio','video','iframe','animate','set','animatetransform','animatemotion','discard','handler','feimage']);
  const reject = () => { throw new Error('Referensi sumber daya diagram berada di luar izin dokumen.'); };
  for (const item of [root, ...root.querySelectorAll('*')]) {
    const tag = item.localName.toLowerCase();
    if (item.namespaceURI === 'http://www.w3.org/2000/svg' ? blockedSvg.has(tag) :
        item.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !safeHtml.has(tag)) reject();
    if (tag === 'style' && !drawingCss(item.textContent ?? '')) reject();
    for (const attr of item.attributes) {
      const name = attr.name.toLowerCase(), value = attr.value.trim();
      if (name === 'href' || name === 'xlink:href') {
        if (value.startsWith('#')) continue;
        if (tag === 'image' && /^data:/i.test(value)) {
          const result = inspectInlineImage(value);
          if (!result.ok) throw new Error(result.message);
          continue;
        }
        if (tag === 'image' && online && /^https:\/\//i.test(value)) continue;
        reject();
      }
      if (/^(?:on|xml:base$|src(?:set)?$|data$|poster$|background$|action$|formaction$|ping$)/i.test(name)) reject();
      if ((name === 'style' || /^(?:clip-path|color-profile|cursor|fill|stroke|filter|mask|marker(?:-start|-mid|-end)?)$/.test(name)) && !drawingCss(value)) reject();
    }
  }
  return root as SVGElement;
}
