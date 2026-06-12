/**
 * California SOS business search — Playwright-extra + puppeteer-extra-plugin-stealth
 * compatible scraping helper.
 *
 * Uses locator-driven waits for dynamic renders instead of brittle fixed sleeps.
 */

export const DEFAULT_CA_SOS_SCRAPER_CONFIG = Object.freeze({
    url: 'https://bizfileonline.sos.ca.gov/search/business',
    selectors: {
        searchInput: '#SearchCriteria_EntityName',
        searchButton: '#btnSearch',
        resultsTable: '.search-results table',
        resultRows: '.search-results table tbody tr',
        noResults: '.no-results, .alert-warning'
    }
});

/** @typedef {{ entityName: string, entityType: string, status: string, registrationDate: string }} SosBusinessRow */

/**
 * @param {import('playwright-core').Page} page
 * @param {object} args
 * @param {string} args.businessName
 * @param {typeof DEFAULT_CA_SOS_SCRAPER_CONFIG} [args.config]
 * @param {number} [args.timeoutMs]
 * @returns {Promise<{ rows: SosBusinessRow[], noResultsBanner: boolean, error?: string }>}
 */
export async function scrapeCaliforniaBusinessSearch(page, { businessName, config = DEFAULT_CA_SOS_SCRAPER_CONFIG, timeoutMs = 30000 }) {
    const { url, selectors } = config;

    try {
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs
        });

        await page.waitForLoadState('load', { timeout: Math.min(timeoutMs, 45000) }).catch(() => {});

        const searchBox = page.locator(selectors.searchInput);
        await searchBox.waitFor({ state: 'attached', timeout: timeoutMs }).catch(async () => {
            await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 25000) }).catch(() => {});
            await searchBox.waitFor({ state: 'attached', timeout: timeoutMs });
        });
        await searchBox.waitFor({ state: 'visible', timeout: timeoutMs });

        await searchBox.click();
        await searchBox.fill('');

        if (typeof searchBox.pressSequentially === 'function') {
            await searchBox.pressSequentially(businessName, { delay: 25 });
        } else {
            await searchBox.type(businessName, { delay: 25 });
        }

        const searchBtn = page.locator(selectors.searchButton);
        await searchBtn.waitFor({ state: 'visible', timeout: timeoutMs });

        const resultsTable = page.locator(selectors.resultsTable);
        const noResultsMsg = page.locator(selectors.noResults);

        await searchBtn.click({ timeout: timeoutMs });

        await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 20000) }).catch(() => {});

        await Promise.race([
            resultsTable.waitFor({ state: 'visible', timeout: timeoutMs }),
            noResultsMsg.waitFor({ state: 'visible', timeout: timeoutMs })
        ]);

        const noResultsVisible = await noResultsMsg.isVisible().catch(() => false);
        const tableVisible = await resultsTable.isVisible().catch(() => false);

        if (noResultsVisible && !tableVisible) {
            return { rows: [], noResultsBanner: true };
        }

        await resultsTable.waitFor({ state: 'visible', timeout: timeoutMs });

        const evaluated = await page.evaluate((selectorRows) => {
            const rowsEls = document.querySelectorAll(selectorRows);
            /** @type {{ entityName: string, entityType: string, status: string, registrationDate: string }[]} */
            const out = [];

            rowsEls.forEach((row) => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    const entityName = cells[0]?.textContent?.trim() || '';
                    const entityType = cells[1]?.textContent?.trim() || '';
                    const status = cells[2]?.textContent?.trim() || '';
                    const dateText = cells[3]?.textContent?.trim() || '';

                    out.push({
                        entityName,
                        entityType,
                        status,
                        registrationDate: dateText
                    });
                }
            });

            return out;
        }, selectors.resultRows);

        return {
            rows: evaluated,
            noResultsBanner: false
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            rows: [],
            noResultsBanner: false,
            error: msg
        };
    }
}
