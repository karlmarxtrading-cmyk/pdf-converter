// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import { exportHtml } from '../../../src/render/exports';
import { buildPrintPayload } from '../../../src/render/print-payload';
import { prepareBody } from '../../../src/render/document';
import { realDoc, nodeFontSource } from './helpers';

it('only reuses a view with matching bytes and keeps concurrent builds independent',async()=>{
  const doc = await realDoc('# Judul\n\n$x-17$ dan $$y+31$$.','BUS-01');
  expect(checkRenderIntegrity(doc.snapshot.source,doc.body).ok).toBe(true);
  const options={fontSource:nodeFontSource, renderMermaid:false};
  const [screen,print] = await Promise.all([exportHtml({...doc,...options,profile:'standalone'}),buildPrintPayload(doc.snapshot,doc.body,options)]);
  const parse = (s:string) => new DOMParser().parseFromString(s,'text/html');
  for(const html of [screen.html,print.bodyInner]) {
    expect([...parse(html).querySelectorAll('article annotation')].map(m=>m.textContent)).toEqual(['x-17','y+31']);
  }
  expect(screen.html).toContain('pf-screen');expect(print.bodyClass).toContain('pf-print');
  const bad = await realDoc('# Judul\n\n$x-17$.','BUS-01');
  bad.body.html=bad.body.html.replace('data-tex="x-17"','data-tex="x+17"');
  expect(checkRenderIntegrity(bad.snapshot.source,bad.body).ok).toBe(false);
  await expect(buildPrintPayload(bad.snapshot,bad.body,options)).rejects.toMatchObject({code:'PRINT_BLOCKED'});
  await expect(exportHtml({...bad,...options,profile:'standalone'})).rejects.toMatchObject({code:'EXPORT_BLOCKED'});
});

it('an exported/returned view can be modified without poisoning subsequent conversions',async()=>{
  const doc = await realDoc('Uji $x-17$.','BUS-01');
  const prepare = () => prepareBody(doc.snapshot,doc.body,{mode:'screen',renderMermaid:false,allowExternalImages:false});
  const first=await prepare();
  first.html='<p>TAMPER</p>';first.fontText='TAMPER';
  const second=await prepare();
  expect(second.html).toContain('x-17');
  expect(second.html).not.toContain('TAMPER');
  expect(second.fontText).not.toContain('TAMPER');
});
