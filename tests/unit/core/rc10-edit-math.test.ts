// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderBody, type CoreRenderOptions } from '../../../src/core/render';
import { checkRenderIntegrity } from '../../../src/core/integrity';

it('revising, switching or reopening a project preserves each exact TeX and display mode', async () => {
  const run = async (projectId: string, revision: number, source: string) => {
    const options: CoreRenderOptions = { assets: [], template: 'BUS-01', allowExternalImages: false, editIdentity: { projectId, revision } };
    const rendered = await renderBody(source, options);
    expect(checkRenderIntegrity(source, rendered).ok).toBe(true);
    const doc = new DOMParser().parseFromString(rendered.html, 'text/html');
    return Array.from(doc.querySelectorAll('.pf-math'), el => [
      el.classList.contains('pf-math-display'), el.querySelector('annotation')?.textContent,
    ]);
  };
  expect(await run('a', 0, '$x+1$ and $x+1$')).toEqual([[false,'x+1'],[false,'x+1']]);
  expect(await run('a', 1, '$x-1$\n\n$$x+1$$')).toEqual([[false,'x-1'],[true,'x+1']]);
  expect(await run('b', 0, '$$x+1$$')).toEqual([[true,'x+1']]);
  expect(await run('a', 0, 'Reopen $x+1$')).toEqual([[false,'x+1']]);
});
