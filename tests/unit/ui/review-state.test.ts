import {describe,it,expect,beforeEach} from 'vitest';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string) => { window: { document: Document } } };
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {diffLines} from 'diff';
import {reviewDiff,REVIEW_DIFF_LIMITS} from '../../../src/ui/review-diff';
import {el} from '../../../src/ui/shell';
import {t} from '../../../src/ui/i18n';
const source=readFileSync(process.env.PF_UI_AUDIT_SOURCE ?? new URL('../../../src/ui/main.ts',import.meta.url),'utf8');
function actual(name:string,end:string,ctx:Record<string,unknown>){
 const start=source.indexOf(`function ${name}(`),begin=source.slice(start-6,start)==='async '?start-6:start;
 const body=source.slice(begin,source.indexOf(end,start)).replace("const { diffLines } = await import('diff');","const { diffLines } = D;");
 const js=transformSync(`${body}\nexport {${name}};`,{loader:'ts',format:'cjs',target:'es2022'}).code;
 const mod={exports:{} as Record<string,(...args:unknown[])=>unknown>};new Function('module','exports',...Object.keys(ctx),js)(mod,mod.exports,...Object.values(ctx));return mod.exports[name]!;
}
beforeEach(()=>{ (globalThis as unknown as { document: Document }).document = new JSDOM('<!doctype html><html><body></body></html>').window.document; });
const $=(s:string)=>document.querySelector(s);
const pick=(id:string)=>id;
describe('PF-AUD review and failure UX',()=>{
 it('PF-AUD-U01 failed current revision is labelled failed even while an older preview remains',()=>{
  document.body.innerHTML='<div id="readiness-box"></div>';
  const S={view:{status:'failed',revision:1,error:'worker failed'},project:{revision:2},reports:{print:null,html:null}};
  actual('updateReadiness','/* =============================== struktur',{S,$,$$:()=>[],el,t,pick,hasContent:()=>true,updateFlow:()=>{},issueCount:()=>0})( );
  expect($('#readiness-box')!.textContent).toContain('Gagal diproses');
  expect($('#readiness-box')!.textContent).not.toContain('Memproses');
 });
 it('PF-AUD-U02 large conversion uses full before/after review without thousands of DOM rows',async()=>{
  document.body.innerHTML='<div id="diff-view"></div><div id="diff-desc"></div><div id="diff-issues"></div><dialog id="dlg-diff"></dialog>';
  const before='BEFORE intact \uE001 code \\(x\\)\n'.repeat(2200),after='AFTER intact \uE001 code \\(x\\)\n'.repeat(2200);
  const show=actual('showDiff','/* =============================== assets',{ $,el,t,pick,D:{diffLines},reviewDiff,openDialog:async()=> 'cancel',downloadBytes:()=>{},fmtBytes:(n:number)=>String(n),C:{utf8Length:(s:string)=>new TextEncoder().encode(s).length} });
  expect(await show(before,after,'Review')).toBe(false);
  const panels=[...document.querySelectorAll<HTMLTextAreaElement>('#diff-view textarea')];
  expect(panels.length).toBe(2);
  expect(panels.map(x=>x.value)).toEqual([before,after]);
  expect(document.querySelectorAll('#diff-view *').length).toBeLessThan(20);
  expect($('#diff-desc')!.textContent).toContain('lengkap');
 });
 it('PF-AUD-U02 a small diff preserves all changed lines and whitespace',async()=>{
  const result=await reviewDiff('a\n  old\nz\n','a\n\tnew\nz\n');
  expect(result.kind).toBe('diff');if(result.kind!=='diff')return;
  expect(result.parts.filter(p=>!p.added).map(p=>p.value).join('')).toBe('a\n  old\nz\n');
  expect(result.parts.filter(p=>!p.removed).map(p=>p.value).join('')).toBe('a\n\tnew\nz\n');
 });
 it('PF-AUD-U02 unrelated lines hit a bounded comparison fallback instead of unbounded diff work',async()=>{
  const a=Array.from({length:800},(_,i)=>`old ${i}\n`).join(''),b=Array.from({length:800},(_,i)=>`new ${i}\n`).join('');
  const r=await reviewDiff(a,b);expect(r).toEqual({kind:'full',reason:'complexity'});
  expect(REVIEW_DIFF_LIMITS.maxEditLength).toBeLessThan(1600);
 });
});
