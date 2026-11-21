// An immutable edit inherits the specific state its writer read. The small linked
// receipts also handle edits made while an earlier IndexedDB write is in flight.
import type { Project } from './contracts';
type Base = { token?: string; parent?: Base };
const bases = new WeakMap<Project, Base>();
function base(p: Project): Base {
  let b = bases.get(p);
  if (!b) { b = {}; bases.set(p, b); }
  return b;
}
export function inheritSaveBase(parent: Project, child: Project): void {
  bases.set(child, { parent: base(parent) });
}
export function savedToken(p: Project): string | undefined {
  let b: Base | undefined = base(p);
  while (b && !b.token) b = b.parent;
  return b?.token;
}
export function markSaved(p: Project, token: string): void {
  const b = base(p);
  b.token = token; delete b.parent;
}
