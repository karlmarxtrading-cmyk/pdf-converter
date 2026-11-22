import type { PrintTraceEvent } from './print-types';

/** Numeric metadata only. Every span ends even if a repair, timeout, or abort discards its work. */
export class PrintTrace {
  readonly events: PrintTraceEvent[] = [];
  readonly started = performance.now();
  attempt = 0;
  pass = 0;
  globalPass = 0;
  engineCalls = 0;
  pages = 0;
  private open = new Map<string, number>();

  constructor(private readonly jobId: string, private readonly notify?: (event: PrintTraceEvent) => void) {}

  private write(phase: string, event: PrintTraceEvent['event'], detail?: string, units?: number) {
    const ms = Math.round(performance.now() - this.started);
    const entry: PrintTraceEvent = { jobId: this.jobId, seq: this.events.length + 1,
      ms, phase, event, attempt: this.attempt, pass: this.pass,
      globalPass: this.globalPass, engineCalls: this.engineCalls, pages: this.pages };
    if (detail !== undefined) entry.detail = detail;
    if (units !== undefined) entry.units = units;
    if (event === 'start') this.open.set(phase, ms);
    if (event === 'end') {
      entry.durationMs = ms - this.open.get(phase)!;
      this.open.delete(phase);
    }
    this.events.push(entry);
    this.notify?.(entry);
  }

  start(phase: string) { this.write(phase, 'start'); }
  end(phase: string, outcome = 'ok') { this.write(phase, 'end', outcome); }
  note(phase: string, detail: string, units?: number) { this.write(phase, 'point', detail, units); }
  terminate(code: string) {
    this.note(code === 'ABORTED' ? 'abort' : 'error', code);
    for (const phase of [...this.open.keys()].reverse()) this.end(phase, code);
  }
}
