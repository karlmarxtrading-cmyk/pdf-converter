/**
 * PaperForma 2 — API core. Implementasi `CoreApi` (contracts.ts) + ekspor tambahan.
 * Lihat docs/CORE_API.md.
 */
import type { CoreApi } from './contracts';
import { LIMITS, utf8Length } from './limits';
import { sha256Hex, makeSnapshot, defaultSettings } from './hash';
import { renderBody } from './render';
import { assetDataUrl } from './assets';

export const core: CoreApi = { LIMITS, utf8Length, sha256Hex, renderBody, assetDataUrl, makeSnapshot: (p) => makeSnapshot(p), defaultSettings };
export default core;

export * from './contracts';
export { LIMITS, utf8Length, utf8Encode, checkBudget, checkTextBudget, assertBudget, BudgetError, readFileWithinBudget, decodeUtf8Strict, type BudgetKind, type BudgetResult, type FileLike, type ReadFileResult } from './limits';
export { sha256Hex, sha256HexSync, canonicalJson, inputRawHash, computeRawSourceHash, computeContentSnapshotHash, computeRenderInputHash, actualAssetHashes, makeSnapshot, defaultSettings, RevisionGuard, type RevisionToken, type SnapshotOptions } from './hash';
export { utf16ToUtf8Offset, utf8ToUtf16Offset, utf16ToCodePointOffset, rangeToUtf8 } from './offsets';
export { renderBody, renderStage1, finishRender, type RenderStage1, snapshotRenderOptions, selectedMessages, ROLE_LABELS, speakerDisplay, type CoreRenderOptions, type DocumentPart } from './render';
export { scanMath, renderTex, type MathScan, type MathSpan } from './math';
export { parseMarkdown, blockModels, orderedTokens, type BlockModel } from './markdown';
export { checkIntegrity, checkRenderIntegrity, compareText, compareTokens, compareBlockModels, extractRenderedBlocks, expectedBlocksFor, integrityExpectation, type IntegrityExpectation, INTEGRITY_SCOPE, type IntegrityReport, type TokenDiff, type RenderedBlock } from './integrity';
export { detectWrapper, unwrapWrapper, makeEdit, type WrapperDetection, type ReversibleEdit } from './wrapper';
export { repairTable, findTable } from './repair';
export { htmlToMarkdown, type ClipboardResult, type ConversionChange } from './clipboard';
export { PasteLedger, type PasteFragment, type LedgerResult, type TxKind } from './paste';
export {
  parsePlainConversation, parseClipboardConversation, suggestDuplicates, setRole, setSelected, selectMessages, reorderSelected, setOutputMode,
  splitMessage, mergeMessages, composeConversation, verifyComposition, publicationFor, mergeDocuments, namespaceFootnotes, topLevelBlocks, curatedBlocks, importSummary, roleOfLabel,
  type ParseConversationResult, type DuplicateSuggestion, type ComposeResult, type ComposeOptions, type ProvenanceEntry, type ConversationOp, type BoundarySuggestion,
} from './conversation';
export {
  AssetStore, assetDataUrl, sniffMime, imageDimensions, normalizeAssetPath, sanitizeSvgBytes, createAssetRecord, resolveAsset, embedRemoteCopy,
  clearDataUrlCache, evictAsset, dataUrlCacheStats, IMAGE_BUDGET, pixelsOf, bytesToBase64, DATA_URL_CACHE_MAX_CHARS, type AddAssetResult, type AssetPreflight, type ExternalImageRef,
} from './assets';
export { importZip, readCentralDirectory, canonicalZipPath, type ZipImportResult, type ZipProblem } from './zip';
export {
  createProject, makeInputRecord, makePasteInputRecord, projectBytes, historySource, commitRevision, importZipIntoProject, validateBrandKit, migrateV1Draft, revertMigration, isLegacyDraftV1,
  exportBundle, importBundle, HISTORY_MAX, type LegacyDraftV1, type MigrationResult, type BundleManifest, type BundleImportResult,
  historyStateJson, historyEntryState, restoreRevisionChanges,
} from './projects';
export { MemoryProjectStorage, IdbProjectStorage, AutosaveController, readLegacyDraft, DB_NAME, LEGACY_DB, type ProjectStorage, type SaveResult, type SaveStatus, type DeleteResult } from './storage';
export { preflight, assetPreflight, listExternalImages, PREFLIGHT_LABELS, type PreflightReport, type PreflightStatus, type CategoryResult, type PreflightTarget, type ReportIdentity } from './preflight';
export { classifyUrl } from './sanitize';
export type { CoreIssue } from './util';
export { classifyIssue, verdictOf, dedupeIssues, type IssueClass, type Verdict } from './verdict';
export { privateUseConservation } from './integrity';
export { ProjectUndo, undoFieldsOf, changesFor, UNDO_LIMITS, type UndoEntry, type UndoFields } from './undo';
export { analyzeChars, charIssues, type CharAnalysis } from './chars';
