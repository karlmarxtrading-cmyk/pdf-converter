import { JSDOM } from 'jsdom';
import { htmlToMarkdown } from './src/core/clipboard.ts';
import { renderBody } from './src/core/render.ts';
import { parseClipboardConversation } from './src/core/conversation.ts';
const w=new JSDOM('').window;globalThis.window=w;globalThis.document=w.document;globalThis.DOMParser=w.DOMParser;
const result=[];
for(const tag of ['div','template'])for(const n of [64,256,1800,4000,8000]){
 const source=('<'+tag+'>').repeat(n)+'<div data-message-author-role="assistant">KEEP</div>'+('</'+tag+'>').repeat(n);const start=performance.now();
 const row={tag,n};
 try {const r=htmlToMarkdown(source);row.clipboard={ok:r.ok,budget:r.ok?null:r.budget.kind};}
 catch(e){row.clipboard={exception:e.name,message:e.message};}
 try {const r=await renderBody(source,{assets:[],allowExternalImages:false,template:'BUS-01'});row.render={htmlChars:r.html.length};}
 catch(e){row.render={exception:e.name,code:e.code,kind:e.result?.kind,message:e.message};}
 try {const r=parseClipboardConversation({html:source,plain:'KEEP'},'probe');row.conversation={blocking:r.issues.filter(i=>i.blocking).map(i=>i.code),retained:r.conversation.messages[0]?.markdown};}
 catch(e){row.conversation={exception:e.name,message:e.message};}
 row.ms=performance.now()-start;result.push(row);
}
console.log(JSON.stringify(result,null,2));