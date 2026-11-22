// Run from the candidate root: PF_CHROME=/path/to/chrome node tests/bench/performance-browser.mjs ../rc6 1
import puppeteer from 'puppeteer-core';
import { cp,copyFile,writeFile,readFile,mkdtemp,mkdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import { startServer } from '../../scripts/serve-dist.mjs';
import { findChromium } from '../../scripts/browser-path.mjs';
import { generateStress } from '../../scripts/generate-stress.mjs';
import { protocol,outputDir,bindings,environment,load,summarize,atomic } from './performance-binding.mjs';
const baseline=resolve(process.argv[2]),cohort=Number(process.argv[3]),calibrate=process.argv[3]==='calibrate',diagnose=process.argv[3]==='diagnose',pilot=calibrate||diagnose;
if(!pilot&&![1,2].includes(cohort))throw Error('Expected cohort 1/2 or calibrate');
const dir=await mkdtemp(join(tmpdir(),'paperforma-paired-')),dest=pilot?resolve(diagnose?'diagnostic-browser.json':'../work8/perf-calibrate-browser.json'):join(outputDir,'cohort-'+cohort+'.json');
await mkdir(outputDir,{recursive:true});
const out={schema:1,runId:crypto.randomUUID(),pid:process.pid,cohort,before:bindings(baseline,process.cwd(),calibrate),environment:environment(),protocol,runs:[],status:'RUNNING'};
const pages={},servers=[];let browser;
try{
  browser=await puppeteer.launch({executablePath:findChromium(),headless:true,pipe:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--lang=id-ID']});
  out.environment.browser=await browser.version();
  for(const label of ['rc6','candidate']){
    const source=label==='rc6'||calibrate?baseline:process.cwd(), staged=join(dir,label), folder=join(staged,'perf');
    await cp(join(source,'dist'),staged,{recursive:true,dereference:true});await mkdir(folder);
    await copyFile(join(staged,'index.html'),join(folder,label+'.html'));
    await writeFile(join(folder,'manifest.json'),JSON.stringify({[label]:{version:out.before[label].version}}));
    await copyFile('tests/bench/performance-page.js',join(folder,'benchmark.js'));
    await copyFile('tests/bench/performance-oracle.mjs',join(folder,'oracle.js'));
    await copyFile('examples/reference-rc6/RUMUS TRIGONOMETRI 1.html',join(folder,'accepted.html'));
    await copyFile('fixtures/rc6/user-trigonometry.expected.json',join(folder,'expected.json'));
    await copyFile('fixtures/rc6/user-trigonometry.md',join(folder,'trig.txt'));
    await writeFile(join(folder,'long.txt'),generateStress(24));
    await writeFile(join(folder,'index.html'),'<!doctype html><meta charset="utf-8"><title>Performance controller</title><div id="frame"></div><script type="module" src="./benchmark.js"></script>');
    await writeFile(join(staged,'_headers'),await readFile(join(staged,'_headers'),'utf8')+"\n/perf/index.html\n  Content-Security-Policy: default-src 'self'; script-src 'self'; frame-src 'self'; connect-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'\n");
    const server=await startServer(staged,0);servers.push(server);
    const context=await browser.createBrowserContext(),page=await context.newPage();
    await page.setViewport({width:protocol.settings.viewport[0],height:protocol.settings.viewport[1]});await page.goto('http://127.0.0.1:'+server.address().port+'/perf/index.html');
    pages[label]=page;
  }
  for(const task of Object.keys(protocol.browserFlows).filter(t=>!pilot||!process.argv[4]||t===process.argv[4])){
    const rounds=pilot?1:protocol.pairs;
    for(let round=-1;round<rounds;round++){
      const order=(round+(cohort===2?1:0))%2?['candidate','rc6']:['rc6','candidate'];
      for(const label of order){
        const page=pages[label];await page.bringToFront();const at=load();let row;
        try{row=await page.evaluate(async args=>(await import('./benchmark.js')).sample(...args),[label,task,round]);}
        catch(e){row={label,task,round,times:{},oracle:{pass:false},error:String(e.message)};}
        out.runs.push({...row,timestamp:at.at,load:at.loadavg});atomic(dest,out);
        if(row.error)throw Error(JSON.stringify(row));
      }
      if(round%5===0)console.log(task,round);
    }
  }
  out.after=bindings(baseline,process.cwd(),calibrate);
  if(JSON.stringify(out.before)!==JSON.stringify(out.after))throw Error('Candidate changed during measurement');
  Object.assign(out,summarize(out,protocol.browserFlows));
  if(pilot)out.status=calibrate?'CALIBRATED':'DIAGNOSTIC_COMPLETE';
}catch(e){out.status='FAIL';out.error=String(e.stack);console.error(out.error);}
finally{await browser?.close();for(const s of servers)await new Promise(r=>s.close(r));await rm(dir,{recursive:true,force:true});atomic(dest,out);}
if(!['PASS','CALIBRATED','DIAGNOSTIC_COMPLETE'].includes(out.status)) process.exitCode=1;
