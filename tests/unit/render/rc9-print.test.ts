// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {paginateInFrame} from '../../../src/render/print-client';
import {fragmentPrintText} from '../../../src/render/paginate';
import type {PrintMessage,PrintPayload} from '../../../src/render/print-types';
const payload={jobId:'synthetic-9',page:{widthMm:210},bodyInner:'x'.repeat(1_000_000)} as PrintPayload;
const send=(m:PrintMessage,frame=document.querySelector('iframe')!)=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:frame.contentWindow,data:m}));
afterEach(()=>{vi.useRealTimers();document.body.replaceChildren();});
describe('print job deadlines',()=>{
  it('accepts a healthy large job after 180 seconds',async()=>{
    vi.useFakeTimers();const job=paginateInFrame(payload);
    send({type:'pf-print-ready'});
    for(let page=1;page<=5;page++){
      await vi.advanceTimersByTimeAsync(40_000);
      send({type:'pf-print-progress',jobId:payload.jobId,phase:'paginate',pass:1,pages:page});
    }
    send({type:'pf-print-result',jobId:payload.jobId,result:{status:'ok'} as never});
    await expect(job).resolves.toMatchObject({result:{status:'ok'}});expect(document.querySelector('iframe')).toBeNull();
  });
  it.each(['startup','stall','total','load','abort'])('diagnoses %s, cleans up and permits retry',async(kind)=>{
    vi.useFakeTimers();const ctrl=new AbortController();
    const result=paginateInFrame(payload,{startupMs:10,stallMs:12,timeoutMs:30,signal:ctrl.signal}).catch(e=>e);
    if(kind!=='startup')send({type:'pf-print-ready'});
    const progress=(pages:number)=>send({type:'pf-print-progress',jobId:payload.jobId,phase:'paginate',pass:1,pages});
    if(kind==='stall'){progress(2);await vi.advanceTimersByTimeAsync(8);progress(2);progress(1);}
    if(kind==='total')for(let i=1;i<=3;i++){progress(i);await vi.advanceTimersByTimeAsync(9);}
    if(kind==='load')document.querySelector('iframe')!.dispatchEvent(new Event('error'));
    if(kind==='abort')ctrl.abort();
    await vi.advanceTimersByTimeAsync(31);
    const e=await result;expect(e.failure.code).toBe(({startup:'FRAME_STARTUP_TIMEOUT',stall:'FRAME_STALLED',total:'FRAME_DEADLINE',load:'FRAME_LOAD_FAILED',abort:'ABORTED'})[kind]);
    expect(document.querySelector('iframe')).toBeNull();
    const retry=paginateInFrame(payload);send({type:'pf-print-ready'});
    send({type:'pf-print-result',jobId:payload.jobId,result:{status:'ok'} as never});await retry;
  });
});
it('preserves Unicode, link ownership and every code unit in print fragments',()=>{
  const holder=document.createElement('div');holder.innerHTML='<p><a>ajar 😊 &amp; Élève　</a></p><code>raw</code>';
  const a=holder.querySelector('a')!,code=holder.querySelector('code')!;
  const value=a.textContent!.repeat(1250);a.textContent=value;code.textContent=value;
  fragmentPrintText(holder);expect(a.textContent).toBe(value);expect(code.children.length).toBe(0);
  let offset=0;for(const span of a.children){expect(span.getAttribute('data-pf-text-offset')).toBe(String(offset));offset+=span.textContent!.length;}
  expect(offset).toBe(value.length);
});
