// Populate a *separate local QA server*'s document root. Never point at a production dist.
// node tests/bench/rc7-browser-stage.mjs /path/to/RC6 /path/to/local/benchmark/server-root [candidate]
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { generateStress } from '../../scripts/generate-stress.mjs';
const baseline = resolve(process.argv[2]);
const root = resolve(process.argv[3]);
if ([resolve('dist'), join(baseline,'dist')].includes(root)) throw Error('Choose a separate local serving directory');
const dirs = { rc6: join(baseline,'dist') };
if (process.argv[4]==='candidate') dirs.rc7=resolve('dist');
const folder=join(root,'perf');
await mkdir(folder,{recursive:true}); await mkdir(join(root,'assets'),{recursive:true});
const sha = buf => createHash('sha256').update(buf).digest('hex');
const fileHash = async path => sha(await readFile(path));
const manifest={};
for(const [name,dir] of Object.entries(dirs)) {
  const index=join(dir,'index.html');
  await copyFile(index,join(folder,name+'.html'));
  const build=JSON.parse(await readFile(join(dir,'../dist.build-manifest.json')));
  const assets=await readdir(join(dir,'assets'));
  for(const asset of assets){
    const dest=join(root,'assets',asset), src=join(dir,'assets',asset);
    if (!existsSync(dest)) await copyFile(src,dest);
    if(await fileHash(dest)!==await fileHash(src))throw Error('Conflicting hashed asset '+asset);
  }
  if(!existsSync(join(root,'print.html'))) await copyFile(join(dir,'print.html'),join(root,'print.html'));
  manifest[name]={version:build.version,tree:build.distTreeSha256,src:build.candidateSha256,
    printTreeMatches:await fileHash(join(root,'print.html'))===await fileHash(join(dir,'print.html')),
    index:await fileHash(index)};
}
await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2));
await copyFile(resolve('fixtures/rc6/user-trigonometry.md'),join(folder,'trig.txt'));
await writeFile(join(folder,'long.txt'),generateStress(24));
await copyFile(resolve('tests/bench/rc7-browser-page.js'),join(folder,'benchmark.js'));
await writeFile(join(folder,'index.html'),'<!DOCTYPE html><meta charset="utf-8"><title>PaperForma performance lab</title><main><h1>PaperForma performance lab</h1><button id="run">Run benchmark</button> <button id="save" disabled>Save samples</button><p id="progress" role="status">Loading</p><div id="frame"></div></main><script type="module" src="./benchmark.js"></script>');
console.log('Open /perf/index.html?mode=calibrate followed by ?mode=compare. Only measures matching print entry.');
