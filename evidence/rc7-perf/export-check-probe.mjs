// From candidate root: CHROME_PATH=/path/to/chromium node evidence/rc7-perf/export-check-probe.mjs ../rc6
// Isolate the final static checks on exactly the same BUS-01 exported HTML in a single browser process.
import { resolve, join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';
import { findChromium } from '../../scripts/browser-path.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const html=await readFile('examples/rc7/RC7_TRIGONOMETRI_BUS-01.html','utf8');
const browser=await puppeteer.launch({executablePath:findChromium(),headless:true,pipe:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage();
  const sourceHash={};
  for(const [label,dir] of [['rc6',resolve(process.argv[2])],['rc7',process.cwd()]]){
    const all=await readFile(join(dir,'src/render/exports.ts'),'utf8');
    const fn=all.slice(all.indexOf('export function staticChecks('),all.indexOf('interface Prepared '));
    if(!fn.startsWith('export function staticChecks') || !fn.trimEnd().endsWith('}'))throw Error('Could not isolate the exact function');
    const imports=label==='rc7' ? 'import {hasKatexLayout} from "./src/render/katex-style.ts";\n' : '';
    const bundle=await build({stdin:{contents:imports+fn,resolveDir:dir,loader:'ts'},bundle:true,format:'iife',globalName:'probe'+label,platform:'browser',write:false,logLevel:'silent'});
    sourceHash[label]=hash(fn);
    await page.addScriptTag({content:bundle.outputFiles[0].text});
  }
  const runs=await page.evaluate(source=>{
    const runs=[];
    for(let i=-3;i<24;i++){
      const rec={};
      for(const label of (i%2?['rc7','rc6']:['rc6','rc7'])){
        const now=performance.now();const verdict=window['probe'+label].staticChecks(source,{scriptsAllowed:false,networkAllowed:false});
        rec[label]=performance.now()-now;
        if(verdict.some(x=>x.status==='fail'))throw Error('Output failed '+label+' checks');
      }
      if(i>=0)runs.push(rec);
    }
    return runs;
  },html);
  const summary={};
  for(const label of ['rc6','rc7']) {
    const v=runs.map(r=>r[label]).toSorted((a,b)=>a-b);
    summary[label]={medianMs:(v[11]+v[12])/2,p95Ms:v[22],minMs:v[0],maxMs:v[23]};
  }
  const out={method:'Independent warm browser microbenchmark of exported staticChecks on identical real BUS-01 full HTML; three warmups, 24 AB/BA pairs, includes creating inert template, DOM traversal, checking remote resources, anchors and (RC7) required CSS; excludes renderer, fonts, UI and download.',browser:await browser.version(),htmlSha256:hash(html),sourceHash,summary,runs};
  await writeFile('evidence/rc7-perf/export-check-profile.json',JSON.stringify(out,null,2)+'\n'); console.log(summary);
}finally{await browser.close();}
