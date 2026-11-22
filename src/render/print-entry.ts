/**
 * Entri halaman cetak (print.html). Menerima PrintPayload dari jendela induk/pembuka (postMessage, origin sama)
 * atau dari sessionStorage (`#job=<id>` → kunci `pf-print:<id>`), memaginasi, lalu melaporkan hasil.
 * Cetak lokal (PDF-12): `autoPrint` → window.print() pada tampilan terpaginasi; tidak ada kontak server.
 */
import { paginate, PaginationError } from './paginate';
import type { PaginationResult, PrintMessage, PrintPayload, PrintTraceEvent } from './print-types';

declare global { interface Window { __pfPrintResult?: PaginationResult | { status: 'error'; failure: unknown; issues: unknown[] }; pfPaginate?: (p: PrintPayload) => Promise<PaginationResult> } }

const target = (): Window | null => (window.parent !== window ? window.parent : window.opener);
/** SA-12: kait global hanya ada di build QA (VITE_PF_QA=1); build produksi tidak mengekspos hasil/payload ke window. */
const QA = import.meta.env.VITE_PF_QA === '1';
const expose = (r: Window['__pfPrintResult']) => { if (QA) window.__pfPrintResult = r; };
const post = (m: PrintMessage) => { const t = target(); if (t) t.postMessage(m, location.origin); };
let running: { jobId: string; ctrl: AbortController; events: PrintTraceEvent[] } | undefined;
let settled: Promise<void> = Promise.resolve();

// Both windows share an origin. Deliver stop synchronously while the child
// realm is still attached. A queued postMessage may be lost on frame removal.
window.addEventListener('pf-print-stop', (event: Event) => {
  const { jobId, receive } = (event as CustomEvent).detail;
  if (running?.jobId === jobId && running) {
    running.ctrl.abort();
    receive?.(running.events);
  }
});

async function run(payload: PrintPayload, autoPrint: boolean): Promise<PaginationResult> {
  running?.ctrl.abort();
  const prior = settled;
  let release!: () => void;
  settled = new Promise<void>(resolve => { release = resolve; });
  const ownTurn = settled;
  const ctrl = new AbortController();
  const job = { jobId: payload?.jobId, ctrl, events: [] as PrintTraceEvent[] };
  running = job;
  // A new payload must never write to the same page tree while the previous
  // job's engine or post-pagination verification still uses it.
  await prior;
  try {
  const pages = document.getElementById('pages') as HTMLElement;
  if (!payload || payload.version !== 1 || typeof payload.bodyInner !== 'string') {
    const failure = { code: 'BAD_PAYLOAD' as const, message: 'Payload cetak tidak valid.' };
    expose({ status: 'error', failure, issues: [] }); post({ type: 'pf-print-error', jobId: payload?.jobId ?? '', failure, issues: [] });
    throw new Error(failure.message);
  }
  try {
    if (autoPrint && payload.pdfRestrictions?.length) throw new PaginationError(
      { code: 'BLOCKING_ISSUES', message: payload.pdfRestrictions[0]!.message }, payload.pdfRestrictions);
    const result = await paginate(payload, { renderTo: pages, signal: ctrl.signal,
      onTrace: entry => { job.events.push(entry); },
      onProgress: p => { if (!ctrl.signal.aborted) post({type:'pf-print-progress',jobId:payload.jobId,...p}); } });
    if (ctrl.signal.aborted) throw new PaginationError({code:'ABORTED',message:'Paginasi dibatalkan.'},[],job.events);
    expose(result);
    post({ type: 'pf-print-result', jobId: payload.jobId, result });
    if (autoPrint && result.status === 'ok') setTimeout(() => { if (!ctrl.signal.aborted && settled === ownTurn) window.print(); }, 50);
    return result;
  } catch (e) {
    const failure = e instanceof PaginationError ? e.failure : { code: 'PAGINATION_FAILED' as const, message: (e as Error).message };
    const issues = e instanceof PaginationError ? e.issues : [];
    if (running === job) expose({ status: 'error', failure, issues });
    post({ type: 'pf-print-error', jobId: payload.jobId, failure, issues, events: job.events });
    throw e;
  }
  } finally {
    if (running === job) running = undefined;
    release();
  }
}

if (QA) window.pfPaginate = (p) => run(p, false);
window.addEventListener('message', (ev: MessageEvent<PrintMessage>) => {
  if (ev.origin !== location.origin || ev.source !== target() || !ev.data || ev.data.type !== 'pf-print') return;
  void run(ev.data.payload, !!ev.data.autoPrint).catch(() => undefined);
});
const job = /#job=([\w.-]+)/.exec(location.hash)?.[1];
if (job) {
  const raw = sessionStorage.getItem(`pf-print:${job}`);
  sessionStorage.removeItem(`pf-print:${job}`);
  if (raw) void run(JSON.parse(raw) as PrintPayload, /[?&]autoprint=1/.test(location.search)).catch(() => undefined);
}
post({ type: 'pf-print-ready' });
