/**
 * Marker via Replicate — gated OCR/layout candidate (not Cursor MCP).
 * Async job/poll model for BullMQ workers; output is a ParseCandidate only.
 */
import crypto from 'crypto';
import logger from '../../utils/logger.js';

const DEFAULT_MODEL =
  process.env.MARKER_REPLICATE_MODEL || 'datalab-to/marker';
const DEFAULT_TIMEOUT_MS = Number(process.env.MARKER_TIMEOUT_MS) || 180_000;
const DEFAULT_POLL_MS = Number(process.env.MARKER_POLL_MS) || 2500;
const DEFAULT_MAX_PAGES = Number(process.env.MARKER_MAX_PAGES) || 40;
const DEFAULT_MAX_RETRIES = Number(process.env.MARKER_MAX_RETRIES) || 1;
const DEFAULT_COST_CEILING_USD = Number(process.env.MARKER_COST_CEILING_USD) || 0.5;

/**
 * @returns {boolean}
 */
export function markerReplicateEnabled() {
    if (!process.env.REPLICATE_API_TOKEN) return false;
    const v = process.env.MARKER_REPLICATE_ENABLED;
    if (v === 'false' || v === '0') return false;
    // Default off until explicitly enabled in batch.
    return v === 'true' || v === '1';
}

/**
 * @param {Buffer} pdfBuffer
 * @returns {string}
 */
export function hashPdfBuffer(pdfBuffer) {
    return crypto.createHash('sha256').update(pdfBuffer).digest('hex');
}

/**
 * Create a prediction (async). Returns prediction id.
 * @param {Buffer} pdfBuffer
 * @param {{ pageCount?: number }} [opts]
 */
export async function startMarkerPrediction(pdfBuffer, opts = {}) {
    if (!markerReplicateEnabled()) {
        return { ok: false, error: 'marker_disabled' };
    }
    const pageCount = opts.pageCount || 1;
    if (pageCount > DEFAULT_MAX_PAGES) {
        return { ok: false, error: 'page_limit_exceeded', pageCount, max: DEFAULT_MAX_PAGES };
    }

    const token = process.env.REPLICATE_API_TOKEN;
    const pdfHash = hashPdfBuffer(pdfBuffer);
    const b64 = pdfBuffer.toString('base64');
    const dataUri = `data:application/pdf;base64,${b64}`;

    const res = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'wait'
        },
        body: JSON.stringify({
            version: process.env.MARKER_REPLICATE_VERSION || undefined,
            model: DEFAULT_MODEL,
            input: {
                pdf: dataUri,
                force_ocr: opts.forceOcr !== false
            }
        }),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        logger.warn('[MARKER_REPLICATE] create failed', { status: res.status, body: body.slice(0, 200) });
        return { ok: false, error: `replicate_http_${res.status}`, pdfHash };
    }

    const json = await res.json();
    return {
        ok: true,
        predictionId: json.id,
        status: json.status,
        output: json.output ?? null,
        pdfHash,
        raw: json
    };
}

/**
 * Poll until succeeded/failed or timeout.
 * @param {string} predictionId
 */
export async function pollMarkerPrediction(predictionId) {
    const token = process.env.REPLICATE_API_TOKEN;
    const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
    let last = null;

    while (Date.now() < deadline) {
        const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(30_000)
        });
        if (!res.ok) {
            return { ok: false, error: `poll_http_${res.status}` };
        }
        last = await res.json();
        if (last.status === 'succeeded') {
            return { ok: true, status: last.status, output: last.output, raw: last };
        }
        if (last.status === 'failed' || last.status === 'canceled') {
            return { ok: false, status: last.status, error: last.error || last.status, raw: last };
        }
        await new Promise((r) => setTimeout(r, DEFAULT_POLL_MS));
    }
    return { ok: false, error: 'timeout', raw: last };
}

/**
 * Map Marker markdown/text output into coarse ledger-shaped rows (best-effort).
 * Full table parsing remains the job of normalize + profile; this is a candidate seed.
 * @param {string|object} output
 * @returns {Array<object>}
 */
export function mapMarkerOutputToRows(output) {
    const text =
    typeof output === 'string'
        ? output
        : output?.markdown || output?.text || JSON.stringify(output || '');
    const rows = [];
    const lineRe =
    // eslint-disable-next-line no-useless-escape
    /^(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(.+?)\s+(-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*$/;
    for (const line of String(text).split(/\r?\n/)) {
        const m = line.trim().match(lineRe);
        if (!m) continue;
        const rawAmt = m[3].replace(/[$,]/g, '');
        const amount = Number(rawAmt);
        if (!Number.isFinite(amount)) continue;
        rows.push({
            date: m[1],
            description: m[2].trim(),
            amount,
            sourceEngine: 'marker',
            sectionOwner: 'primary_activity'
        });
    }
    return rows;
}

/**
 * Full gated extract: start (+ poll if needed), return candidate payload + audit.
 * @param {Buffer} pdfBuffer
 * @param {{ pageCount?: number, forceOcr?: boolean }} [opts]
 */
export async function extractMarkerCandidate(pdfBuffer, opts = {}) {
    if (!markerReplicateEnabled()) {
        return { success: false, error: 'marker_disabled', transactions: [] };
    }

    let attempt = 0;
    let lastErr = null;
    while (attempt <= DEFAULT_MAX_RETRIES) {
        attempt += 1;
        try {
            const started = await startMarkerPrediction(pdfBuffer, opts);
            if (!started.ok) {
                lastErr = started.error;
                continue;
            }

            let output = started.output;
            let raw = started.raw;
            if (!output && started.predictionId) {
                const polled = await pollMarkerPrediction(started.predictionId);
                if (!polled.ok) {
                    lastErr = polled.error;
                    continue;
                }
                output = polled.output;
                raw = polled.raw;
            }

            const transactions = mapMarkerOutputToRows(output);
            return {
                success: transactions.length > 0,
                engine: 'marker',
                transactions,
                pdfHash: started.pdfHash,
                rawMarkerOutput: typeof output === 'string' ? output.slice(0, 200_000) : output,
                predictionId: started.predictionId,
                costCeilingUsd: DEFAULT_COST_CEILING_USD,
                audit: { rawStatus: raw?.status, attempt }
            };
        } catch (err) {
            lastErr = String(err?.message || err);
            logger.warn('[MARKER_REPLICATE] attempt failed', { attempt, error: lastErr });
        }
    }

    return { success: false, error: lastErr || 'marker_failed', transactions: [] };
}

export default {
    markerReplicateEnabled,
    extractMarkerCandidate,
    mapMarkerOutputToRows,
    hashPdfBuffer,
    startMarkerPrediction,
    pollMarkerPrediction
};
