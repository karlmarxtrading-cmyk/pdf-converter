// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { prepareBody } from '../../../src/render/document';
import { staticChecks } from '../../../src/render/exports';
import { realDoc } from './helpers';

it('isolates screen and print copies and verifies mutable caller references on reuse', async () => {
  const {snapshot, body} = await realDoc('# Heading\n\n$$x+1$$\n\n| a | b |\n|---|---|\n| 1 | 2 |', 'BUS-01');
  const options = { mode: 'screen' as const, allowExternalImages: false, renderMermaid: false };
  const first = await prepareBody(snapshot, body, options);
  first.stats.tables = 99;
  let captured: HTMLElement | undefined;
  const second = await prepareBody(snapshot, body, { ...options, verifyInput: root => { captured = root; } });
  expect(second.stats.tables).toBe(1);
  captured!.innerHTML = '<p>altered after validation</p>';
  const print = await prepareBody(snapshot, body, { ...options, mode: 'print' });
  expect(print.html).toContain('x+1');
  expect(print.html).not.toContain('altered after validation');
  expect(print.html).not.toContain('role="region"');
  const next = await prepareBody(snapshot, body, options);
  expect(next.html).toBe(first.html);
});

it('scans the complete font stylesheet and detects even one changed embedded byte', () => {
  const face = '@font-face{src:url(data:font/woff2;base64,' + 'Z'.repeat(6000) + ')}';
  const options = { scriptsAllowed: false, networkAllowed: false, fontCss: face };
  const page = (css: string) => '<style data-pf="fonts">' + css + '</style><p>text</p>';
  const check = (html: string, name: string) => staticChecks(html, options).find(c => c.name === name)?.status;
  expect(check(page(face), 'fonts-embedded')).toBe('pass');
  expect(check(page(face.replace('ZZZ', 'ZWZ')), 'fonts-embedded')).toBe('fail');
  const networkCss = face + '@import "https://example.invalid/fonts.css"';
  expect(staticChecks(page(networkCss), { ...options, fontCss: networkCss }).find(c => c.name === 'no-network-resources')?.status).toBe('fail');
});
