import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const KORPUS = join(__dirname, '../../../fixtures/korpus');
export function fxBytes(name: string): Uint8Array { return new Uint8Array(readFileSync(join(KORPUS, name))); }
export function fx(name: string): string { return readFileSync(join(KORPUS, name), 'utf8'); }
export function fxJson<T = Record<string, string>>(name: string): T { return JSON.parse(fx(name)) as T; }
export function fxSha(name: string): string { return createHash('sha256').update(readFileSync(join(KORPUS, name))).digest('hex'); }
/** jsdom: parse HTML jadi elemen body */
export function dom(html: string): HTMLElement { const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html'); return d.body; }
