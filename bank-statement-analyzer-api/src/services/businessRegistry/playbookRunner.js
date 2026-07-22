/**
 * Declarative browser playbook executor for state registry searches.
 */

import { pickBestMatch } from './resultNormalizer.js';

/**
 * @param {string} template
 * @param {Record<string, string>} vars
 */
export function interpolate(template, vars) {
  if (template == null) return '';
  return String(template).replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
    const parts = key.split('.');
    let cur = vars;
    for (const p of parts) {
      cur = cur?.[p];
    }
    return cur != null ? String(cur) : '';
  });
}

/**
 * @param {object} playbook
 * @param {string} businessName
 */
export function buildPlaybookContext(playbook, businessName) {
  const selectors = playbook.selectors || {};
  return {
    businessName,
    entryUrl: playbook.entryUrl || '',
    selectors,
    timeoutMs: playbook.timeoutMs || 30000
  };
}

/**
 * @param {import('playwright-core').Page} page
 * @param {object} playbook
 * @param {string} businessName
 * @returns {Promise<{ rows: object[], noResultsBanner: boolean, error?: string }>}
 */
export async function runPlaybook(page, playbook, businessName) {
  const ctx = buildPlaybookContext(playbook, businessName);
  const timeoutMs = ctx.timeoutMs;

  try {
    const steps = Array.isArray(playbook.steps) ? playbook.steps : [];
    for (const step of steps) {
      await executeStep(page, step, ctx, timeoutMs);
    }

    const noResultsSel = interpolate(playbook.selectors?.noResults || '', ctx);
    const noResultsVisible = noResultsSel
      ? await page.locator(noResultsSel).first().isVisible().catch(() => false)
      : false;

    const rows = await extractTableRows(page, playbook, ctx);
    if (noResultsVisible && rows.length === 0) {
      return { rows: [], noResultsBanner: true };
    }

    return { rows, noResultsBanner: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { rows: [], noResultsBanner: false, error: msg };
  }
}

/**
 * @param {import('playwright-core').Page} page
 * @param {object} step
 * @param {object} ctx
 * @param {number} timeoutMs
 */
async function executeStep(page, step, ctx, timeoutMs) {
  const action = step.action;
  switch (action) {
    case 'goto': {
      const url = interpolate(step.url || '{{entryUrl}}', ctx);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForLoadState('load', { timeout: Math.min(timeoutMs, 45000) }).catch(() => {});
      break;
    }
    case 'waitFor': {
      const sel = interpolate(step.selector || '', ctx);
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: 'visible', timeout: timeoutMs });
      break;
    }
    case 'fill': {
      const sel = interpolate(step.selector || '', ctx);
      const value = interpolate(step.value || '', ctx);
      const loc = page.locator(sel).first();
      await loc.click();
      await loc.fill('');
      if (typeof loc.pressSequentially === 'function') {
        await loc.pressSequentially(value, { delay: 25 });
      } else {
        await loc.fill(value);
      }
      break;
    }
    case 'click': {
      const sel = interpolate(step.selector || '', ctx);
      await page.locator(sel).first().click({ timeout: timeoutMs });
      await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 20000) }).catch(() => {});
      break;
    }
    case 'waitForAny': {
      const selectors = (step.selectors || []).map((s) => interpolate(s, ctx));
      await Promise.race(
        selectors.map((sel) =>
          page.locator(sel).first().waitFor({ state: 'visible', timeout: timeoutMs })
        )
      ).catch(() => {});
      break;
    }
    case 'waitMs': {
      const ms = Number(step.ms) || 1000;
      await page.waitForTimeout(ms);
      break;
    }
    default:
      break;
  }
}

/**
 * @param {import('playwright-core').Page} page
 * @param {object} playbook
 * @param {object} ctx
 */
async function extractTableRows(page, playbook, ctx) {
  const rowSelector = interpolate(playbook.extractors?.resultRows || playbook.selectors?.resultRows || '', ctx);
  const columns = playbook.extractors?.columns || {
    entityName: 0,
    entityType: 1,
    status: 2,
    registrationDate: 3
  };

  if (!rowSelector) return [];

  return page.evaluate(
    ({ selectorRows, colMap }) => {
      const rowsEls = document.querySelectorAll(selectorRows);
      const out = [];
      rowsEls.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) return;
        const entry = {};
        for (const [field, idx] of Object.entries(colMap)) {
          entry[field] = cells[idx]?.textContent?.trim() || '';
        }
        if (entry.entityName || entry.businessName) {
          if (!entry.businessName) entry.businessName = entry.entityName;
          out.push(entry);
        }
      });
      return out;
    },
    { selectorRows: rowSelector, colMap: columns }
  );
}

/**
 * @param {{ rows: object[], noResultsBanner: boolean, error?: string }} scrapeResult
 * @param {string} businessName
 * @param {object} [matchRules]
 */
export function interpretScrapeResult(scrapeResult, businessName, matchRules = {}) {
  if (scrapeResult.error) {
    return { found: false, error: scrapeResult.error };
  }
  if (scrapeResult.noResultsBanner || scrapeResult.rows.length === 0) {
    return { found: false, message: 'No registry results' };
  }

  const best = pickBestMatch(scrapeResult.rows, businessName);
  if (!best) {
    return { found: false, message: 'No parseable rows' };
  }

  const status = best.status || '';
  const activeList = matchRules.activeStatuses || ['active'];
  const isActive = activeList.some((s) =>
    status.toLowerCase().includes(String(s).toLowerCase())
  );

  return {
    found: true,
    status,
    registrationDate: best.registrationDate || null,
    matchedBusinessName: best.entityName || best.businessName,
    isActive,
    allResults: scrapeResult.rows.slice(0, 5)
  };
}

export default { runPlaybook, interpretScrapeResult, interpolate, buildPlaybookContext };
