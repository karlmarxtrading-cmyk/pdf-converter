import { isDeepStrictEqual as equal } from 'node:util';
import { requireFact as check } from './acceptance-policy.mjs';
import { verifyTrace,verifyLifecycle } from './trace-acceptance.mjs';

const sha = v => typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
const count = n=>Number.isSafeInteger(n) && n>=0;
const stages = ['import','editor-verified','standalone-request','standalone-downloaded','prepare-book',
  'book-downloaded','product-print-requested','product-document-bound','pdf-saved','offline-reopened','physical-reopened'];

export function verifyBook(row, physical) {
  check(row.schemaVersion===1 && row.status==='PASS' && row.route==='print-book' &&
    row.platform && /Chrom(e|ium)/i.test(row.browser) && row.settings && !row.error,'Failed book production route or wrong platform');
  check(equal(row.events?.map(e=>e.phase),stages) &&
    row.events.every((e,i)=>count(e.elapsedMs) && (!i || e.elapsedMs>=row.events[i-1].elapsedMs)) &&
    Date.parse(row.finishedAt)>=Date.parse(row.startedAt),'Missing, duplicate or out-of-order product phase');
  check(row.toc===(row.case==='original-default'?'default':row.case.slice(row.case.lastIndexOf('-')+1)) &&
    typeof row.settings.toc==='boolean' && (row.toc==='default' || row.settings.toc===(row.toc==='on')),'Wrong TOC matrix/settings');
  check(sha(row.sourceEditorSha256) && row.sourceEditorSha256===row.sourceSha256 && sha(row.htmlSha256) &&
    sha(row.bookHtmlSha256) && row.bookHtmlSha256===row.receiptSha256 && row.bookHtmlSha256===row.printResponseSha256 &&
    row.pdfBytes>0 && sha(row.pdfSha256) && row.pdfSha256===row.savedPdfSha256 &&
    row.pdfSha256===row.physical?.pdfSha256,'Imported source, downloaded book, print response or PDF bytes disagree');
  check(Array.isArray(row.pageErrorHashes) && !row.pageErrorHashes.length,'Browser rejected product operation');
  const o=row.offline;
  check(o && o.scripts===0 && Array.isArray(o.networkRequests) && !o.networkRequests.length &&
    o.sourceBlocks>0 && count(o.anchors) && o.anchors===o.valid && o.firstAnchorNavigates===true && o.selectionReadable===true &&
    o.fonts>0 && o.fonts===o.fontsLoaded && count(o.images) && o.images===o.imagesLoaded &&
    sha(o.expectedTextSha256) && o.expectedTextSha256===o.actualTextSha256 &&
    sha(o.expectedStructureSha256) && o.expectedStructureSha256===o.actualStructureSha256,'Offline source order, structure, resources or navigation disagrees');
  const p=row.physical;
  check(p && p.pass===true && count(p.pages) && p.pages>0 && Array.isArray(p.differences) && !p.differences.length &&
    sha(p.expectedBodySha256) && p.expectedBodySha256===p.actualBodySha256 && p.endMatches===true,
    'Independent physical source-to-PDF comparison failed');
  if (!physical) return;
  check(count(p.sourceBlocks) && p.sourceBlocks>0 && p.visitedBlocks===p.sourceBlocks &&
    count(p.confirmedTextBlocks) && p.confirmedTextBlocks>0 &&
    count(p.expectedEmptyMarkers) && p.expectedEmptyMarkers===p.confirmedEmptyMarkers &&
    [p.sourceTables,p.sourceRows,p.sourceCells,p.sourceHeadings,p.expectedFooterPages,p.expectedTocLinks].every(count) &&
    p.sourceHeadings===p.confirmedHeadings && p.expectedFooterPages===p.verifiedFooterPages &&
    p.expectedTocLinks===p.resolvedTocLinks,'Physical blocks/markers/headings/page numbers/link coverage is incomplete');
  const g=p.geometry, neg=p.negativeControls;
  const clear=v=>v===0 || Array.isArray(v) && v.length===0 ||
    v!==null && typeof v==='object' && Object.keys(v).length===0;
  const required=['validAccepted','addedTextRejected','missingEndRejected','changedCaseRejected'];
  if (p.expectedEmptyMarkers) required.push('missingListMarkerRejected');
  if (p.expectedTocLinks) required.push('brokenTocDestinationRejected');
  check(p.sourceSha256===row.sourceSha256 && p.pdfBytes===row.pdfBytes &&
    p.sourceTextBlocks===p.confirmedTextBlocks && p.sourceTextBlocks<=p.sourceBlocks &&
    p.expectedBodyCharacters>0 && p.expectedBodyCharacters===p.actualBodyCharacters &&
    p.targetSequenceMatches===true && p.standaloneTocMatchesSource===true && p.bookTocMatchesSource===true &&
    p.visibleEmptyMarkers===p.expectedEmptyMarkers && p.titleSettingMatchesSource===true && p.pdfDocumentTitleMatchesSource===true &&
    p.expectedCoverPages===p.actualCoverHeaders && p.expectedFooterPages===p.pages &&
    g?.fontObjects>0 && g.embeddedOrType3Fonts===g.fontObjects &&
    ['footerFailures','headerFailures','unexpectedMediaBoxes','nulCharacters','replacementCharacters',
      'outsideMediaBoxGlyphs','unpaintedTextLayerGlyphs','missingGlyphCodepoints','blankPages'].every(k=>clear(g[k])) &&
    required.every(k=>neg?.[k]===true),'Physical glyphs, margins, source inventory, destinations or oracle controls failed');
  if (row.case==='original-default') check(p.sourceBlocks===31073 && p.confirmedTextBlocks===30039 &&
    p.confirmedEmptyMarkers===19 && p.sourceTables===1,'Original manuscript inventory changed');
}
function sameBuild(doc,state) {
  check(doc?.candidateSha256===state.candidateSha256 && doc?.distTreeSha256===state.distTreeSha256,
    'Wrong candidate or dist for browser/timing observations');
}
export function verifyResponsiveness(browser,control,large,state,fixtureHash) {
  sameBuild(browser.identity,state);sameBuild(control.build,state);sameBuild(large.identity,state);
  check(large.source===fixtureHash,'Busy cancellation not measured on declared large fixture');
  verifyLifecycle(browser,control); verifyLifecycle(large,control);
}
export function verifyWork(browser,control,state) {
  sameBuild(browser.build,state);sameBuild(control.build,state);
  verifyTrace(browser,control);
}
