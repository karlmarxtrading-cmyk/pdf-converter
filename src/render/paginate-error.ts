import type { Issue } from '../core/contracts';
import type { PaginationFailure, PrintTraceEvent } from './print-types';
/** Kegagalan paginasi berklasifikasi (PDF-10). */
export class PaginationError extends Error {
  constructor(readonly failure: PaginationFailure, readonly issues: Issue[], readonly events: PrintTraceEvent[] = []) { super(failure.message); this.name = 'PaginationError'; }
}
