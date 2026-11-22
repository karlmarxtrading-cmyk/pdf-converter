// @vitest-environment jsdom
import { afterAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import cases from '../../../fixtures/rc8/mixed-wrappers.json';
import { renderBody } from '../../../src/core/render';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { checkRenderIntegrity } from '../../../src/core/integrity';

const results: Record<string, unknown>[] = [];
afterAll(() => {
  const passed = (route: string, names: string[]) => names.every(name => results.some(r => r.name === name && r.route === route && r.pass === true));
  const groups = (names: string[]) => ['raw','clipboard'].every(route => passed(route,names));
  if (process.env.PF_WRAPPER_RESULT) writeFileSync(process.env.PF_WRAPPER_RESULT, JSON.stringify({
    rawWrapper: passed('raw',cases.map(c=>c.name)), clipboardWrapper: passed('clipboard',cases.map(c=>c.name)),
    independentText: groups(['section','collapse','glossary','div-before','direct-text-and-math','nested-safe-formatting']),
    ambiguity: groups(['direct-prose','ambiguous-copies']), pureAndMultipleControls: groups(['pure','nested-independent-math']),
    routes:['raw','clipboard'], cases:results}, null, 2)+'\n');
});

describe.each(['raw','clipboard'])('RC8 independent HTML wrapper literal oracle (%s)', route => {
  it.each(cases)('$name', async fixture => {
    const converted = route === 'clipboard' ? htmlToMarkdown(fixture.html) : null;
    if (converted && !converted.ok) throw Error(converted.message);
    const source = converted?.markdown ?? fixture.html;
    const body = await renderBody(source, { assets: [], template: 'BUS-01', allowExternalImages: false });
    const root = new DOMParser().parseFromString(body.html, 'text/html').body;
    const integrity = checkRenderIntegrity(source, body);
    const structure = fixture.structure.map(selector => !!root.querySelector(selector));
    const tex = [...root.querySelectorAll('.pf-math')].map(formula => {
      const payload = formula.querySelector('annotation')?.textContent ?? '<absent>';
      formula.replaceWith('[' + payload + ']');
      return payload;
    });
    const words = (root.textContent ?? '').replace(/\s+/g,'');
    const expected = fixture.words.join('').replace(/\s+/g,'');
    const issues = [...converted?.issues ?? [], ...body.issues].filter(i => i.scope === 'math');
    const review = issues.some(i => i.severity === 'warning');
    const pass = JSON.stringify(tex) === JSON.stringify(fixture.tex) && structure.every(Boolean) && words === expected && review === fixture.review && integrity.ok;
    results.push({name:fixture.name,route,source,tex,expectedTex:fixture.tex,words,expected,structure,review,issues:issues.map(i=>i.code),integrity:integrity.issues,pass});
    expect({tex, words, structure, review, integrity:integrity.ok}).toEqual({tex:fixture.tex, words:expected, structure:fixture.structure.map(()=>true), review:fixture.review, integrity:true});
  });
});
