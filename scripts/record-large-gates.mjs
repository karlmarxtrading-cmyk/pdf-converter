// Rebuild U receipts from actual observation references for this acceptance run.
// Absent or failed outputs cannot earn PASS; reasons remain visible per gate.
import { existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli } from './acceptance.mjs';
import { largeIds,publicCases,privateCase } from './large-policy.mjs';
import { acceptance,evidence,examples } from './release-paths.mjs';

const root=process.cwd(), dir=acceptance+'/observations', reports=new Map();
const E=p=>evidence+'/'+p;
const bookNames=[...publicCases,privateCase];
const books=Object.fromEntries(bookNames.map(name=>[name,E('book/'+name+'.json')]));
const html=Object.fromEntries(publicCases.map(name=>[name,examples+'/book/'+name+'/dokumen.html']));
const byGate={
  U01:{books},U02:{browser:E('lifecycle/cancel-stages.json'),control:E('lifecycle/client-timing.json'),large:E('lifecycle/large-cancel.json')},
  U03:{browser:E('accounting/browser.json'),control:E('accounting/control-flow.json')},U04:{books},
  U05:{navigation:E('offline/navigation.json'),trig:E('browser/results/trigonometry-downloads.json'),privateHtml:books[privateCase],html},
  U06:{syntheticControl:E('accounting/capacity-validator-control.json')},U07:{interleaved:E('integrity/interleaved.json')},U08:{list:E('ordered-lists/result.json')}
};
const requested=process.argv.slice(2);
if (requested.some(id=>!largeIds.includes(id))) throw Error('Expected gate IDs U01 to U08');
const ids=requested.length?requested:largeIds;
if (existsSync(dir)) for (const name of readdirSync(dir).filter(p=>p.endsWith('.json'))) {
  const obs=JSON.parse(readFileSync(join(dir,name)));
  reports.set(obs.name,obs);
}
const pathValues=v=>typeof v==='string'?[v]:Object.values(v).flatMap(pathValues);
for (const id of ids) {
  const files=byGate[id],paths=pathValues(files);
  if (['U01','U04'].includes(id)) for (const name of publicCases) for (const file of ['buku.html','dokumen.pdf']) paths.push(examples+'/book/'+name+'/'+file);
  if (id==='U05') for (const t of ['BUS-01','CON-01','EDT-01','EDU-01']) paths.push(examples+'/html/'+t+'.html');
  const names=[...reports.values()].filter(o=>o.exitCode===0 && !o.signal && !o.failures.length && paths.some(p=>p in o.artifacts));
  const observed=new Set(names.flatMap(o=>Object.keys(o.artifacts))),missing=paths.filter(p=>!observed.has(p));
  const fact=E('u-facts/'+id+'.json');
  mkdirSync(E('u-facts'),{recursive:true});
  writeFileSync(fact,JSON.stringify({observations:names.map(o=>o.name),files},null,2)+'\n');
  try {
    if (missing.length) throw Error('Missing successful current evidence: '+missing.join(', '));
    cli(root,['record',id,'PASS',fact]);
  } catch (error) {
    const failed=[...reports.values()].filter(o=>(o.exitCode!==0 || o.signal || o.failures.length) && paths.some(p=>p in o.artifacts));
    const measured=Object.values(files).some(v=>pathValues(v).some(p=>existsSync(p)));
    const status=failed.length || measured ? 'FAIL':'NOT_RUN';
    const reasons=[error.message,...failed.map(o=>o.name+' exit '+o.exitCode+' '+o.failures.join(', '))];
    cli(root,['record',id,status,'--reason',reasons.join('. ')]);
  }
}
