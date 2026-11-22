/** Audit characterization, NOT a release acceptance test. Application files remain untouched. */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { renderBody } from '../work/src/core/render';
import { checkRenderIntegrity } from '../work/src/core/integrity';
import { htmlToMarkdown } from '../work/src/core/clipboard';
import { preflight } from '../work/src/core/preflight';
import { scanMath } from '../work/src/core/math';
import { sourceRawHtmlSignature } from '../work/src/core/raw-html-integrity';
import { exportHtml } from '../work/src/render/exports';
import { realDoc, nodeFontSource } from '../work/tests/unit/render/helpers';

const options = { assets: [], template: 'BUS-01' as const, allowExternalImages: false };
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const evidence: Record<string, unknown> = {};
const codes = (issues: {code: string}[]) => issues.map(i => i.code);
const mathStatus = (source: string, body: Awaited<ReturnType<typeof renderBody>>) =>
  preflight({source, assets: [], renderInputHash: 'current'}, body, {target: 'html'}).categories.find(c => c.category === 'math')?.status;

afterAll(() => writeFileSync('../math_review/probe-results.json', JSON.stringify({
  method: 'Independent source/DOM/API characterization using real RC7 implementations; no browser layout or PDF execution',
  ...evidence,
}, null, 2) + '\n'));

describe('RC7 independent math and raw HTML audit', () => {
  it('compares all original user formulas against the independent pre-existing payload oracle', async () => {
    const source = readFileSync('fixtures/rc6/user-trigonometry.md', 'utf8');
    const oracle = JSON.parse(readFileSync('fixtures/rc6/user-trigonometry.expected.json', 'utf8'));
    const sourceHash = createHash('sha256').update(source).digest('hex');
    expect(sourceHash).toBe(oracle.input_sha256);
    const rendered = await renderBody(source, options);
    const document = dom(rendered.html);
    const nodes = [...document.querySelectorAll('.pf-math')];
    const mismatches = nodes.flatMap((el, index) => {
      const expected = oracle.formulas[index];
      return !expected || el.getAttribute('data-tex') !== expected.expected ||
        el.getAttribute('data-source-tex') !== expected.raw ||
        el.classList.contains('pf-math-display') !== expected.display ||
        el.querySelectorAll('annotation[encoding="application/x-tex"]').length !== 1 ||
        el.querySelector('annotation[encoding="application/x-tex"]')?.textContent !== expected.expected ? [index] : [];
    });
    const integrity = checkRenderIntegrity(source, rendered);
    const record = {
      sourceHash, count: nodes.length, expected: oracle.formulas.length,
      display: nodes.filter(n => n.classList.contains('pf-math-display')).length,
      katex: document.querySelectorAll('.katex').length, mathml: document.querySelectorAll('math').length,
      changedBodies: scanMath(source).spans.filter(s => s.renderTex !== undefined).length,
      mismatches, errors: codes(rendered.issues.filter(i => i.severity === 'error')),
      residualWarning: codes(rendered.issues).includes('MATH_UNRENDERED_SOURCE'),
      mathStatus: mathStatus(source, rendered), integrityOk: integrity.ok,
      recovery: rendered.issues.find(i => i.code === 'MATH_COPY_RECOVERED'),
    };
    evidence.originalFixture = record;
    expect(record).toMatchObject({count: 231, display: 128, katex: 231, mathml: 231,
      changedBodies: 17, mismatches: [], errors: [], residualWarning: false, mathStatus: 'review', integrityOk: true});
  });

  it('characterizes independent content inside source-attribute wrappers across safe container tags', async () => {
    const records = [];
    for (const inner of [
      '<p>KEEP-INDEPENDENT-CONTENT</p>',
      '<section>KEEP-INDEPENDENT-CONTENT</section>',
      '<details><summary>KEEP-INDEPENDENT-CONTENT</summary>Extra content.</details>',
      '<dl><dt>KEEP-INDEPENDENT-CONTENT</dt><dd>Definition.</dd></dl>',
      '<div>KEEP-INDEPENDENT-CONTENT</div>',
      '<figure><figcaption>KEEP-INDEPENDENT-CONTENT</figcaption></figure>',
    ]) {
      const source = '<div data-latex="x+1">' + inner + '<span>x+1</span></div>';
      for (const route of ['raw', 'clipboard']) {
        const converted = route === 'clipboard' ? htmlToMarkdown(source) : null;
        if (converted && !converted.ok) throw new Error(converted.message);
        const renderedSource = converted?.markdown ?? source;
        const rendered = await renderBody(renderedSource, options);
        const document = dom(rendered.html);
        const integrity = checkRenderIntegrity(renderedSource, rendered);
        records.push({source, route, markdown: converted?.markdown, output: document.body.innerHTML,
          keptContent: document.body.textContent?.includes('KEEP-INDEPENDENT-CONTENT'),
          formulas: document.querySelectorAll('.pf-math').length,
          importIssues: codes(converted?.issues ?? []), renderIssues: codes(rendered.issues),
          integrityOk: integrity.ok, integrityIssues: codes(integrity.issues), mathStatus: mathStatus(renderedSource, rendered),
        });
      }
    }
    evidence.mixedWrappers = records;
    expect(records).toHaveLength(12);
  });

  it('characterizes formula payload damage while provenance remains unchanged', async () => {
    const records = [];
    for (const source of ['$x+1$', '<div>Formula \\(x+1\\)</div>']) {
      const rendered = await renderBody(source, options);
      const original = dom(rendered.html);
      expect(original.querySelectorAll('.katex')).toHaveLength(1);
      for (const [name, mutate] of Object.entries({
        emptyFormula: (el: Element) => el.replaceChildren(),
        eraseVisual: (el: Element) => el.querySelector('.katex-html')?.remove(),
        eraseMathml: (el: Element) => el.querySelector('.katex-mathml')?.remove(),
        changeTexAnnotation: (el: Element) => { el.querySelector('annotation')!.textContent = 'y-999'; },
        changeMathml: (el: Element) => { el.querySelector('mi')!.textContent = 'z'; },
        changeSourceAttribute: (el: Element) => el.setAttribute('data-source-tex', 'z-999'),
        changeDisplayMode: (el: Element) => el.classList.toggle('pf-math-display'),
        changeCanonicalAttribute: (el: Element) => el.setAttribute('data-tex', 'z-999'),
      })) {
        const document = dom(rendered.html);
        mutate(document.querySelector('.pf-math')!);
        const report = checkRenderIntegrity(source, document.body);
        records.push({source, mutation: name, integrityOk: report.ok, issues: codes(report.issues),
          katex: document.querySelectorAll('.katex').length, mathml: document.querySelectorAll('math').length,
          output: document.body.innerHTML});
      }
    }
    evidence.formulaMutations = records;
    expect(records).toHaveLength(16);
  });

  it('characterizes source projection and output scope on literal root HTML and nested code', async () => {
    const cases = [
      '<article>\\(x+1\\)</article>',
      '<main>\\(x+1\\)</main>',
      '<div>\\(x+1\\)</div>',
      '<pre> KEEP \\(x+1\\) <span data-latex="z+2">literal</span> </pre>',
      '<details open><summary>Summary</summary>Body + 2.</details>',
      '<div>plain <sub>1</sub><sup>2</sup></div>',
      '<div data-pf-raw-html="element" data-block-id="fake"><script>alert(1)</script><p onclick="alert(1)">SAFE</p></div>',
    ];
    const records = [];
    for (const source of cases) {
      const rendered = await renderBody(source, options);
      const document = dom(rendered.html);
      const report = checkRenderIntegrity(source, rendered);
      records.push({source, output: document.body.innerHTML, projection: sourceRawHtmlSignature(source),
        integrityOk: report.ok, integrityIssues: codes(report.issues), renderIssues: codes(rendered.issues),
        active: document.querySelectorAll('script,[onclick]').length});
    }
    evidence.rawScopes = records;
    expect(records).toHaveLength(cases.length);
  });

  it('runs the standalone export gate on erased rendered formulas with intact source metadata', async () => {
    const source = '# Formula\n\n$x+1$';
    const built = await realDoc(source, 'BUS-01', {cover: false, toc: false});
    const document = dom(built.body.html);
    document.querySelector('.pf-math')!.replaceChildren();
    built.body.html = document.body.innerHTML;
    let result: unknown;
    try {
      const exported = await exportHtml({...built, profile: 'standalone', fontSource: nodeFontSource, renderMermaid: false});
      const output = dom(exported.html);
      result = {delivered: true, status: exported.status, verdict: exported.verdict.status,
        checks: exported.manifest.checks, issues: codes(exported.issues),
        mathWrappers: output.querySelectorAll('.pf-math').length,
        katex: output.querySelectorAll('.katex').length, mathml: output.querySelectorAll('math').length};
    } catch (err) {
      result = {delivered: false, message: String(err)};
    }
    evidence.erasedFormulaExport = result;
  });

  it('characterizes newly added ordinary prose outside every registered source block', async () => {
    const source = '# Title\n\nOriginal statement 2.';
    const built = await realDoc(source, 'BUS-01', {cover: false, toc: false});
    const cases: Record<string, (body: HTMLElement) => void> = {
      ordinaryUnregisteredParagraph: body => { const p = document.createElement('p'); p.textContent = 'ADDED ordinary claim 999.'; body.append(p); },
      privateUnregisteredParagraph: body => { const p = document.createElement('p'); p.textContent = '\uE000'; body.append(p); },
      ordinaryTextInsideKnownBlock: body => { body.querySelector('[data-block-id]')!.append(' ADDED ordinary claim 999.'); },
      unknownRegisteredParagraph: body => { const p = document.createElement('p'); p.setAttribute('data-block-id', 'injected'); p.textContent = 'ADDED ordinary claim 999.'; body.append(p); },
    };
    const records = [];
    for (const [name, mutate] of Object.entries(cases)) {
      const document = dom(built.body.html);
      mutate(document.body);
      const report = checkRenderIntegrity(source, document.body);
      records.push({mutation: name, integrityOk: report.ok, issues: codes(report.issues)});
      if (name === 'ordinaryUnregisteredParagraph') {
        const altered = {...built.body, html: document.body.innerHTML};
        const exported = await exportHtml({...built, body: altered, profile: 'standalone', fontSource: nodeFontSource, renderMermaid: false});
        evidence.addedProseExport = {status: exported.status, verdict: exported.verdict.status,
          addedProsePresent: exported.html.includes('ADDED ordinary claim 999.'), checks: exported.manifest.checks};
      }
    }
    evidence.addedProseMutations = records;
    expect(records[0]).toMatchObject({integrityOk: true, issues: []});
    expect(records[2]?.integrityOk).toBe(false);
    // Even an unexpected registered block is only a warning in the current implementation.
    expect(records[3]).toMatchObject({integrityOk: true, issues: ['INTEGRITY_BLOCK_UNEXPECTED']});
  });
});
