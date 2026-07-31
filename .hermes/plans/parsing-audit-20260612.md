
### Parsing Pipeline Architecture Audit (2026-06-12)

**Entry Points:**

1.  **`PDFParserService.parsePDF(filePath, options)`**: This is the primary external entry point for parsing a PDF file. It reads the file into a buffer and then calls `parseStatement`.
2.  **`PDFParserService.parseStatement(buffer, options)`**: This is the core parsing logic. It handles different bank types (e.g., 'TFS' uses `_parseTfsWithPdf2Json`, others use `pdf-parse`).
3.  **`runStatementExtractionPipeline(...)`**: This function, called within `parseStatement`, seems to orchestrate the main transaction extraction using various profiles and parsing strategies.

**Bank Routing / Profile Resolution:**

*   **`PDFParserService.initializeParsers()` / `registerParser()`**: Registers bank-specific parsing logic (e.g., 'DEFAULT', 'TFS').
*   **`_resolveIdentityWaterfall(...)`**: Uses RTN/FDIC/Anchor/Human-provided information to identify the bank.
*   **`_detectBankStatementIndicators(...)`**: Attempts to deterministically identify bank statements and extract bank names/account numbers from the document header.
*   **`resolveProfile(...)`**: Resolves a specific bank profile based on text, RTN, bank name, or an explicit `profileId` option. This profile guides the extraction pipeline.

**Core Extraction Flow:**

1.  **Deterministic Triage (Phase 1a & 1b)**:
    *   `_getHeaderWindow` and `_detectBankStatementIndicators` attempt to quickly identify the document as a bank statement and extract basic info.
    *   `_detectFinanceApplicationIndicators` is used to immediately reject finance applications.
    *   `_resolveIdentityWaterfall` attempts to identify the bank using RTN, FDIC certificates, or anchor fields.
2.  **AI Fallback (Phase 2)**: If deterministic triage fails to confirm it's a bank statement, `PerplexityService` is used for AI-driven document type classification (`documentType`, `bankName`, `accountHolderName`, `statementAddress`).
3.  **Rejection of Non-Statements (Phase 3)**: Documents identified as 'GOV_ID', 'VOIDED_CHECK', 'CONTRACT', 'FINANCE_APPLICATION', or 'OTHER' are immediately rejected.
4.  **Transaction Extraction**:
    *   `extractTransactionsFromPdfBuffer` (from `pdfPlumberService.js` or `scanOcrService.js` via `parserRegistry.js`) is used, potentially in a "dual-engine" mode.
    *   `runStatementExtractionPipeline` orchestrates the extraction based on the resolved bank profile, integrating various services like `statementStitcher.js` and custom profile logic (e.g., `chaseBusinessCompleteProfile.js`, `wellsFargoInitiateProfile.js`).
    *   `layoutFirstPipeline` (e.g., `runLayoutFirstPipeline`) is a newer, potentially more robust extraction method, with shadow and fallback modes.

**Checksum Outcomes & Parse Quality:**

*   **`statementParseQuality.js`**: This file is central to validating parse quality.
*   **`applyParseQualityPipeline(parsedStatement, identitySources)`**:
    *   **Sanitization**: `sanitizeTransactionsForMacro` cleans transactions.
    *   **Normalization**: `normalizeTransactionsWithBalanceInference` and `applyLineHintSigns` adjust transaction amounts and types based on balance inference and line hints.
    *   **Checksum Reconciliation (`validateReconciliation`)**: This is the primary check for parse quality. It compares calculated totals (deposits, withdrawals, opening, closing balances) from the parsed transactions against any "printed" totals found in the statement.
    *   `checksumRecon.ok` determines the `parseQuality` (`OK` or `FAILED_CHECKSUM`).
    *   `validationReport` from `validateStatement` provides additional structural and temporal validation.
*   **`attachChecksumDeltaProbe(parsedStatement)`**: If checksum reconciliation fails (`checksumRecon.ok` is false), this function is called (from `checksumDeltaProbe.js`) to probe the raw text for the missing delta amount. This helps diagnose if a summary line or a table was skipped.
*   **`attachParseOutcomeFlags(parsedStatement)`**: Assigns a `parseOutcome` status ('ok', 'bank_confirmation_required', 'checksum_failed', 'no_transactions') and a suggested HTTP status.

**Weak Spots / Failure Modes:**

1.  **PDF Parsing Errors (`pdf-parse`, `pdf2json`, `pdfPlumber`)**: Underlying PDF parsing libraries can fail to extract text or correctly identify table structures, leading to incomplete or garbled raw text.
2.  **Document Triage (`DocumentTriageError`)**: Incorrectly triaging a document as a non-bank statement (e.g., `FINANCE_APPLICATION`) will lead to immediate rejection. The AI fallback might mitigate this, but it's an additional point of failure.
3.  **Bank Identity Resolution Failures**: If the system cannot reliably identify the bank via waterfall methods or AI, it might fall back to a generic parser, which could be less accurate.
4.  **Incomplete Transaction Extraction**:
    *   **`zero_transactions` error**: If `pdfPlumber` (or any other primary extractor) yields no transactions from a digital PDF, the system attempts a rescue path using OCR (`scanOcrService`). If both fail, the statement will be marked `no_transactions`.
    *   **Strict Profile Reconciliation Failures**: For specific strict profiles (e.g., `wells_initiate_checking`, `chase_business_complete`), if the `extractionTier` is not 1 or `reconciliation.checksumOk` is false, the pipeline can be rejected, leading to a fallback (or failure). `tryRecoverWellsNearMiss` shows an attempt to recover from specific Wells Fargo reconciliation failures.
5.  **Checksum Mismatches (`FAILED_CHECKSUM`)**:
    *   This is a critical failure mode detected by `validateReconciliation`. It indicates that the sum of parsed transactions (adjusted for opening/closing balances) does not match the printed totals.
    *   Causes could include: missing transactions, incorrectly parsed amounts, skipped summary lines, or errors in parsing opening/closing balances.
    *   The `checksumDeltaProbe` attempts to find the missing delta, but if it fails to locate the exact amount, the root cause might remain elusive without human review.
6.  **Drift in Type A vs. Type B Totals**: `statementParseQuality.js` also warns if "Type B deposits drift from Type A printed total" which indicates an inconsistency even if the primary checksum passes.
7.  **Toxic Fallback**: `toxicFallbackGuard.js` suggests there are "toxic fallback" mechanisms, which implies certain parsing paths might be unreliable and need to be guarded against or blocked.
8.  **Edge Cases in Amount/Type Inference**: `applyLineHintSigns` and `inferTransactionTypeFromLine` attempt to correct transaction types and signs based on keyword hints. If these heuristics are insufficient or misfire, transaction data can be incorrect.
9.  **Absurdity Thresholds**: `getAbsurdityThreshold` and `pickNumeric` are used to guard against absurdly large amounts, which is a good sanity check but could lead to legitimate large transactions being filtered if the threshold is too low.
