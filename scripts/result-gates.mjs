/** Pure acceptance checks used by CLI runners. Missing evidence is never a successful run. */
export function deploymentMathPass(rec, { version, tex, display }) {
  return !rec.error && rec.version === version && Array.isArray(rec.pageErrors) && rec.pageErrors.length === 0
    && rec.katex === tex.length && rec.errors === 0 && Array.isArray(rec.raw) && rec.raw.length === 0
    && JSON.stringify(rec.tex) === JSON.stringify(tex) && JSON.stringify(rec.display) === JSON.stringify(display)
    && rec.currency === true && rec.code === true;
}

export function performanceRunPass(rec) {
  return !rec.error && rec.layoutStatus === 'done' && rec.verification === 'pass'
    && Number.isInteger(rec.pages) && rec.pages > 0 && rec.pdfBytes > 0
    && Array.isArray(rec.errors) && rec.errors.length === 0
    && Array.isArray(rec.blocking) && rec.blocking.length === 0;
}

export function crossBrowserGate(results, required = ['chromium', 'firefox', 'webkit']) {
  const rows = new Map(required.map(engine => [engine, results.filter(row => row.engine === engine)]));
  const missing = required.filter(engine => rows.get(engine).length === 0 || rows.get(engine).some(row => row.status === 'not-available'));
  const failed = required.filter(engine => rows.get(engine).length > 1 || rows.get(engine).some(row => !['pass', 'not-available'].includes(row.status)));
  const passed = required.flatMap(engine => rows.get(engine).length === 1 && rows.get(engine)[0].status === 'pass' ? rows.get(engine) : []);
  const digests = passed.map((r) => r.steps?.digest?.sha256).filter((d) => typeof d === 'string' && d.length > 0);
  const comparable = passed.length === required.length && digests.length === required.length;
  const identical = comparable ? new Set(digests).size === 1 : null;
  const pass = missing.length === 0 && failed.length === 0 && comparable && identical === true;
  return { pass, missing, failed, renderedHtmlIdenticalAcrossEngines: identical, exitCode: pass ? 0 : missing.length && !failed.length ? 2 : 1 };
}
