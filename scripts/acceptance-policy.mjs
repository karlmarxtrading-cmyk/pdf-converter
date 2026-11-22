// Public, versioned evidence contract. Fixed checks use the IDs of the RC7 audit.
export const requirements = {
  G01: ['archivePaths', 'archiveChecksums', 'inputIdentity'],
  G02: ['lockedInstall', 'typecheck', 'lint', 'unit', 'static', 'http', 'mutations', 'secretScan', 'cleanBuild'],
  G03: ['productionUiDownload', 'offlineLayout', 'fourTemplates'],
  G04: ['rawWrapper', 'clipboardWrapper', 'independentText', 'ambiguity', 'pureAndMultipleControls'],
  G05: ['emptyFormula', 'visual', 'mathML', 'annotation', 'operatorAndMode', 'cssAndFonts', 'fallback', 'htmlAndPrint'],
  G06: ['rootText', 'untrackedNode', 'foreignId', 'duplicateId', 'order', 'spoofedDecoration', 'generatedControls'],
  G07: ['originalMixed', 'supportedText', 'emoji', 'privateUseDecision', 'type3Policy', 'actualPdf'],
  G08: ['code112Lines', 'indentationAndBlankLines', 'labelWithCode', 'continuation', 'a5Boundary'],
  G09: ['outputOracle', 'frozenProtocol', 'browserCohorts', 'nodeCohorts'],
  G10: ['fiveRepetitions', 'measuredPages', 'editSla', 'cancelSla', 'memorySamples', 'memoryTrend'],
  G11: ['positiveControl', 'thresholdMutation', 'distMutation', 'formulaMutation', 'missingReceipt', 'staleReceipt', 'shortCohort', 'nativeBlocked'],
  G12: ['targetWindows', 'realClipboard', 'bothMimeTypes', 'sourceProvenance', 'otherDeclaredPlatforms'],
  G13: ['nativeDialog', 'savedBytes', 'verifiedContent', 'cancel', 'retry'],
  G14: ['projectRoundTrip', 'rawSource', 'undoRedo', 'quotaRecovery', 'twoTabs', 'reload', 'deleteData', 'keyboardFocus', 'zoom360', 'screenReader'],
  G15: ['actualPreviewUrl', 'sourceIdentity', 'files', 'mimeCspCache', 'workersFonts', 'printRoute', 'exportOnHost'],
  G16: ['knownGoodTarget', 'rollbackDrill', 'restoredIdentity', 'promotionAuthorization'],
};

export const baseline = {
  candidateSha256: '4e96aabbce9771cbedd945068a8ad3d8526fbb717200df11a60c96714ddcc497',
  distTreeSha256: '60be475033374b68db3cb1a39efab318ad303d642a652a231564ea302a7770d9',
};

export function requireFact(condition, message) {
  if (!condition) throw Error(message);
}

export function validateChecks(id, checks, artifacts) {
  requireFact(Object.keys(requirements).includes(id), 'Unknown gate');
  requireFact(checks && Object.getPrototypeOf(checks) === Object.prototype, 'checks object required');
  requireFact(Object.keys(checks).length === requirements[id].length, 'Incomplete or unexpected checks');
  for (const k of requirements[id]) {
    const c = checks[k];
    requireFact(c?.pass === true && typeof c.evidence === 'string' && artifacts.has(c.evidence), 'No passing bound evidence for ' + k);
  }
}

const positive = x => Number.isFinite(x) && x > 0;
const digest = x => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
function median(xs) {
  const n = xs.length;
  return n % 2 ? xs[(n-1)/2] : (xs[n/2-1]+xs[n/2])/2;
}
// The controller opens a fresh browser at each block and emits the warm pair
// immediately before that block's measured rows. Preserve the observed order.
export function validateBrowserBlocks(rows, metrics, cohort, task, protocol) {
  const policy=protocol.officialBrowserLifecycle;
  requireFact(protocol.cohorts===2 && protocol.pairs===40 && policy?.pairsPerBlock===4 &&
    policy.warmupPairsPerBrowserBlock===1 && policy.cdpTimeoutMs===60000, 'Wrong fixed browser lifecycle parameters');
  const blocks=protocol.pairs/policy.pairsPerBlock;
  const armCount=2*(policy.warmupPairsPerBrowserBlock+policy.pairsPerBlock);
  requireFact(rows.length===blocks*armCount,'Missing or extra lifecycle arms: '+task);
  let cursor=0;
  for(let block=0;block<blocks;block++){
    const warmRound=-(1+block*100);
    const firstMeasured=block*policy.pairsPerBlock;
    const rounds=[warmRound,...Array.from({length:policy.pairsPerBlock},(_,offset)=>firstMeasured+offset)];
    for(const round of rounds){
      const first=(round+cohort-1)%2===0?'rc6':'candidate';
      const second=first==='rc6'?'candidate':'rc6';
      const [a,b]=rows.slice(cursor,cursor+2);
      for (const [row,label] of [[a,first],[b,second]]) {
        requireFact(row.task===task && row.block===block && row.round===round &&
          row.warmup===(round===warmRound) && row.label===label,
        'Wrong browser block, warmup, round or AB/BA order: '+task+' block '+block);
        requireFact(!row.error && row.oracle?.pass===true && digest(row.oracle.digest) &&
          metrics.every(k=>positive(row.times?.[k])), 'Failed browser arm: '+task+' block '+block);
      }
      requireFact(a.oracle.digest===b.oracle.digest,'Inequivalent browser warmup or measured outputs: '+task+' block '+block);
      cursor+=2;
    }
  }
}

export function evaluatePairs(rows, metrics, cohort, caseName) {
  const measured = rows.filter(x => Number.isInteger(x.round) && x.round >= 0);
  requireFact(measured.length >= 80 && measured.length % 4 === 0, caseName+' requires at least 40 balanced pairs');
  const warm = rows.filter(x => Number.isInteger(x.round) && x.round < 0);
  requireFact(warm.some(x=>x.label==='rc6') && warm.some(x=>x.label==='candidate'), caseName+' missing warmup');
  requireFact(rows.length === measured.length + warm.length && rows.every(x=>x.oracle?.pass===true && digest(x.oracle.digest)), caseName+' failed/missing observation');
  const byMetric = Object.fromEntries(metrics.map(k => [k, {rc6:[],candidate:[]}]));
  for (let i=0; i<measured.length; i+=2) {
    const pair = measured.slice(i,i+2), round=i/2;
    const first = ((round + cohort - 1) % 2 === 0) ? 'rc6' : 'candidate';
    requireFact(pair[0].round===round && pair[1].round===round && pair[0].label===first && pair[1].label!==first && ['rc6','candidate'].includes(pair[1].label), caseName+' invalid pair order or sample IDs');
    requireFact(pair[0].oracle.digest===pair[1].oracle.digest, caseName+' inequivalent outputs');
    for (const row of pair) for (const metric of metrics) {
      const value=row.times?.[metric];
      requireFact(positive(value), caseName+' missing positive '+metric);
      byMetric[metric][row.label].push(value);
    }
  }
  const result = {};
  for (const [metric, values] of Object.entries(byMetric)) {
    const a=values.rc6.sort((x,y)=>x-y), b=values.candidate.sort((x,y)=>x-y);
    const p95=Math.ceil(0.95*a.length)-1;
    const stats={medianRc6:median(a),medianCandidate:median(b),p95Rc6:a[p95],p95Candidate:b[p95],pairs:a.length};
    requireFact(stats.medianCandidate<=1.05*stats.medianRc6 && stats.p95Candidate<=1.10*stats.p95Rc6, caseName+'/'+metric+' exceeds median/p95 budget: '+JSON.stringify(stats));
    result[metric]=stats;
  }
  return result;
}

export function validateIdentityPair(identities, state) {
  for (const [key, expected] of Object.entries({rc6:baseline,candidate:state})) {
    const observed=identities?.[key];
    requireFact(observed?.candidateSha256===expected.candidateSha256 && observed.distTreeSha256===expected.distTreeSha256, 'Wrong benchmark identity: '+key);
  }
}

export function nativeRecord(facts, artifactBytes) {
  requireFact(facts.method === 'native-browser-save-dialog' && facts.cancelObserved===true && facts.retryObserved===true, 'Native save/cancel/retry required');
  requireFact(typeof facts.platform==='string' && facts.platform.trim().length>1 && typeof facts.browser==='string' && facts.browser.trim().length>1, 'Native environment required');
  const pdf=artifactBytes(facts.pdf);
  requireFact(pdf.length>100 && pdf.subarray(0,5).toString()==='%PDF-' && pdf.subarray(-2048).includes('%%EOF'), 'Invalid saved native PDF');
  requireFact(Number.isSafeInteger(facts.pages) && facts.pages>0 && digest(facts.extractedTextSha256), 'Native PDF content verification required');
}

export function requireHttpsPreview(url) {
  const u = new URL(url);
  requireFact(u.protocol==='https:' && !['localhost','::1','[::1]','0.0.0.0','127.0.0.1'].includes(u.hostname) && !u.username && !u.password && !u.hostname.endsWith('.invalid'), 'Public HTTPS preview required');
}
