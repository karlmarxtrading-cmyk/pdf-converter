// Exercises production print modules and a real print.html in local Chromium.
// Synthetic CSS/diagnostics dial exact bytes without a private source document.
import { build } from 'vite';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launch } from './lib.mjs';
import { candidateSha256, treeHash } from '../../scripts/fingerprint.mjs';

const dir = await mkdtemp(join(tmpdir(), 'pf-budget-'));
const output = resolve(process.argv[2] ?? 'evidence/print-budget');
await mkdir(output, {recursive:true});
const modules = {
  'src/core/projects.ts':['createProject'], 'src/core/hash.ts':['makeSnapshot'], 'src/core/limits.ts':['LIMITS'],
  'src/core/render.ts':['renderBody','snapshotRenderOptions'], 'src/render/print-payload.ts':['buildPrintPayload'],
  'src/render/print-client.ts':['preparePrint'], 'src/render/flow-book.ts':['prepareBook','composeBook'],
};
const proofId = 'virtual:pf-print-budget';
let env;
const result = {
  candidateSha256AtStart:candidateSha256(), buildMode:'local production modules plus isolated QA adapter; native print dialog excluded',
  sourceModulesSha256:treeHash([...Object.keys(modules),'src/render/document.ts','src/render/fonts.ts','src/render/print-budget.ts','tests/e2e/rc11-print-budget.mjs']).sha256,
  cases:[],
};
try {
  const bundle = await build({
    logLevel:'error',
    plugins:[{name:'budget-probe', resolveId(id) { if (id === proofId) return '\0'+id; }, load(id) {
      if (id === '\0'+proofId) return Object.entries(modules).map(([file,names]) => 'export {'+names.join(',')+'} from '+JSON.stringify(resolve(file))+';').join('\n');
    }}],
    build:{outDir:dir, rollupOptions:{preserveEntrySignatures:'strict',input:{budgetProbe:proofId}}},
  });
  const entry = bundle.output.find(chunk => chunk.name === 'budgetProbe').fileName;
  env = await launch({dir, port:Number(process.env.PF_BUDGET_PORT || 4502)});
  result.browser = await env.browser.version();
  for (const mode of ['standard','book']) for (const delta of [-1,0,1]) {
    const tab = await env.browser.newPage();
    try {
      await tab.goto(env.base+'/#/workspace');
      const item = await tab.evaluate(async ({entry,mode,delta}) => {
        const api = await import('/'+entry);
        const project = api.createProject({source:'# A06\n\nSumber asli. Terminal 42.',template:'BUS-01'});
        const snap = await api.makeSnapshot(project);
        const rendered = await api.renderBody(snap.source, api.snapshotRenderOptions(snap));
        const note = {id:'boundary',code:'BOUNDARY_NOTE',severity:'info',scope:'pdf',message:'😊\n"'};
        rendered.issues.push(note);
        const limit = api.LIMITS.pdfPayloadBytes;
        const bytes = value => new Blob([value]).size;
        let p = await api.buildPrintPayload(snap, rendered);
        let actual, pages, htmlHash, state, ending, refusal;
        if (mode === 'standard') {
          note.message += 'x'.repeat(limit + delta - bytes(JSON.stringify(p)));
          try {
            p = await api.buildPrintPayload(snap,rendered);
            actual = bytes(JSON.stringify(p));
            const prepared = await api.preparePrint(p);
            pages = prepared.result.pageCount;
            state = prepared.state;
            ending = prepared.frame.contentDocument.querySelector('.pagedjs_pages')?.textContent.includes('Terminal 42.');
            prepared.dispose();
          } catch (e) { refusal = { code:e.code, kind:e.result?.kind, limit:e.result?.limit, message:e.message?.slice(0,300) }; }
        } else {
          p.styles.push('/*'+'<'.repeat(8192)+'*/');
          const basis = bytes(await api.composeBook(p));
          p.styles[p.styles.length-1] = p.styles.at(-1).slice(0,-2) + 'x'.repeat(limit + delta - basis) + '*/';
          try {
            const prepared = await api.prepareBook(p,new AbortController().signal);
            actual = prepared.bytes.byteLength;
            htmlHash = prepared.hash;
            ending = prepared.frame.contentDocument.querySelector('article').textContent.includes('Terminal 42.');
            prepared.dispose();
          } catch (e) { refusal = {code:e.code,kind:e.result?.kind,limit:e.result?.limit,message:e.message?.slice(0,300)}; }
        }
        const clean = !document.querySelector('iframe[title="PaperForma print"],#pf-book-print');
        const intact = project.source === '# A06\n\nSumber asli. Terminal 42.' && snap.source === project.source;
        const ok = clean && intact && (delta === 1 ? refusal?.code === 'BUDGET_EXCEEDED' && refusal.kind === 'pdfPayload' :
          actual === limit + delta && ending === true && (mode !== 'standard' || (pages > 0 && state === 'prepared')));
        return {mode,delta,targetBytes:limit+delta,actual,pages,state,htmlHash,ending,refusal,clean,intact,ok};
      },{entry,mode,delta});
      result.cases.push(item);
      console.log(JSON.stringify(item));
    } finally { await tab.close(); }
  }
  result.ok = result.cases.length === 6 && result.cases.every(c => c.ok);
  if (!result.ok) process.exitCode = 1;
} catch (error) { result.error = String(error?.stack ?? error); result.ok = false; process.exitCode = 1; }
finally {
  result.candidateSha256AtEnd = candidateSha256();
  await writeFile(join(output,'browser.json'),JSON.stringify(result,null,2)+'\n');
  await env?.close();
  await rm(dir,{recursive:true,force:true});
}
