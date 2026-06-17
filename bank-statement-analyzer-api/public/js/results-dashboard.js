/**
 * Helios Forensic Report — renders macro 201 envelope or normalized statement.
 */
(function (global) {
  const { escapeHtml, formatCurrency, formatCompact, formatDate, apiFetch } = global.HeliosApi;

  function pick(...vals) {
    for (const v of vals) {
      if (v != null && v !== '') return v;
    }
    return null;
  }

  function normalizeEnvelope(raw) {
    if (!raw) return null;
    if (raw.data && (raw.data.deal || raw.data.metrics)) {
      return {
        id: raw.data.id || raw.data._id,
        applicationData: raw.applicationData || raw.data.applicationData || {},
        data: raw.data
      };
    }
    if (raw.data?.statement) return normalizeFromStatement(raw.data.statement, raw.data.transactions);
    if (raw.statement) return normalizeFromStatement(raw.statement, raw.transactions);
    return null;
  }

  function normalizeFromStatement(stmt, transactions) {
    const analysis = stmt.analysis || stmt.consolidatedMacroAnalysis || {};
    const app = stmt.applicationContext || analysis.applicationData || stmt.applicationData || {};
    const groups = analysis.accountGroups || [];
    const ft = analysis.financialTotals || {};
    const helios = groups[0]?.heliosAnalysis || analysis.heliosEngine || {};
    const veritas =
      stmt.veritasScore ?? analysis.overallRisk?.averageVeritasScore ?? groups[0]?.veritasScore ?? null;

    return {
      id: String(stmt._id || stmt.id),
      applicationData: app,
      data: {
        id: String(stmt._id || stmt.id),
        deal: {
          companyName: pick(app.companyName, app.dbaName, stmt.businessName, stmt.originalName),
          dba: app.dbaName,
          taxId: app.taxId,
          businessAddress: app.businessAddress,
          requestedLoanAmount: app.requestedLoanAmount,
          statedGAR: pick(app.statedRevenue, app.statedGAR),
          dealId: app.dealId
        },
        coverage: {
          startDate: pick(stmt.coveragePeriod?.start, stmt.statementPeriodStart),
          endDate: pick(stmt.coveragePeriod?.end, stmt.statementPeriodEnd),
          fileCount: stmt.statementCount || 1,
          accountCount: groups.length || 1
        },
        metrics: {
          totalDeposits: pick(stmt.totalDeposits, ft.totalDeposits, helios.financialSummary?.totalDeposits),
          totalWithdrawals: pick(stmt.totalWithdrawals, ft.totalWithdrawals),
          netCashFlow: pick(stmt.netCashFlow, ft.netCashFlow),
          averageDailyBalance: pick(stmt.averageDailyBalance, ft.averageDailyBalance),
          nsfCount: pick(stmt.nsfCount, ft.nsfCount, helios.nsfAnalysis?.count, 0),
          openingBalance: pick(stmt.openingBalance, ft.openingBalance),
          closingBalance: pick(stmt.closingBalance, ft.closingBalance)
        },
        accountingSummary: analysis.accountingSummary || null,
        juniorUnderwriter: analysis.juniorUnderwriter || null,
        forensicIntelligence: {
          ...(analysis.forensicIntelligence || {}),
          monthlyBreakdown:
            analysis.forensicIntelligence?.monthlyBreakdown || buildMonthlyFromTransactions(transactions),
          quarterlyBreakdown: analysis.forensicIntelligence?.quarterlyBreakdown || [],
          l3m: analysis.forensicIntelligence?.l3m || {},
          dscr: analysis.forensicIntelligence?.dscr || helios.dscr || null
        },
        alerts: buildAlerts(stmt.alerts || analysis.alerts),
        accountGroups: groups.map((g) => ({
          bankName: g.bankName,
          accountNumber: g.accountNumber,
          transactionCount: g.transactionCount,
          veritasScore: g.veritasScore
        })),
        vera: {
          decision: analysis.vera?.decision,
          bankabilityScore: analysis.vera?.bankabilityScore,
          briefingMarkdown: analysis.vera?.briefingMarkdown || stmt.report || analysis.report,
          stipulations: analysis.vera?.stipulations || []
        },
        veritasScore: veritas
      }
    };
  }

  function buildAlerts(alerts) {
    const items = Array.isArray(alerts) ? alerts : [];
    const count = (s) => items.filter((a) => String(a.severity || '').toUpperCase() === s).length;
    return { critical: count('CRITICAL'), high: count('HIGH'), medium: count('MEDIUM'), low: count('LOW'), items };
  }

  function buildMonthlyFromTransactions(transactions) {
    if (!Array.isArray(transactions) || !transactions.length) return [];
    const byMonth = {};
    for (const t of transactions) {
      const d = new Date(t.date);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { month: key, deposits: 0, withdrawals: 0 };
      const amt = Math.abs(Number(t.amount) || 0);
      if (Number(t.amount) >= 0) byMonth[key].deposits += amt;
      else byMonth[key].withdrawals += amt;
    }
    return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
  }

  function bankabilityLabel(score) {
    const n = Number(score);
    if (!Number.isFinite(n)) return { text: 'PENDING REVIEW', class: 'helios-badge-review' };
    if (n >= 750) return { text: 'STRONG BANKABILITY', class: 'helios-badge-strong' };
    if (n >= 650) return { text: 'MODERATE BANKABILITY', class: 'helios-badge-moderate' };
    return { text: 'ELEVATED RISK', class: 'helios-badge-weak' };
  }

  function revenueVariance(stated, observed) {
    const s = Number(stated);
    const o = Number(observed);
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(o)) {
      return { pct: null, label: 'Stated vs. observed revenue', fill: 50 };
    }
    const pct = ((o - s) / s) * 100;
    return {
      pct,
      label: `Observed deposits ${pct >= 0 ? 'above' : 'below'} stated by ${Math.abs(pct).toFixed(1)}%`,
      fill: Math.min(100, Math.max(8, 50 + pct / 2))
    };
  }

  function daysCashOnHand(metrics, accounting) {
    const adb = Number(metrics?.averageDailyBalance);
    const opex = Number(accounting?.opex?.total);
    if (!Number.isFinite(adb) || adb <= 0 || !Number.isFinite(opex) || opex <= 0) return null;
    const monthlyBurn = opex / 3;
    return monthlyBurn > 0 ? Math.round((adb / monthlyBurn) * 30) : null;
  }

  function debtSvcCoverage(dscr) {
    const p = dscr?.prospective ?? dscr?.ratio;
    if (Number.isFinite(Number(p))) return (Number(p) * 100).toFixed(1) + '%';
    return '—';
  }

  function consistencyScore(jr) {
    const five = jr?.fiveCs;
    if (!five) return jr?.overallScore ?? null;
    const vals = Object.values(five).map((c) => Number(c?.score)).filter(Number.isFinite);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : jr?.overallScore ?? null;
  }

  class HeliosReportDashboard {
    constructor(root) {
      this.root = root;
      this.envelope = null;
      this.chartMode = 'l3m';
      this.compact = root?.dataset?.compact === 'true';
    }

    async load() {
      const params = new URLSearchParams(global.location.search);
      const mock = params.get('mock') === '1';
      const id = params.get('id');

      this.root.innerHTML = '<div class="helios-loading">Loading forensic report…</div>';

      try {
        if (mock) {
          const res = await fetch('./mocks/mock201Envelope.json');
          this.envelope = normalizeEnvelope(await res.json());
        } else if (id) {
          const cached = this.readSessionCache(id);
          if (cached && this.hasVeraBriefing(normalizeEnvelope(cached))) {
            this.envelope = normalizeEnvelope(cached);
          } else {
            this.envelope = await this.fetchStatementWithVeraPoll(id, 12);
          }
        } else {
          const raw = sessionStorage.getItem('macroResult');
          if (raw) this.envelope = normalizeEnvelope(JSON.parse(raw));
        }

        if (!this.envelope?.data) throw new Error('No report data available');
        this.render();
        this.bindEvents();
      } catch (err) {
        this.root.innerHTML =
          '<div class="helios-error"><p>' +
          escapeHtml(err.message || 'Load failed') +
          '</p><p><a href="./manual-results.html">← Back to batches</a></p></div>';
      }
    }

    readSessionCache(id) {
      try {
        const parsed = JSON.parse(sessionStorage.getItem('macroResult') || 'null');
        const eid = parsed?.data?.id || parsed?.data?._id;
        if (eid && String(eid) === String(id)) return parsed;
      } catch {
        /* ignore */
      }
      return null;
    }

    hasVeraBriefing(envelope) {
      const md = envelope?.data?.vera?.briefingMarkdown;
      return typeof md === 'string' && md.trim().length > 20;
    }

    async fetchStatementWithVeraPoll(id, maxAttempts = 1) {
      const delayMs = 5000;
      let lastEnvelope = null;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          this.root.innerHTML =
            '<div class="helios-loading">Vera is drafting your briefing… (' +
            (attempt + 1) +
            '/' +
            maxAttempts +
            ')</div>';
          await new Promise((r) => setTimeout(r, delayMs));
        }
        const res = await apiFetch('/api/statements/' + encodeURIComponent(id));
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load statement');
        lastEnvelope = normalizeEnvelope(json);
        if (this.hasVeraBriefing(lastEnvelope)) return lastEnvelope;
      }
      return lastEnvelope;
    }

    render() {
      const d = this.envelope.data;
      const deal = d.deal || {};
      const metrics = d.metrics || {};
      const app = this.envelope.applicationData || d.applicationData || {};
      const forensic = d.forensicIntelligence || {};
      const jr = d.juniorUnderwriter || {};
      const accounting = d.accountingSummary || {};
      const vera = d.vera || {};
      const alerts = d.alerts || { items: [] };

      const veritas = Number(pick(d.veritasScore, d.accountGroups?.[0]?.veritasScore, jr.overallScore * 10));
      const badge = bankabilityLabel(veritas);
      const stated = pick(deal.statedGAR, app.statedRevenue);
      const variance = revenueVariance(stated, metrics.totalDeposits);
      const nsf = Number(metrics.nsfCount) || 0;
      const company = pick(deal.companyName, app.companyName, 'Business entity');
      const address = pick(deal.businessAddress, app.businessAddress, 'Address pending triage');
      const batchLabel = pick(deal.dealId, this.envelope.id, '—');
      const dcoh = daysCashOnHand(metrics, accounting);
      const consistency = consistencyScore(jr);

      if (this.compact) {
        this.chartMode = 'l3m';
        this.root.innerHTML = [
          '<main class="helios-main helios-main-compact">',
          this.renderDetailToolbar(company),
          this.renderHero(company, address, deal, app, d, variance, metrics, veritas, badge, vera),
          this.renderVeraBriefingPanel(vera),
          '<div class="helios-section-title"><h2>L3M KPI</h2></div>',
          this.renderMetricsRow(metrics, forensic, nsf, dcoh, consistency),
          this.renderChartSection(forensic),
          '</main>',
          this.renderVeraDock()
        ].join('');
        return;
      }

      this.root.innerHTML = [
        '<header class="helios-topbar">',
        '<div class="helios-brand">Shift 4 Funding <span>| Helios Engine</span></div>',
        '<span class="helios-batch-tag">Report: ' + escapeHtml(String(batchLabel).slice(0, 28)) + '</span>',
        '<div class="helios-topbar-actions">',
        '<a class="helios-btn helios-btn-ghost" href="./manual-upload.html">New Analysis</a>',
        '<a class="helios-btn helios-btn-primary" href="./manual-results.html">All Batches</a>',
        '</div></header>',
        '<main class="helios-main">',
        this.renderHero(company, address, deal, app, d, variance, metrics, veritas, badge, vera),
        this.renderMetricsRow(metrics, forensic, nsf, dcoh, consistency),
        this.renderBanners(alerts),
        this.renderChartSection(forensic),
        '<div class="helios-two-col">' + this.renderFiveCs(jr) + this.renderAccounting(accounting) + '</div>',
        '<div class="helios-two-col">' + this.renderAccounts(d.accountGroups) + this.renderStips(vera.stipulations) + '</div>',
        '<div class="helios-section-title"><h2>Cash flow &amp; liquidity snapshot</h2></div>',
        this.renderLiquidity(metrics, d),
        '</main>',
        this.renderVeraDock()
      ].join('');
    }

    renderDetailToolbar(company) {
      const id = this.envelope?.id || this.envelope?.data?.id;
      return (
        '<div class="helios-detail-toolbar" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center">' +
        '<a class="helios-btn helios-btn-ghost" href="./manual-results.html">← All analyses</a>' +
        '<button type="button" class="helios-btn helios-btn-ghost helios-btn-sm" data-action="view-json">View JSON</button>' +
        '<button type="button" class="helios-btn helios-btn-ghost helios-btn-sm" data-action="download-json">Download</button>' +
        '<button type="button" class="helios-btn helios-btn-ghost helios-btn-sm helios-btn-danger" data-action="delete-analysis">Delete</button>' +
        '<span style="flex:1"></span>' +
        '<span style="font-size:.75rem;color:#64748b">ID ' +
        escapeHtml(String(id || '').slice(-8)) +
        '</span></div>'
      );
    }

    renderVeraBriefingPanel(vera) {
      if (!vera?.briefingMarkdown) {
        return (
          '<section class="helios-card helios-vera-pending" style="margin-bottom:20px;padding:16px">' +
          '<h2 style="margin:0 0 8px;font-size:1rem">Vera Executive Briefing</h2>' +
          '<p style="margin:0;color:#64748b;font-size:0.9rem">Briefing is still generating. Refresh in a moment or open this page again from Upload Hub after Run Analysis completes.</p>' +
          '</section>'
        );
      }
      const html =
        global.marked && typeof global.marked.parse === 'function'
          ? global.marked.parse(vera.briefingMarkdown)
          : '<pre>' + escapeHtml(vera.briefingMarkdown) + '</pre>';
      return (
        '<section class="helios-card" style="margin-bottom:20px;padding:16px">' +
        '<h2 style="margin:0 0 12px;font-size:1rem">Vera Executive Briefing</h2>' +
        '<div class="helios-vera-briefing-md">' +
        html +
        '</div></section>'
      );
    }

    renderHero(company, address, deal, app, d, variance, metrics, veritas, badge, vera) {
      return (
        '<section class="helios-grid-hero">' +
        '<article class="helios-card helios-business">' +
        '<h1>' + escapeHtml(company) + '</h1>' +
        '<p class="helios-address">' + escapeHtml(address) + '</p>' +
        '<div class="helios-deal-chips">' +
        (deal.taxId ? '<span class="helios-chip">EIN ' + escapeHtml(deal.taxId) + '</span>' : '') +
        (deal.requestedLoanAmount
          ? '<span class="helios-chip">Ask: ' + escapeHtml(formatCurrency(deal.requestedLoanAmount)) + '</span>'
          : '') +
        (deal.statedGAR || app.statedRevenue
          ? '<span class="helios-chip">Stated GAR: ' +
            escapeHtml(formatCurrency(deal.statedGAR || app.statedRevenue)) +
            '</span>'
          : '') +
        (app.industry ? '<span class="helios-chip">' + escapeHtml(app.industry) + '</span>' : '') +
        (d.coverage?.startDate
          ? '<span class="helios-chip">Coverage ' +
            escapeHtml(formatDate(d.coverage.startDate)) +
            ' – ' +
            escapeHtml(formatDate(d.coverage.endDate)) +
            '</span>'
          : '') +
        '</div>' +
        '<div class="helios-variance"><label>' +
        escapeHtml(variance.label) +
        '</label><div class="helios-variance-bar"><div class="helios-variance-fill" style="width:' +
        variance.fill +
        '%"></div></div>' +
        '<div class="helios-variance-stats"><span>Observed: ' +
        escapeHtml(formatCompact(metrics.totalDeposits)) +
        '</span><span>' +
        (variance.pct != null
          ? (variance.pct >= 0 ? '+' : '') + variance.pct.toFixed(2) + '% vs stated'
          : '—') +
        '</span></div></div>' +
        '</article>' +
        '<article class="helios-card helios-score-card">' +
        '<div class="score-label">Veritas Audit Score</div>' +
        '<div class="score-value">' +
        (Number.isFinite(veritas) ? Math.round(veritas) : '—') +
        '</div>' +
        '<span class="helios-badge ' + badge.class + '">' + escapeHtml(badge.text) + '</span>' +
        (vera.decision
          ? '<p style="margin-top:12px;font-size:0.8rem;color:#94a3b8">Vera: ' +
            escapeHtml(vera.decision) +
            (vera.bankabilityScore != null ? ' · ' + vera.bankabilityScore + '/10' : '') +
            '</p>'
          : '') +
        '</article></section>'
      );
    }

    renderMetricsRow(metrics, forensic, nsf, dcoh, consistency) {
      return (
        '<section class="helios-metrics-row">' +
        '<div class="helios-metric-tile"><div class="metric-label">Avg Daily Balance</div><div class="metric-value">' +
        escapeHtml(formatCompact(metrics.averageDailyBalance)) +
        '</div></div>' +
        '<div class="helios-metric-tile' +
        (nsf >= 3 ? ' warn' : '') +
        '"><div class="metric-label">NSF Alert Count</div><div class="metric-value">' +
        escapeHtml(String(nsf)) +
        '</div></div>' +
        '<div class="helios-metric-tile"><div class="metric-label">Debt Svc Coverage</div><div class="metric-value">' +
        escapeHtml(debtSvcCoverage(forensic.dscr)) +
        '</div></div>' +
        '<div class="helios-metric-tile"><div class="metric-label">Days Cash on Hand</div><div class="metric-value">' +
        (dcoh != null ? escapeHtml(String(dcoh)) : '—') +
        '</div></div>' +
        '<div class="helios-metric-tile"><div class="metric-label">Consistency Score</div><div class="metric-value">' +
        (consistency != null ? escapeHtml(String(consistency)) : '—') +
        '</div></div></section>'
      );
    }

    renderChartSection(forensic) {
      return (
        '<div class="helios-section-title"><h2>Forensic Drill-Down</h2>' +
        '<div class="helios-toggle" role="tablist">' +
        ['l3m', 'monthly', 'quarterly']
          .map(
            (m) =>
              '<button type="button" data-chart="' +
              m +
              '" class="' +
              (this.chartMode === m ? 'active' : '') +
              '">' +
              (m === 'l3m' ? 'L3M' : m.charAt(0).toUpperCase() + m.slice(1)) +
              '</button>'
          )
          .join('') +
        '</div></div>' +
        '<div class="helios-chart-wrap" id="helios-chart">' +
        this.renderChart(forensic) +
        '</div>'
      );
    }

    renderLiquidity(metrics, d) {
      const kpis = [
        ['Total deposits', formatCurrency(metrics.totalDeposits)],
        ['Total withdrawals', formatCurrency(metrics.totalWithdrawals)],
        ['Net cash flow', formatCurrency(metrics.netCashFlow)],
        ['Opening', formatCurrency(metrics.openingBalance)],
        ['Closing', formatCurrency(metrics.closingBalance)],
        [
          'Files / accounts',
          String(d.coverage?.fileCount || '—') + ' / ' + String(d.coverage?.accountCount || '—')
        ]
      ];
      return (
        '<div class="helios-card"><div class="helios-kpi-grid">' +
        kpis
          .map(
            ([k, v]) =>
              '<div class="helios-kpi"><div class="k">' + escapeHtml(k) + '</div><div class="v">' + escapeHtml(v) + '</div></div>'
          )
          .join('') +
        '</div></div>'
      );
    }

    renderBanners(alerts) {
      const items = alerts.items || [];
      if (!items.length) {
        return (
          '<div class="helios-banner helios-banner-info"><span>ℹ️</span><div>No critical alerts on file. Monitor NSF and liquidity trends.</div></div>'
        );
      }
      return items
        .slice(0, 6)
        .map((a) => {
          const sev = String(a.severity || 'MEDIUM').toUpperCase();
          const cls =
            sev === 'CRITICAL' || sev === 'HIGH'
              ? 'helios-banner-critical'
              : sev === 'MEDIUM'
                ? 'helios-banner-warning'
                : 'helios-banner-info';
          const icon = sev === 'CRITICAL' || sev === 'HIGH' ? '⚠️' : sev === 'MEDIUM' ? '⚡' : 'ℹ️';
          return (
            '<div class="helios-banner ' +
            cls +
            '"><span>' +
            icon +
            '</span><div><strong>' +
            escapeHtml(a.title || a.code || 'Alert') +
            '</strong><br>' +
            escapeHtml(a.message || '') +
            '</div></div>'
          );
        })
        .join('');
    }

    renderChart(forensic) {
      let rows = [];
      if (this.chartMode === 'quarterly') {
        rows = (forensic.quarterlyBreakdown || []).map((q) => ({
          label: q.quarter || q.label,
          deposits: q.deposits,
          withdrawals: q.withdrawals
        }));
      } else if (this.chartMode === 'monthly') {
        rows = (forensic.monthlyBreakdown || []).map((m) => ({
          label: m.month,
          deposits: m.deposits,
          withdrawals: m.withdrawals
        }));
      } else {
        const monthly = forensic.monthlyBreakdown || [];
        rows = (monthly.length ? monthly.slice(-3) : []).map((m) => ({
          label: m.month,
          deposits: m.deposits,
          withdrawals: m.withdrawals
        }));
      }

      if (!rows.length) {
        return '<p style="color:#64748b;margin:0">No breakdown data for this period.</p>';
      }

      const max = Math.max(...rows.flatMap((r) => [Number(r.deposits) || 0, Number(r.withdrawals) || 0]), 1);

      return (
        '<div class="helios-bars">' +
        rows
          .map((r) => {
            const depH = Math.round(((Number(r.deposits) || 0) / max) * 140);
            const wdH = Math.round(((Number(r.withdrawals) || 0) / max) * 140);
            const lbl = String(r.label || '').replace(/^(\d{4})-(\d{2})$/, '$2/$1');
            return (
              '<div class="helios-bar-col"><div class="helios-bar-stack">' +
              '<div class="helios-bar-dep" style="height:' +
              depH +
              'px"></div>' +
              '<div class="helios-bar-wd" style="height:' +
              wdH +
              'px"></div></div>' +
              '<span class="helios-bar-label">' +
              escapeHtml(lbl) +
              '</span></div>'
            );
          })
          .join('') +
        '</div>'
      );
    }

    renderFiveCs(jr) {
      const five = jr?.fiveCs;
      if (!five) {
        return '<div class="helios-card"><h3 style="margin:0 0 12px">Junior Underwriter (5 C\'s)</h3><p style="color:#64748b;margin:0">Pending analysis.</p></div>';
      }
      const rows = Object.entries(five)
        .map(([name, c]) => {
          const score = Number(c?.score) || 0;
          return (
            '<div class="c-row"><span>' +
            escapeHtml(name) +
            '</span><div class="c-bar"><div class="c-fill" style="width:' +
            Math.min(100, score) +
            '%"></div></div><span>' +
            score +
            '</span></div>'
          );
        })
        .join('');
      return (
        '<div class="helios-card helios-five-c"><h3 style="margin:0 0 14px">Junior Underwriter — ' +
        escapeHtml(jr.decision || 'Review') +
        '</h3>' +
        rows +
        '</div>'
      );
    }

    renderAccounting(acct) {
      if (!acct || !Object.keys(acct).length) {
        return '<div class="helios-card"><h3 style="margin:0 0 12px">Accounting summary</h3><p style="color:#64748b;margin:0">Not available.</p></div>';
      }
      const lines = ['revenue', 'cogs', 'opex', 'debtService', 'netIncomeProxy']
        .filter((k) => acct[k])
        .map(
          (k) =>
            '<div class="helios-kpi"><div class="k">' +
            escapeHtml(k) +
            '</div><div class="v">' +
            escapeHtml(formatCurrency(acct[k].total ?? acct[k])) +
            '</div></div>'
        )
        .join('');
      return (
        '<div class="helios-card"><h3 style="margin:0 0 14px">Accounting-grade categorization</h3><div class="helios-kpi-grid">' +
        lines +
        '</div></div>'
      );
    }

    renderAccounts(groups) {
      const rows = (groups || [])
        .map(
          (g) =>
            '<tr><td>' +
            escapeHtml(g.bankName || '—') +
            '</td><td>' +
            escapeHtml(g.accountNumber || '—') +
            '</td><td>' +
            escapeHtml(String(g.transactionCount ?? '—')) +
            '</td><td>' +
            (g.veritasScore != null ? escapeHtml(String(Math.round(g.veritasScore))) : '—') +
            '</td></tr>'
        )
        .join('');
      return (
        '<div class="helios-card"><h3 style="margin:0 0 14px">Account groups</h3>' +
        '<table class="helios-account-table"><thead><tr><th>Bank</th><th>Account</th><th>Trx</th><th>Veritas</th></tr></thead>' +
        '<tbody>' +
        (rows || '<tr><td colspan="4">No accounts</td></tr>') +
        '</tbody></table></div>'
      );
    }

    renderStips(stips) {
      const list = (stips || [])
        .map((s) => '<div class="helios-stip">' + escapeHtml(s.title || s.description || String(s)) + '</div>')
        .join('');
      return (
        '<div class="helios-card"><h3 style="margin:0 0 14px">Vera stipulations</h3>' +
        (list || '<p style="color:#64748b;margin:0">None required.</p>') +
        '</div>'
      );
    }

    renderVeraDock() {
      return (
        '<aside class="helios-vera-dock" aria-label="Vera AI underwriter">' +
        '<header class="helios-vera-header"><span>Ask Vera AI Underwriter</span>' +
        '<span class="helios-vera-status">Online</span></header>' +
        '<div class="helios-vera-body" id="vera-briefing"><strong>Underwriting Briefing</strong></div>' +
        '<form class="helios-vera-input-row" id="vera-chat-form">' +
        '<input type="text" placeholder="Ask about this deal…" autocomplete="off" />' +
        '<button type="submit">Send</button></form></aside>'
      );
    }

    bindEvents() {
      const veraBody = document.getElementById('vera-briefing');
      const vera = this.envelope?.data?.vera || {};
      if (veraBody && global.marked && vera.briefingMarkdown) {
        veraBody.innerHTML =
          '<strong>Underwriting Briefing</strong>' + global.marked.parse(vera.briefingMarkdown);
      } else if (veraBody && vera.briefingMarkdown) {
        veraBody.innerHTML =
          '<strong>Underwriting Briefing</strong><pre style="white-space:pre-wrap;font:inherit">' +
          escapeHtml(vera.briefingMarkdown) +
          '</pre>';
      }

      this.root.querySelectorAll('[data-chart]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.chartMode = btn.getAttribute('data-chart');
          this.root.querySelectorAll('[data-chart]').forEach((b) => b.classList.toggle('active', b === btn));
          const chart = document.getElementById('helios-chart');
          if (chart) chart.innerHTML = this.renderChart(this.envelope.data.forensicIntelligence || {});
        });
      });

      document.getElementById('vera-chat-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = e.target.querySelector('input');
        const q = input?.value?.trim();
        if (!q || !veraBody) return;
        const note = document.createElement('p');
        note.style.marginTop = '10px';
        note.innerHTML = '<em>You:</em> ' + escapeHtml(q);
        veraBody.appendChild(note);
        input.value = '';
        try {
          const res = await apiFetch('/api/statements/analysis/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              statementId: statementId,
              message: q
            })
          });
          const json = await res.json();
          const answer = json?.data?.answer || json?.answer || 'No response from Vera.';
          const reply = document.createElement('p');
          reply.style.marginTop = '8px';
          reply.innerHTML = '<strong>Vera:</strong> ' + escapeHtml(String(answer));
          veraBody.appendChild(reply);
        } catch (err) {
          const errP = document.createElement('p');
          errP.style.marginTop = '8px';
          errP.innerHTML =
            '<strong>Vera:</strong> <span style="color:#b91c1c">' +
            escapeHtml(err.message || 'Chat failed') +
            '</span>';
          veraBody.appendChild(errP);
        }
      });

      const statementId = this.envelope?.id || this.envelope?.data?.id;
      const company =
        this.envelope?.data?.deal?.companyName ||
        this.envelope?.applicationData?.companyName ||
        'this analysis';

      this.root.querySelector('[data-action="view-json"]')?.addEventListener('click', () => {
        if (global.HeliosAnalysisJsonModal && statementId) {
          HeliosAnalysisJsonModal.open(statementId, company + ' — JSON');
        }
      });

      this.root.querySelector('[data-action="download-json"]')?.addEventListener('click', () => {
        if (!statementId) return;
        apiFetch(
          '/api/statements/' + encodeURIComponent(statementId) + '/export-json?variant=master&download=1'
        )
          .then((res) => res.blob())
          .then((blob) => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'analysis_master_' + statementId + '.json';
            a.click();
            URL.revokeObjectURL(a.href);
          })
          .catch((err) => alert(err.message || 'Download failed'));
      });

      this.root.querySelector('[data-action="delete-analysis"]')?.addEventListener('click', () => {
        if (!statementId) return;
        if (!confirm('Delete analysis for ' + company + '? This cannot be undone.')) return;
        apiFetch('/api/statements/' + encodeURIComponent(statementId), { method: 'DELETE' })
          .then((res) => res.json().then((j) => ({ res, j })))
          .then(({ res, j }) => {
            if (!res.ok) throw new Error(j.error || 'Delete failed');
            global.location.href = './manual-results.html';
          })
          .catch((err) => alert(err.message || 'Delete failed'));
      });
    }
  }

  global.HeliosReportDashboard = HeliosReportDashboard;

  document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(global.location.search);
    const mock = params.get('mock') === '1';
    if (
      !mock &&
      global.HeliosAuth &&
      !HeliosAuth.requireAuth(global.location.pathname + global.location.search)
    ) {
      return;
    }

    const root = document.getElementById('helios-report-root');
    if (root && !root.hasAttribute('data-manual-init')) {
      new HeliosReportDashboard(root).load();
    }
  });
})(window);
