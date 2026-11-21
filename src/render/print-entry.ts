/**
 * Entri halaman cetak (print.html). Menerima PrintPayload dari jendela induk/pembuka (postMessage, origin sama)
 * atau dari sessionStorage (`#job=<id>` → kunci `pf-print:<id>`), memaginasi, lalu melaporkan hasil.
 * Cetak lokal (PDF-12): `autoPrint` → window.print() pada tampilan terpaginasi; tidak ada kontak server.
 */
import { paginate, PaginationError } from './paginate';
import type { PaginationResult, PrintMessage, PrintPayload } from './print-types';

declare global { interface Window { __pfPrintResult?: PaginationResult | { status: 'error'; failure: unknown; issues: unknown[] }; pfPaginate?: (p: PrintPayload) => Promise<PaginationResult> } }

const target = (): Window | null => (window.parent !== window ? window.parent : window.opener);
/** SA-12: kait global hanya ada di build QA (VITE_PF_QA=1); build produksi tidak mengekspos hasil/payload ke window. */
const QA = import.meta.env.VITE_PF_QA === '1';
const expose = (r: Window['__pfPrintResult']) => { if (QA) window.__pfPrintResult = r; };
const post = (m: PrintMessage) => { const t = target(); if (t) t.postMessage(m, location.origin); };
let running: AbortController | null = null;

async function run(payload: PrintPayload, autoPrint: boolean): Promise<PaginationResult> {
  running?.abort(); const ctrl = new AbortController(); running = ctrl;
  const pages = document.getElementById('pages') as HTMLElement;
  if (!payload || payload.version !== 1 || typeof payload.bodyInner !== 'string') {
    const failure = { code: 'BAD_PAYLOAD' as const, message: 'Payload cetak tidak valid.' };
    expose({ status: 'error', failure, issues: [] }); post({ type: 'pf-print-error', jobId: payload?.jobId ?? '', failure, issues: [] });
    throw new Error(failure.message);
  }
  try {
    const result = await paginate(payload, { renderTo: pages, signal: ctrl.signal, onProgress: (p) => post({ type: 'pf-print-progress', jobId: payload.jobId, ...p }) });
    expose(result);
    post({ type: 'pf-print-result', jobId: payload.jobId, result });
    if (autoPrint && result.status === 'ok') setTimeout(() => window.print(), 50);
    return result;
  } catch (e) {
    const failure = e instanceof PaginationError ? e.failure : { code: 'PAGINATION_FAILED' as const, message: (e as Error).message };
    const issues = e instanceof PaginationError ? e.issues : [];
    expose({ status: 'error', failure, issues });
    post({ type: 'pf-print-error', jobId: payload.jobId, failure, issues });
    throw e;
  }
}

if (QA) window.pfPaginate = (p) => run(p, false);
window.addEventListener('message', (ev: MessageEvent<PrintMessage>) => {
  if (ev.origin !== location.origin || !ev.data || ev.data.type !== 'pf-print') return;
  void run(ev.data.payload, !!ev.data.autoPrint).catch(() => undefined);
});
const job = /#job=([\w.-]+)/.exec(location.hash)?.[1];
if (job) {
  const raw = sessionStorage.getItem(`pf-print:${job}`);
  sessionStorage.removeItem(`pf-print:${job}`);
  if (raw) void run(JSON.parse(raw) as PrintPayload, /[?&]autoprint=1/.test(location.search)).catch(() => undefined);
}
post({ type: 'pf-print-ready' });
