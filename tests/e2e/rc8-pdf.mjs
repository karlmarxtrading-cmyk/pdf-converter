// The historical suite remains selectable through rc7-print.mjs. This entry point
// uses the RC8 format matrix and validates actual download/preview refusals.
process.env.PF_PDF_RC8 = '1';
process.env.PF_PDF_EVIDENCE ??= process.env.PF_PDF_DIR || 'evidence/rc8/pdf';
process.env.PF_PDF_DIR ??= 'examples/rc8/pdf';
await import('./rc7-print.mjs');
const {execFileSync}=await import('node:child_process');
execFileSync(process.env.PF_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),['tests/e2e/rc8-pdf-physical.py',process.env.PF_PDF_DIR,process.env.PF_PDF_EVIDENCE],{stdio:'inherit'});
