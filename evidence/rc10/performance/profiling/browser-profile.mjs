import puppeteer from 'puppeteer-core';
import { cp,copyFile,writeFile,readFile,mkdtemp,mkdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { startServer } from '../../rc10/scripts/serve-dist.mjs';
import { generateStress } from '../../rc10/scripts/generate-stress.mjs';
import { createHash } from 'node:crypto';
const root=process.cwd(),out='work10/perf/browser-profile.json',temp=await mkdtemp(join(tmpdir(),'pf-rc10-pilot-'));
const sides={rc6:'rc6/dist',rc9:'rc9f/dist',rc10:'work10/perf/browser-candidate-build'};
const browser=await puppeteer.launch({executablePath:'/tmp/chromium',headless:true,pipe:true,protocolTimeout:60000,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--lang=id-ID']});
const contexts=[],pages={},servers=[],rows=[],distIndex={};
try{
for(const [name,dist] of Object.entries(sides)){
 const stage=join(temp,name),folder=join(stage,'perf');await cp(dist,stage,{recursive:true});await mkdir(folder);
 const app=await readFile(join(stage,'index.html'),'utf8'),version=app.match(/name="pf-version" content="([^"]+)"/)?.[1];
 distIndex[name]={version,indexSha256:createHash('sha256').update(app).digest('hex')};
 const label=name==='rc6'?'rc6':'candidate';
 await writeFile(join(folder,label+'.html'),app);
 await writeFile(join(folder,'manifest.json'),JSON.stringify({[label]:{version}}));
 for(const [src,dst] of Object.entries({'tests/bench/performance-page.js':'benchmark.js','tests/bench/performance-oracle.mjs':'oracle.js','examples/reference-rc6/RUMUS TRIGONOMETRI 1.html':'accepted.html','fixtures/rc6/user-trigonometry.expected.json':'expected.json','fixtures/rc6/user-trigonometry.md':'trig.txt'})) await copyFile(resolve(root,'rc10',src),join(folder,dst));
 await writeFile(join(folder,'long.txt'),generateStress(24));
 await writeFile(join(folder,'index.html'),'<!doctype html><meta charset="utf-8"><div id="frame"></div><script type="module" src="./benchmark.js"></script>');
 await writeFile(join(stage,'_headers'),await readFile(join(stage,'_headers'),'utf8')+"\n/perf/index.html\n  Content-Security-Policy: default-src 'self'; script-src 'self'; frame-src 'self'; connect-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'\n");
 const srv=await startServer(stage,0);servers.push(srv);
 const ctx=await browser.createBrowserContext();contexts.push(ctx);
 const page=await ctx.newPage();pages[name]=page;await page.setViewport({width:1366,height:900});await page.goto('http://127.0.0.1:'+srv.address().port+'/perf/index.html');
}
for(let round=0;round<2;round++)for(const name of round%2?['rc10','rc9','rc6']:['rc6','rc9','rc10']){
 const page=pages[name],label=name==='rc6'?'rc6':'candidate';await page.bringToFront();
 try{const row=await page.evaluate(async(label,r)=>await (await import('./benchmark.js')).sample(label,'trig',r),label,round);
 rows.push({name,round,times:row.times,oracle:row.oracle,observations:row.observations});console.log(name,round,row.times);}
 catch(e){rows.push({name,round,error:String(e)});console.log(name,round,String(e));}
 await writeFile(out,JSON.stringify({kind:'pre-freeze diagnostic',browser:await browser.version(),distIndex,rows},null,2));
}
}finally{await browser.close();for(const s of servers)await new Promise(r=>s.close(r));await rm(temp,{recursive:true,force:true});}
