// @vitest-environment jsdom
// RC4-R02: admission reads raster headers only; these synthetic oversized headers are never decoded as images.
import { describe,it,expect,vi } from 'vitest';
import { renderBody,renderStage1 } from '../../../src/core/render';
import { inspectInlineImage } from '../../../src/core/assets';
import { LIMITS } from '../../../src/core/limits';
import { sha256HexSync } from '../../../src/core/hash';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import type { AssetRecord,Conversation } from '../../../src/core/contracts';
const opts={assets:[],allowExternalImages:false,template:'BUS-01' as const};
function png(w:number,h:number,nonce=0) {
  const b=new Uint8Array(33);
  b.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
  const v=new DataView(b.buffer);v.setUint32(16,w);v.setUint32(20,h);b[24]=8;b[25]=6;b[32]=nonce;return b;
}
const data=(bytes:Uint8Array,mime='image/png')=>`data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const image=(url:string)=>`![inline](${url})`;
const count=(html:string)=>new DOMParser().parseFromString(html,'text/html').querySelectorAll('img').length;
const uploaded=(nonce:number):AssetRecord=>{const bytes=png(6000,6000,nonce);return {id:sha256HexSync(bytes),path:`image-${nonce}.png`,mime:'image/png',bytes,origin:'upload',width:6000,height:6000};};

describe('RC4-R02 inline image decode admission',()=>{
  it('rejects an extreme inline PNG before any image reaches the DOM',async()=>{
    const source=image(data(png(100000,100000)));
    expect((await renderStage1(source,opts)).html).not.toContain('<img');
    const r=await renderBody(source,opts);
    expect(count(r.html)).toBe(0);
    expect(r.issues.some(i=>i.code==='IMAGE_PIXELS_EXCEEDED'&&i.blocking)).toBe(true);
    expect(r.html).not.toContain('data:image/png;base64,');
    expect(checkRenderIntegrity(source,r).ok).toBe(true);
  });
  it.each([data(png(10,10),'image/jpeg'),data(png(0,1)),data(new Uint8Array([1,2,3]))])('rejects mismatched/unreadable header %s',async url=>{
    const r=await renderBody(image(url),opts);
    expect(count(r.html)).toBe(0);
    expect(r.issues.some(i=>i.code==='INLINE_IMAGE_INVALID'&&i.blocking)).toBe(true);
  });
  it('retains ordinary inline PNG and exact original image reference',async()=>{
    // A genuine tiny PNG; image pixels are not decoded by this test.
    const url='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
    const source=image(url);const r=await renderBody(source,opts);
    expect(count(r.html)).toBe(1);
    expect(r.issues.some(i=>i.blocking)).toBe(false);
    expect(checkRenderIntegrity(source,r).ok).toBe(true);
  });
  it('counts unique inline images across one render against the shared 200 MP limit',async()=>{
    const source=Array.from({length:6},(_,i)=>image(data(png(6000,6000,i)))).join('\n\n');
    const r=await renderBody(source,opts);
    expect(count(r.html)).toBe(5);
    expect(r.issues.filter(i=>i.code==='IMAGE_PIXELS_EXCEEDED'&&i.blocking)).toHaveLength(1);
    expect(checkRenderIntegrity(source,r).ok).toBe(true);
  });
  it('deduplicates identical bytes rather than charging every repeated reference',async()=>{
    const source=Array.from({length:8},()=>image(data(png(6000,6000)))).join('\n\n');
    const r=await renderBody(source,opts);
    expect(count(r.html)).toBe(8);
    expect(r.issues.some(i=>i.blocking)).toBe(false);
  });
  it('combines uploaded and inline pixels while deduplicating an identical uploaded image',async()=>{
    const assets=Array.from({length:5},(_,i)=>uploaded(i));
    const blocked=await renderBody(image(data(png(6000,6000,9))),{...opts,assets});
    expect(count(blocked.html)).toBe(0);
    expect(blocked.issues.some(i=>i.code==='IMAGE_PIXELS_EXCEEDED'&&i.blocking)).toBe(true);
    const allowed=await renderBody(image(data(assets[0]!.bytes)),{...opts,assets});
    expect(count(allowed.html)).toBe(1);
    expect(allowed.issues.some(i=>i.blocking)).toBe(false);
  });
  it('keeps one cumulative budget across all messages in a conversation',async()=>{
    const sources=[0,1].map(m=>Array.from({length:3},(_,i)=>image(data(png(6000,6000,3*m+i)))).join('\n\n'));
    const conversation:Conversation={inputId:'conversation-input',outputMode:'transcript',showRoles:true,selectedOrder:['m1','m2'],unresolved:[],
      messages:sources.map((markdown,i)=>({id:`m${i+1}`,role:'assistant',roleConfidence:'confirmed',markdown,selected:true,flags:[],sourceRef:{inputId:'conversation-input',start:0,end:markdown.length,unit:'utf16'}}))};
    const r=await renderBody('',{...opts,conversation});
    expect(count(r.html)).toBe(5);
    expect(r.issues.filter(i=>i.code==='IMAGE_PIXELS_EXCEEDED'&&i.blocking)).toHaveLength(1);
  });
  it('checks encoded byte size before base64 decoding or allocating image bytes',()=>{
    const decode=vi.spyOn(globalThis,'atob');
    try {
      const r=inspectInlineImage(data(png(1,1)),{...LIMITS,assetBytes:32});
      expect(r.ok).toBe(false);
      if(!r.ok) expect(r.code).toBe('BUDGET_EXCEEDED');
      expect(decode).not.toHaveBeenCalled();
      expect(inspectInlineImage(data(png(1,1)),{...LIMITS,assetBytes:33}).ok).toBe(true);
    } finally { decode.mockRestore(); }
  });
  it.each(['image/gif','image/jpeg','image/webp'])('validates %s header dimensions without decoding the raster',mime=>{
    const header=(w:number,h:number)=>{
      const b=new Uint8Array(30), v=new DataView(b.buffer);
      if(mime==='image/gif') { b.set([71,73,70,56,57,97]);v.setUint16(6,w,true);v.setUint16(8,h,true); }
      else if(mime==='image/jpeg') { b.set([255,216,255,192,0,17,8]);v.setUint16(7,h);v.setUint16(9,w); }
      else { b.set([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,88,10,0,0,0]);b[24]=(w-1)&255;b[25]=((w-1)>>8)&255;b[27]=(h-1)&255;b[28]=((h-1)>>8)&255; }
      return b;
    };
    expect(inspectInlineImage(data(header(10,10),mime)).ok).toBe(true);
    const r=inspectInlineImage(data(header(60000,10),mime));
    expect(r.ok).toBe(false);
    if(!r.ok) expect(r.code).toBe('IMAGE_PIXELS_EXCEEDED');
  });
});
