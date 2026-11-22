/** RC9-F01. A normal mouse on a short viewport must reach both actions. Read the
 * physical labels from the browser PDF of the exact downloaded print document. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {launch} from './lib.mjs';

const dir = await mkdtemp(join(tmpdir(), 'paperforma-book-'));
const env = await launch({dir:process.env.PF_BOOK_DIST || 'dist',port:4886});
try {
  const ctx = await env.browser.createBrowserContext({downloadBehavior:{policy:'allow',downloadPath:dir}});
  const page = await ctx.newPage();
  await page.setViewport({width:800,height:600});
  await page.goto(env.base + '/#/workspace');
  const md = '# Heading mIxEd\n\n## Second parT\n\n<ol start="2048" reversed><li></li><li>beta</li><li value="17"></li><li></li></ol>\n\n| A | B |\n|---|---|\n| V1 | V2 |\n\nFinal tAiL';
  const input = join(dir, 'markers.md');
  await writeFile(input, md);
  await (await page.waitForSelector('#file-open')).uploadFile(input);
  await page.waitForFunction(() => document.querySelector('#editor')?.value.includes('Final tAiL'));
  await page.$eval('.ws-actions [data-action=publish]', el => el.click());
  await page.waitForSelector('#dlg-publish[open]');
  await page.click('input[value="print-book"]');
  if (await page.$('#pub-ack')) await page.click('#pub-ack');
  await page.waitForFunction(() => !document.querySelector('#pub-go').disabled);
  await page.click('#pub-go');
  await page.waitForSelector('#book-html-hash');
  const digest = await page.$eval('#book-html-hash', el => el.dataset.sha256);
  await page.click('#book-open-print');
  await page.waitForFunction(() => /dialog.*(closed|requested)|dialog cetak.*(ditutup|diminta)/i.test(document.querySelector('.print-state')?.textContent || ''));
  await page.click('#book-save-html');
  let htmlName;
  for (let tries = 0; tries < 100 && !htmlName; tries++) {
    htmlName = (await readdir(dir)).find(name => name.endsWith('.html'));
    if (!htmlName) await delay(100);
  }
  assert.ok(htmlName, 'print HTML was downloaded through the visible control');
  const htmlPath = join(dir,htmlName);
  assert.equal(createHash('sha256').update(await readFile(htmlPath)).digest('hex'),digest);
  const book = await ctx.newPage();
  await book.setOfflineMode(true);
  await book.goto(pathToFileURL(htmlPath).href);
  await book.evaluate(()=> document.fonts.ready);
  assert.deepEqual(await book.$$eval('nav.pf-toc a', links => links.map(link => document.getElementById(link.hash.slice(1))?.textContent)), ['Heading mIxEd','Second parT']);
  const pdf = join(dir,'markers.pdf');
  await book.pdf({path:pdf,preferCSSPageSize:true,printBackground:true});
  const pages = execFileSync('pdftotext',['-layout',pdf,'-'],{encoding:'utf8'}).split('\f').filter(text => text.trim());
  assert.equal(pages.length, 3, 'cover, contents and article');
  assert.ok(!/\b1\s*$/.test(pages[0]));
  assert.match(pages[1],/\b1\s*$/);
  assert.match(pages[2],/Heading mIxEd\s+Second parT/);
  assert.match(pages[2],/2048\.\s+2047\.\s+beta\s+17\.\s+16\./);
  assert.match(pages[2],/V1\s+V2\s+Final tAiL\s+2\s*$/);
  // Inspect PDF destinations separately from the source HTML fragment test.
  const destinations = JSON.parse(execFileSync(process.env.PF_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),['-c',
    'import fitz,json,sys; d=fitz.open(sys.argv[1]); print(json.dumps([[x.get("page") for x in p.get_links()] for p in d]))',pdf],{encoding:'utf8'}));
  assert.deepEqual(destinations, [[],[2,2],[]]);
  if (process.argv.includes('--retain')) {
    const manifest = JSON.parse(await readFile('dist.build-manifest.json','utf8'));
    assert.equal(process.env.PF_BOOK_DIST || 'dist','dist');
    const output = 'examples/rc12/book-markers';
    const evidence = 'evidence/rc12/book-markers';
    await mkdir(output,{recursive:true}); await mkdir(evidence,{recursive:true});
    await copyFile(pdf,join(output,'book.pdf')); await copyFile(htmlPath,join(output,'print.html'));
    const pdfBytes = await readFile(pdf);
    const sha256 = data => createHash('sha256').update(data).digest('hex');
    const receipt = {status:'PASS',method:'Chromium UI pointer controls; standalone print HTML saved from the product and reopened offline; CDP PDF bytes independently inspected by Poppler and PyMuPDF.',
      candidateSha256:manifest.candidateSha256,distTreeSha256:manifest.distTreeSha256,platform:process.platform,
      chromium:await env.browser.version(),viewport:{width:800,height:600},sourceSha256:sha256(md),
      printHtmlSha256:digest,pdfSha256:sha256(pdfBytes),pdfBytes:pdfBytes.length,pages:pages.length,
      pdfText:pages,pdfDestinationPagesZeroBased:destinations,pageLabels:['','1','2']};
    await writeFile(join(evidence,'run.json'), JSON.stringify(receipt,null,2)+'\n');
  }
  console.log('PASS · physical controls, cover, linked contents, complete ordered labels, heading case, table, tail, page labels and print HTML digest');
} finally {
  await env.close();
  await rm(dir,{recursive:true,force:true});
}
