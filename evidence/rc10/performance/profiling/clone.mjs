import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
const w=new JSDOM('').window;const html=readFileSync('rc10/examples/reference-rc6/RUMUS TRIGONOMETRI 1.html','utf8');
const root=new w.DOMParser().parseFromString(html,'text/html').querySelector('article');
const text=root.innerHTML;
for(let i=0;i<6;i++) for(const [key,f] of Object.entries({clone:()=>root.cloneNode(true),parse:()=>new w.DOMParser().parseFromString('<body>'+text,'text/html').body,serialize:()=>root.innerHTML})){global.gc();const t=performance.now();f();console.log(i,key,(performance.now()-t).toFixed(0));}
