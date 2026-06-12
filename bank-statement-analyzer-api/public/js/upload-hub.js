/**
 * Upload Hub — Role 2 broker golden path:
 * 1) POST /batch/triage → uploadSessionId only (no redirect)
 * 2) Stay on Upload Hub for broker review
 * 3) Primary button → Run Analysis
 * 4) POST /api/statements/batch with uploadSessionId + JWT
 * 5) Redirect only after HTTP 201 with statementId
 */
(function () {
  const STORAGE_API = 'bsaApiBaseUrl';
  const STORAGE_DASHBOARD = 'bsaDashboardBaseUrl';
  const AUTO_TRIAGE_DEBOUNCE_MS = 300;

  const state = {
    stagedFiles: [],
    pendingTriage: null,
    inspectorBlobUrl: null,
    uploading: false,
    lastUploadSessionId: null,
    lastResultId: null,
    primaryActionMode: 'upload',
    triageDebounceTimer: null,
    triageGeneration: 0,
    progressPollTimer: null,
    macroJobPollTimer: null,
    recoveryBubbleEl: null,
    lastProgressPhase: null
  };

  const els = {};

  function apiBaseUrl() {
    const legacy = localStorage.getItem(STORAGE_DASHBOARD);
    const apiStored = localStorage.getItem(STORAGE_API);
    if (apiStored) return apiStored.replace(/\/$/, '');
    if (legacy && !localStorage.getItem(STORAGE_API)) {
      return legacy.replace(/\/$/, '');
    }
    return window.location.origin.replace(/\/$/, '');
  }

  /** Helios Next.js dashboard (default port 3002). Set to "legacy" for manual-results.html. */
  function dashboardBaseUrl() {
    const raw = localStorage.getItem(STORAGE_DASHBOARD);
    if (raw === 'legacy' || raw === '') return null;
    return (raw || 'http://localhost:3002').replace(/\/$/, '');
  }

  function resultsDashboardUrl(id, options) {
    options = options || {};
    const base = dashboardBaseUrl();
    const token = getToken();
    const params = new URLSearchParams();
    if (options.warnings) params.set('warnings', '1');
    if (token) params.set('token', token);
    const qs = params.toString();
    if (base) {
      return base + '/dashboard/' + encodeURIComponent(id) + (qs ? '?' + qs : '');
    }
    return (
      './manual-results.html?id=' +
      encodeURIComponent(id) +
      (options.warnings ? '&warnings=1' : '')
    );
  }

  function getToken() {
    return window.HeliosAuth ? HeliosAuth.getToken() : localStorage.getItem('bsaDashboardToken') || '';
  }

  function hasValidJwt() {
    return window.HeliosAuth?.isValidJwt?.(getToken());
  }

  function triageEndpoint() {
    return '/api/statements/batch/triage';
  }

  function batchEndpoint() {
    return '/api/statements/batch';
  }

  function batchProgressEndpoint(correlationId) {
    return '/api/statements/batch/progress/' + encodeURIComponent(correlationId);
  }

  function batchJobEndpoint(jobId) {
    return '/api/statements/batch/jobs/' + encodeURIComponent(jobId);
  }

  function confirmBankEndpoint() {
    return '/api/statements/batch/confirm-bank';
  }

  function stopMacroJobPoll() {
    if (state.macroJobPollTimer) {
      clearTimeout(state.macroJobPollTimer);
      state.macroJobPollTimer = null;
    }
  }

  function stopProgressPoll() {
    if (state.progressPollTimer) {
      clearTimeout(state.progressPollTimer);
      state.progressPollTimer = null;
    }
    state.recoveryBubbleEl = null;
    state.lastProgressPhase = null;
  }

  function stopAllPolls() {
    stopMacroJobPoll();
    stopProgressPoll();
  }

  function resetUiAfterSessionExpired() {
    stopAllPolls();
    state.uploading = false;
    els.dropZone?.classList.remove('is-busy');
    setHubProgress(false);
    setPrimaryAction(state.lastUploadSessionId ? 'runAnalysis' : 'upload');
  }

  function ensureRecoveryBubble() {
    if (!state.recoveryBubbleEl || !state.recoveryBubbleEl.isConnected) {
      state.recoveryBubbleEl = appendSystemBubble('', 'is-warning bubble--recovery');
    }
    return state.recoveryBubbleEl;
  }

  function updateRecoveryBubble(html) {
    const el = ensureRecoveryBubble();
    el.innerHTML = html;
    scrollChat();
  }

  function formatProgressMessage(progress) {
    if (!progress) return '';
    const phase = progress.phase || '';
    if (phase === 'dual_engine_parse' && progress.fileName) {
      return (
        'Cross-checking spatial tables for <strong>' +
        escapeHtml(progress.fileName) +
        '</strong>…'
      );
    }
    if (phase === 'pdf_plumber_rescue' && progress.fileName) {
      return (
        'Spatial table extraction for <strong>' +
        escapeHtml(progress.fileName) +
        '</strong> (pdfplumber)…'
      );
    }
    if (phase === 'vision_row_rescue' && progress.fileName) {
      return (
        'Layout misaligned — rescuing <strong>' +
        escapeHtml(progress.fileName) +
        '</strong> with direct row extraction…'
      );
    }
    if (phase === 'template_learn' && progress.fileName) {
      return (
        'Learning statement layout from <strong>' +
        escapeHtml(progress.fileName) +
        '</strong>…'
      );
    }
    if (phase === 'local_reparse') {
      return escapeHtml(progress.message || 'Re-parsing statements with learned layout…');
    }
    if (phase === 'vision_row_fallback' && progress.fileName) {
      return (
        'Rescuing data alignment for <strong>' +
        escapeHtml(progress.fileName) +
        '</strong>…'
      );
    }
    if (phase === 'cache_eviction' && progress.rtn) {
      return (
        'Clearing cached layout for routing <strong>' +
        escapeHtml(progress.rtn) +
        '</strong>…'
      );
    }
    if (phase === 'checksum_recovery') {
      return escapeHtml(progress.message || 'Checksum below 80% — starting alignment rescue…');
    }
    if (phase === 'checksum_recovery_complete') {
      return escapeHtml(progress.message || 'Alignment rescue succeeded — continuing analysis…');
    }
    if (phase === 'checksum_recovery_failed') {
      return escapeHtml(progress.message || 'Alignment rescue finished — verifying integrity…');
    }
    if (progress.message) return escapeHtml(progress.message);
    return '';
  }

  async function pollBatchProgress(correlationId) {
    try {
      const res = await apiFetch(batchProgressEndpoint(correlationId), { method: 'GET' });
      if (res.status === 401 || res.status === 403) {
        stopProgressPoll();
        return;
      }
      if (res.status === 404) {
        stopProgressPoll();
        return;
      }
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      const progress = json.progress;
      if (!progress) return;
      const progressKey =
        (progress.phase || '') + '|' + (progress.fileName || '') + '|' + (progress.rtn || '');
      if (progressKey === state.lastProgressPhase) return;
      state.lastProgressPhase = progressKey;
      const msg = formatProgressMessage(progress);
      if (msg) updateRecoveryBubble(msg);
    } catch {
      /* ignore poll errors */
    }
  }

  function startProgressPoll(correlationId) {
    if (!correlationId) return;
    stopProgressPoll();
    let currentInterval = 3000;
    const scheduleProgressPoll = () => {
      state.progressPollTimer = setTimeout(async () => {
        if (!state.progressPollTimer) return;
        await pollBatchProgress(correlationId);
        if (state.progressPollTimer) {
          currentInterval = Math.min(currentInterval + 1500, 12000);
          scheduleProgressPoll();
        }
      }, currentInterval);
    };
    void pollBatchProgress(correlationId);
    scheduleProgressPoll();
  }

  function buildChecksumGateFailedBubble(json) {
    const lines = [];
    if (json.checksumRecovery?.attempted) {
      lines.push(
        '<p><strong>Alignment rescue completed</strong> but the integrity gate is still below 80%.</p>'
      );
    } else {
      lines.push('<p><strong>Checksum integrity gate failed</strong> (minimum 80% of statements must reconcile).</p>');
    }
    const files = json.parseQualityByFile || [];
    if (files.length) {
      lines.push('<ul style="margin:8px 0 0;padding-left:1.2em;">');
      for (const f of files) {
        const mismatch =
          f.aggregateMismatch ||
          f.deltaProbe?.probeHint === 'AGGREGATE_MISMATCH' ||
          f.parseQuality === 'AGGREGATE_MISMATCH';
        const hint = mismatch
          ? ' <em>(aggregate mismatch)</em>'
          : f.checksumOk
            ? ''
            : ' <em>(checksum failed)</em>';
        lines.push(
          '<li>' +
            escapeHtml(f.fileName || 'statement') +
            hint +
            (f.checksumDelta != null ? ' — Δ ' + escapeHtml(String(f.checksumDelta)) : '') +
            '</li>'
        );
      }
      lines.push('</ul>');
    }
    return lines.join('');
  }

  function setDropZoneCompact(compact) {
    if (!els.dropZone) return;
    els.dropZone.classList.toggle('drop-zone--compact', compact);
    if (els.dropZoneCompact) els.dropZoneCompact.hidden = !compact;
    updateCompactFileCount();
  }

  function updateCompactFileCount() {
    if (!els.compactFileCount) return;
    const n = state.stagedFiles.length;
    els.compactFileCount.textContent = n ? n + ' file' + (n === 1 ? '' : 's') : '';
  }

  function setHubProgress(show) {
    if (!els.hubProgress) return;
    els.hubProgress.hidden = !show;
    els.hubProgress.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  function setPrimaryAction(mode) {
    state.primaryActionMode = mode;
    const btn = els.primaryActionBtn;
    if (!btn) return;
    setHubProgress(mode === 'classifying' || mode === 'running');

    btn.classList.remove('analyze-btn--upload', 'analyze-btn--run', 'is-classifying', 'is-running');
    btn.disabled = false;

    switch (mode) {
      case 'classifying':
        btn.textContent = 'Classifying…';
        btn.classList.add('is-classifying');
        btn.disabled = true;
        break;
      case 'runAnalysis':
        btn.textContent = 'Run Analysis';
        btn.classList.add('analyze-btn--run');
        btn.disabled = state.uploading || !state.lastUploadSessionId;
        break;
      case 'running':
        btn.textContent = 'Running analysis…';
        btn.classList.add('analyze-btn--run', 'is-running');
        btn.disabled = true;
        break;
      case 'upload':
      default:
        btn.textContent = 'Upload';
        btn.classList.add('analyze-btn--upload');
        btn.disabled = state.uploading;
        break;
    }
  }

  function updateAuthStatus() {
    if (!els.authStatus) return;
    if (hasValidJwt()) {
      els.authStatus.textContent = 'Signed in — JWT attached to API calls.';
      els.authStatus.className = 'helios-auth-status is-ok';
      if (els.authPanel) els.authPanel.hidden = true;
      if (state.stagedFiles.length) scheduleAutoTriage();
    } else {
      els.authStatus.textContent = 'Sign in to upload and analyze statements.';
      els.authStatus.className = 'helios-auth-status';
      if (els.authPanel) els.authPanel.hidden = false;
    }
  }

  async function apiFetch(path, options = {}) {
    const token = getToken();
    if (!HeliosAuth?.isValidJwt?.(token)) {
      throw new Error('Authentication required');
    }
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (!headers.Authorization) {
      headers.Authorization = 'Bearer ' + token;
    }
    const res = await fetch(apiBaseUrl() + path, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      try {
        window.dispatchEvent(
          new CustomEvent('helios-auth-expired', { detail: { status: res.status, path } })
        );
      } catch {
        /* ignore */
      }
    }
    return res;
  }

  function scrollChat() {
    els.chatHistory.scrollTop = els.chatHistory.scrollHeight;
  }

  function appendBubble(kind, html, extraClass) {
    const el = document.createElement('div');
    el.className = 'chat-bubble chat-bubble--' + kind + (extraClass ? ' ' + extraClass : '');
    el.innerHTML = html;
    els.chatHistory.appendChild(el);
    scrollChat();
    return el;
  }

  function appendUserBatchBubble(files) {
    const names = files.map((f) => escapeHtml(f.name)).join(', ');
    const label =
      files.length === 1
        ? 'Uploaded: <strong>' + escapeHtml(files[0].name) + '</strong>'
        : 'Uploaded <strong>' + files.length + ' files</strong>: ' + names;
    appendBubble('user', label);
  }

  function appendSystemBubble(html, extraClass) {
    return appendBubble('system', html, extraClass);
  }

  function escapeHtml(s) {
    const d = document.createElement('span');
    d.textContent = s;
    return d.innerHTML;
  }

  function revokeInspectorBlob() {
    if (state.inspectorBlobUrl) {
      URL.revokeObjectURL(state.inspectorBlobUrl);
      state.inspectorBlobUrl = null;
    }
  }

  function closeInspector() {
    revokeInspectorBlob();
    document.body.classList.remove('inspector-open');
    const inspector = document.getElementById('pdf-inspector');
    if (inspector) inspector.setAttribute('aria-hidden', 'true');
    els.pdfFrame.removeAttribute('src');
    els.pdfFrame.hidden = true;
    els.pdfEmpty.hidden = false;
  }

  function openInspectorWithUrl(url) {
    const inspector = document.getElementById('pdf-inspector');
    if (inspector) inspector.setAttribute('aria-hidden', 'false');
    els.pdfEmpty.hidden = true;
    els.pdfFrame.hidden = false;
    els.pdfFrame.src = url;
    document.body.classList.add('inspector-open');
  }

  async function openInspectorWithAuthenticatedUrl(path) {
    const res = await apiFetch(path, { headers: { Accept: 'application/pdf' } });
    if (!res.ok) {
      throw new Error('PDF fetch failed (' + res.status + ')');
    }
    const blob = await res.blob();
    revokeInspectorBlob();
    state.inspectorBlobUrl = URL.createObjectURL(blob);
    openInspectorWithUrl(state.inspectorBlobUrl);
  }

  function openInspectorWithFile(file) {
    revokeInspectorBlob();
    state.inspectorBlobUrl = URL.createObjectURL(file);
    openInspectorWithUrl(state.inspectorBlobUrl);
  }

  function pickPreviewFile(files, preferredName) {
    if (!files || !files.length) return null;
    if (preferredName) {
      const match = files.find((f) => f.name === preferredName);
      if (match) return match;
    }
    return files[0];
  }

  async function resolveServerPdfUrl(statementId) {
    const res = await apiFetch('/api/statements/' + encodeURIComponent(statementId), {
      headers: { Accept: 'application/json' }
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const vera = json.data?.vera;
    if (vera?.pdfUrl && !String(vera.pdfUrl).startsWith('memory://')) {
      return vera.pdfUrl;
    }
    const st = json.data?.statement;
    const fileUrl = st?.fileUrl || st?.filePath;
    if (fileUrl && !String(fileUrl).startsWith('memory://')) {
      if (String(fileUrl).startsWith('http')) return fileUrl;
      return apiBaseUrl() + (String(fileUrl).startsWith('/') ? '' : '/') + fileUrl;
    }
    return null;
  }

  async function openInspectorForTriage() {
    const t = state.pendingTriage;
    if (!t) return;

    const files = t.files || [];
    const preferredName = t.data?.fileName || t.data?.pendingFileName || null;
    const preview = pickPreviewFile(files, preferredName);

    try {
      if (t.data?.previewUrl) {
        await openInspectorWithAuthenticatedUrl(t.data.previewUrl);
        return;
      }

      const sessionId = t.data?.uploadSessionId || state.lastUploadSessionId;
      if (sessionId && preferredName) {
        await openInspectorWithAuthenticatedUrl(
          '/api/statements/batch/triage/' +
            encodeURIComponent(sessionId) +
            '/file/' +
            encodeURIComponent(preferredName)
        );
        return;
      }
    } catch (err) {
      console.warn('[UploadHub] Authenticated PDF preview failed:', err);
    }

    if (state.lastResultId) {
      const serverUrl = await resolveServerPdfUrl(state.lastResultId);
      if (serverUrl) {
        openInspectorWithUrl(serverUrl);
        return;
      }
    }

    if (preview) {
      openInspectorWithFile(preview);
      return;
    }

    appendSystemBubble('Could not load PDF preview.', 'is-error');
  }

  function buildTriageBubble(data) {
    const wrap = document.createElement('div');
    const fileLabel = data?.fileName
      ? '<br><span style="font-size:0.9em">File: <strong>' + escapeHtml(data.fileName) + '</strong></span>'
      : '';
    const bankLabel = data?.detectedBankName
      ? '<br><span style="font-size:0.9em">Detected bank: <strong>' + escapeHtml(data.detectedBankName) + '</strong></span>'
      : '';
    const msg = data?.message
      ? '<p style="margin:0 0 6px;">' + escapeHtml(data.message) + '</p>'
      : '<p style="margin:0 0 6px;"><strong>System clarification required:</strong> Is this a valid bank statement?</p>';
    wrap.innerHTML =
      msg + fileLabel + bankLabel +
      '<div class="triage-actions">' +
      '<button type="button" class="btn-primary" data-action="yes">Yes, Confirm</button>' +
      '<button type="button" data-action="no">No, Skip</button>' +
      '<button type="button" data-action="view">View Document</button>' +
      '</div>';
    wrap.querySelector('[data-action="yes"]').addEventListener('click', onTriageYes);
    wrap.querySelector('[data-action="no"]').addEventListener('click', onTriageNo);
    wrap.querySelector('[data-action="view"]').addEventListener('click', onTriageView);
    return wrap;
  }

  function showTriageBubble(data, files) {
    if (data?.uploadSessionId) {
      state.lastUploadSessionId = data.uploadSessionId;
    }
    state.pendingTriage = { data, files: files || [], statementId: data.statementId || null };
    const bubble = appendSystemBubble('', 'is-warning');
    bubble.appendChild(buildTriageBubble(data));
    void openInspectorForTriage();
  }

  function clearTriage() {
    state.pendingTriage = null;
  }

  async function onTriageView() {
    await openInspectorForTriage();
  }

  function onTriageNo() {
    closeInspector();
    appendSystemBubble('Skipped by user.', '');
    clearTriage();
    setBusy(false);
    setPrimaryAction(state.lastUploadSessionId ? 'runAnalysis' : 'upload');
  }

  async function onTriageYes() {
    const t = state.pendingTriage;
    if (!t) return;
    const data = t.data || {};
    const files = t.files.length ? t.files : state.stagedFiles;

    if (data.requiresBankConfirmation || data.status === 'requires_bank_confirmation') {
      const name =
        data.detectedBankName ||
        (Array.isArray(data.bankNameCandidates) && data.bankNameCandidates[0]) ||
        'Unknown Bank';
      const fileName = data.fileName || data.pendingFileName || files[0]?.name;
      const sessionId = state.lastUploadSessionId || t.data?.uploadSessionId || null;
      if (!sessionId || !fileName) {
        appendSystemBubble('Missing session or file name for bank confirmation.', 'is-error');
        return;
      }
      closeInspector();
      appendSystemBubble('Confirming bank <strong>' + escapeHtml(name) + '</strong> and resuming…', '');
      setBusy(true);
      setPrimaryAction('running');
      try {
        const res = await apiFetch(confirmBankEndpoint(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            uploadSessionId: sessionId,
            fileName,
            confirmedBankName: name
          })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.jobId) {
          appendSystemBubble(
            escapeHtml(json.error || json.message || 'Failed to confirm bank (' + res.status + ')'),
            'is-error'
          );
          setBusy(false);
          setPrimaryAction('runAnalysis');
          return;
        }
        await pollMacroBatchJob(json.jobId, {
          correlationId: json.correlationId || json.jobId,
          options: { skipUserBubble: true, redirectOnSuccess: true },
          files
        });
      } catch (err) {
        appendSystemBubble('Network error: ' + escapeHtml(err.message || 'Confirm failed'), 'is-error');
        setBusy(false);
        setPrimaryAction('runAnalysis');
      }
      return;
    }

    closeInspector();
    appendSystemBubble('Confirmed.', 'is-success');
    clearTriage();
    setBusy(false);
    setPrimaryAction(state.lastUploadSessionId ? 'runAnalysis' : 'upload');
  }

  function setBusy(busy) {
    state.uploading = busy;
    els.dropZone.classList.toggle('is-busy', busy);
    if (!busy) {
      setHubProgress(false);
      if (state.primaryActionMode === 'classifying' || state.primaryActionMode === 'running') {
        /* mode set by caller on completion */
      } else {
        setPrimaryAction(state.lastUploadSessionId ? 'runAnalysis' : 'upload');
      }
    }
  }

  function resetStagingState() {
    state.lastUploadSessionId = null;
    state.triageGeneration += 1;
    setDropZoneCompact(false);
    setPrimaryAction('upload');
  }

  function renderStagedFiles() {
    if (!els.stagedList) return;
    if (!state.stagedFiles.length) {
      els.stagedList.innerHTML = '';
      resetStagingState();
      return;
    }
    els.stagedList.innerHTML = state.stagedFiles
      .map(
        (f, i) =>
          '<li><span>' +
          escapeHtml(f.name) +
          '</span><button type="button" data-remove="' +
          i +
          '" aria-label="Remove">×</button></li>'
      )
      .join('');
    els.stagedList.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.stagedFiles.splice(Number(btn.getAttribute('data-remove')), 1);
        state.lastUploadSessionId = null;
        renderStagedFiles();
        if (state.stagedFiles.length) {
          setDropZoneCompact(true);
          scheduleAutoTriage();
        }
      });
    });
    updateCompactFileCount();
  }

  function scheduleAutoTriage() {
    if (state.triageDebounceTimer) clearTimeout(state.triageDebounceTimer);
    state.triageDebounceTimer = setTimeout(() => {
      state.triageDebounceTimer = null;
      if (state.stagedFiles.length && hasValidJwt() && !state.uploading) {
        void runTriage({ silent: true });
      }
    }, AUTO_TRIAGE_DEBOUNCE_MS);
  }

  function stageFiles(fileList) {
    const incoming = Array.from(fileList || []).filter(
      (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
    );
    if (!incoming.length) {
      appendSystemBubble('Please select at least one PDF.', 'is-warning');
      return;
    }

    const hadFiles = state.stagedFiles.length > 0;
    let addedNew = false;
    for (const f of incoming) {
      if (!state.stagedFiles.some((s) => s.name === f.name && s.size === f.size)) {
        state.stagedFiles.push(f);
        addedNew = true;
      }
    }
    if (!addedNew) return;

    setDropZoneCompact(true);
    renderStagedFiles();

    if (!hadFiles) {
      appendUserBatchBubble(incoming.length === 1 ? [incoming[0]] : state.stagedFiles.slice(-incoming.length));
    } else {
      appendSystemBubble(
        'Added ' + incoming.length + ' file(s). Re-classifying batch…',
        ''
      );
    }

    state.lastUploadSessionId = null;

    if (hasValidJwt()) {
      scheduleAutoTriage();
    } else {
      appendSystemBubble('Sign in to classify and analyze files.', 'is-warning');
      setPrimaryAction('upload');
    }
  }

  function buildFormData(files, options = {}) {
    const dealId = els.dealId ? els.dealId.value.trim() : '';
    const businessName = els.businessName ? els.businessName.value.trim() : '';
    const statedRevenue = els.statedRevenue ? els.statedRevenue.value.trim() : '';

    const fd = new FormData();
    if (dealId) fd.append('dealId', dealId);
    if (businessName) fd.append('businessName', businessName);
    if (statedRevenue) fd.append('statedRevenue', statedRevenue.replace(/[^0-9.]/g, ''));
    if (options.uploadSessionId) {
      fd.append('uploadSessionId', options.uploadSessionId);
    } else {
      files.forEach((file) => fd.append('statements', file, file.name));
    }
    fd.append(
      'applicationData',
      JSON.stringify({ companyName: businessName || '', taxId: '', businessAddress: '' })
    );
    if (options.confirmedBankName) fd.append('confirmedBankName', options.confirmedBankName);
    if (options.confirmedBankFileName) fd.append('confirmedBankFileName', options.confirmedBankFileName);
    return fd;
  }

  function formatUsd(value) {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function buildTriageSummaryHtml(json) {
    const t = json.triage || {};
    const apps = (t.applications || []).map((a) => escapeHtml(a.name || a)).join(', ');
    const stmts = (t.statements || []).map((s) => escapeHtml(s.name || s)).join(', ');
    const skipped = (t.skipped || [])
      .map((s) => escapeHtml(s.name) + ' — ' + escapeHtml(s.reason || 'skipped'))
      .join('<br>');

    let html = '<strong>Classification complete</strong><br>';
    if (stmts) html += 'Statements: ' + stmts + '<br>';
    if (apps) html += 'Applications: ' + apps + '<br>';
    if (skipped) html += 'Skipped:<br>' + skipped;

    const anchor = json.extractedAnchorData;
    if (anchor) {
      const parts = [];
      if (anchor.companyName) parts.push(escapeHtml(anchor.companyName));
      const loan = formatUsd(anchor.requestedLoanAmount);
      if (loan) parts.push('Requested: <strong>' + loan + '</strong>');
      const rev = formatUsd(anchor.annualRevenue);
      if (rev) parts.push('Revenue: <strong>' + rev + '</strong>');
      if (parts.length) html += '<br>' + parts.join(' · ');
    }
    return html;
  }

  async function runTriage(options = {}) {
    const files = state.stagedFiles;
    if (!hasValidJwt()) {
      if (!options.silent) {
        appendSystemBubble('Authentication required. <a href="./login.html">Sign in</a>.', 'is-error');
      }
      return;
    }
    if (!files.length) return;
    if (state.uploading) return;

    const generation = ++state.triageGeneration;
    state.lastUploadSessionId = null;
    setBusy(true);
    setPrimaryAction('classifying');

    if (!options.silent) {
      appendSystemBubble('Classifying files…', '');
    }

    let res;
    try {
      res = await apiFetch(triageEndpoint(), {
        method: 'POST',
        body: buildFormData(files)
      });
    } catch (err) {
      if (generation === state.triageGeneration) {
        appendSystemBubble('Network error: ' + escapeHtml(err.message || 'Classification failed'), 'is-error');
        setBusy(false);
        setPrimaryAction('upload');
      }
      return;
    }

    if (generation !== state.triageGeneration) return;

    const json = await res.json().catch(() => ({}));
    if (res.status === 403 && json.error === 'PUBLIC_UPLOAD_DISABLED') {
      appendSystemBubble(
        'Public upload disabled on server. Set DEMO_MODE=true and ENABLE_PUBLIC_UPLOAD=true in API .env.',
        'is-error'
      );
      setBusy(false);
      setPrimaryAction('upload');
      return;
    }
    if (res.status === 401 || res.status === 403) {
      appendSystemBubble('Authentication failed.', 'is-error');
      setBusy(false);
      setPrimaryAction('upload');
      return;
    }
    if (!res.ok || json.success === false) {
      appendSystemBubble(escapeHtml(json.error || json.message || 'Classification failed'), 'is-error');
      setBusy(false);
      setPrimaryAction('upload');
      return;
    }

    if (!json.uploadSessionId) {
      appendSystemBubble(
        'Classification succeeded but no session id was returned. Try uploading again.',
        'is-error'
      );
      setBusy(false);
      setPrimaryAction('upload');
      return;
    }

    // Triage hold: session id only — never redirect from triage.
    state.lastUploadSessionId = json.uploadSessionId;
    appendSystemBubble(buildTriageSummaryHtml(json), 'is-deal-context');
    appendSystemBubble(
      '<strong>Staging complete.</strong> Review extracted data above, then click <strong>Run Analysis</strong> (macro may take several minutes).',
      'is-success'
    );
    setBusy(false);
    setPrimaryAction('runAnalysis');
  }

  async function runFullAnalysis() {
    console.log('Run Analysis button clicked. Preparing payload...');
    if (!hasValidJwt()) {
      console.error('[UploadHub] Batch execution aborted: authentication required (missing or invalid JWT)');
      appendSystemBubble('Authentication required. <a href="./login.html">Sign in</a>.', 'is-error');
      return;
    }
    if (!state.lastUploadSessionId) {
      console.error('[UploadHub] Batch execution aborted: uploadSessionId is missing');
      appendSystemBubble('Waiting for file classification to finish…', 'is-warning');
      return;
    }

    await submitFullBatch([], {
      uploadSessionId: state.lastUploadSessionId,
      skipUserBubble: true,
      redirectOnSuccess: true
    });
  }

  function extractStatementId(json) {
    return json?.data?.id || json?.data?._id || json?.statementId || null;
  }

  /** Golden path step 5: redirect only on 201 + persisted statement id. */
  function redirectToResultsAfter201(res, json) {
    if (res.status !== 201) return false;
    const id = extractStatementId(json);
    if (!id) return false;
    window.location.href = resultsDashboardUrl(id);
    return true;
  }

  /** Poll async macro job until completed/failed, then hand off like HTTP 201. */
  async function pollMacroBatchJob(jobId, { correlationId, options = {}, files = [] }) {
    stopMacroJobPoll();
    appendSystemBubble(
      'Macro analysis queued — this may take several minutes. Waiting for completion…',
      'is-warning'
    );
    if (correlationId) {
      startProgressPoll(correlationId);
    }

    const MACRO_POLL_MAX_MS = 30 * 60 * 1000;
    const pollStartedAt = Date.now();
    let macroPollInterval = 5000;

    const finalizeUi = (busy) => {
      stopAllPolls();
      state.uploading = busy;
      els.dropZone.classList.toggle('is-busy', busy);
      if (!busy) setPrimaryAction('runAnalysis');
    };

    const handleCompleted = (resultJson) => {
      const id = extractStatementId(resultJson);
      if (id) state.lastResultId = id;
      try {
        sessionStorage.setItem('macroResult', JSON.stringify(resultJson));
      } catch {
        /* ignore */
      }
      if (options.redirectOnSuccess && id) {
        window.location.href = resultsDashboardUrl(id);
        return;
      }
      const link = id
        ? '<a href="' +
          escapeHtml(resultsDashboardUrl(id)) +
          '">Results dashboard</a>'
        : '';
      appendSystemBubble('Macro analysis complete. ' + link, 'is-success');
      clearTriage();
      finalizeUi(false);
    };

    const handleCompletedWithWarnings = (resultJson, diagnosticSummaries) => {
      const id = extractStatementId(resultJson);
      if (id) state.lastResultId = id;
      const summaries = Array.isArray(diagnosticSummaries) ? diagnosticSummaries : [];
      console.warn('[UploadHub] Macro completed with warnings — diagnostic summaries:', summaries);
      try {
        sessionStorage.setItem('macroResult', JSON.stringify(resultJson));
        sessionStorage.setItem('macroDiagnosticSummaries', JSON.stringify(summaries));
      } catch {
        /* ignore */
      }
      if (options.redirectOnSuccess && id) {
        window.location.href = resultsDashboardUrl(id, { warnings: true });
        return;
      }
      const link = id
        ? '<a href="' +
          escapeHtml(resultsDashboardUrl(id, { warnings: true })) +
          '">Review flagged statements</a>'
        : '';
      appendSystemBubble(
        'Macro analysis completed with warnings — some statements need human review. ' + link,
        'is-warning'
      );
      clearTriage();
      finalizeUi(false);
    };

    const pollOnce = async () => {
      if (Date.now() - pollStartedAt > MACRO_POLL_MAX_MS) {
        appendSystemBubble('Macro analysis timed out after 30 minutes.', 'is-error');
        finalizeUi(false);
        return;
      }

      try {
        const res = await apiFetch(batchJobEndpoint(jobId));
        const payload = await res.json().catch(() => ({}));

        if (res.status === 401 || res.status === 403) {
          // apiFetch dispatches helios-auth-expired; init onAuthExpired shows session-expired UX.
          finalizeUi(false);
          return;
        }

        if (res.status === 404) {
          appendSystemBubble(
            'Job not found — the worker may not be running or the job expired. Start <code>npm run dev:all</code> and retry.',
            'is-error'
          );
          finalizeUi(false);
          return;
        }

        if (!res.ok) return;

        if (payload.status === 'requires_bank_confirmation') {
          stopAllPolls();
          showTriageBubble(
            {
              requiresBankConfirmation: true,
              uploadSessionId: payload.uploadSessionId || state.lastUploadSessionId,
              fileName: payload.fileName,
              detectedBankName: payload.detectedBankName,
              previewUrl: payload.previewUrl,
              bankNameCandidates: payload.bankNameCandidates,
              message: payload.message
            },
            files
          );
          state.uploading = false;
          els.dropZone.classList.remove('is-busy');
          setPrimaryAction('runAnalysis');
          return;
        }

        if (
          payload.status === 'COMPLETED_WITH_WARNINGS' ||
          payload.result?.businessStatus === 'COMPLETED_WITH_WARNINGS'
        ) {
          stopAllPolls();
          if (payload.result) {
            handleCompletedWithWarnings(
              payload.result,
              payload.diagnosticSummaries || payload.result.diagnosticSummaries
            );
          } else {
            appendSystemBubble(
              'Macro analysis completed with warnings but no result payload.',
              'is-warning'
            );
            finalizeUi(false);
          }
          return;
        }

        if (payload.status === 'completed') {
          stopMacroJobPoll();
          if (payload.result) {
            handleCompleted(payload.result);
          } else {
            appendSystemBubble(
              'Macro analysis completed without a result payload.',
              'is-error'
            );
            finalizeUi(false);
          }
          return;
        }

        if (payload.status === 'failed') {
          stopMacroJobPoll();
          appendSystemBubble(
            escapeHtml(payload.error || 'Macro analysis failed in background.'),
            'is-error'
          );
          finalizeUi(false);
        }
      } catch (err) {
        console.warn('[UploadHub] Macro job poll error:', err);
      }
    };

    const scheduleMacroPoll = () => {
      state.macroJobPollTimer = setTimeout(async () => {
        if (!state.macroJobPollTimer) return;
        await pollOnce();
        if (state.macroJobPollTimer) {
          macroPollInterval = Math.min(macroPollInterval + 2000, 20000);
          scheduleMacroPoll();
        }
      }, macroPollInterval);
    };
    await pollOnce();
    scheduleMacroPoll();
  }

  async function submitFullBatch(files, options = {}) {
    console.log('[UploadHub] submitFullBatch', {
      uploadSessionId: options.uploadSessionId || null,
      fileCount: files.length
    });
    if (!hasValidJwt()) {
      console.error('[UploadHub] submitFullBatch aborted: authentication required');
      appendSystemBubble('Authentication required.', 'is-error');
      return;
    }

    state.uploading = true;
    els.dropZone.classList.add('is-busy');
    setPrimaryAction('running');
    if (!options.skipUserBubble) appendUserBatchBubble(files);
    appendSystemBubble('Running full macro analysis…', '');

    const correlationId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'batch-' + Date.now();

    let res;
    try {
      const body = options.uploadSessionId
        ? buildFormData([], options)
        : buildFormData(files, options);
      res = await apiFetch(batchEndpoint(), {
        method: 'POST',
        body,
        headers: { 'X-Correlation-Id': correlationId }
      });
    } catch (err) {
      stopProgressPoll();
      appendSystemBubble('Network error: ' + escapeHtml(err.message || 'Batch failed'), 'is-error');
      state.uploading = false;
      els.dropZone.classList.remove('is-busy');
      setPrimaryAction('runAnalysis');
      return;
    }

    const json = await res.json().catch(() => ({}));

    if (res.status === 202) {
      const asyncCorrelationId = json.correlationId || correlationId;
      if (json.jobId) {
        await pollMacroBatchJob(json.jobId, { correlationId: asyncCorrelationId, options, files });
        return;
      }
      appendSystemBubble(escapeHtml(json.message || json.error || 'Batch accepted (202) without job id.'), 'is-warning');
      state.uploading = false;
      els.dropZone.classList.remove('is-busy');
      setPrimaryAction('runAnalysis');
      return;
    }

    const id = extractStatementId(json);

    if (res.status === 201 && id) {
      state.lastResultId = id;
      try {
        sessionStorage.setItem('macroResult', JSON.stringify(json));
      } catch {
        /* ignore */
      }

      if (options.redirectOnSuccess) {
        if (redirectToResultsAfter201(res, json)) return;
      }

      const recoveryNote =
        json.checksumRecovery?.attempted && json.checksumRecovery?.succeeded
          ? '<p style="margin:0 0 6px;font-size:0.9em;">Recovered statement alignment after checksum rescue.</p>'
          : '';
      const link =
        '<a href="./helios-report.html?id=' +
        encodeURIComponent(id) +
        '">Open Forensic Report</a> · <a href="' +
        escapeHtml(resultsDashboardUrl(id)) +
        '">Results dashboard</a>';
      appendSystemBubble(recoveryNote + 'Macro analysis complete. ' + link, 'is-success');
      clearTriage();
      state.uploading = false;
      els.dropZone.classList.remove('is-busy');
      setPrimaryAction('runAnalysis');
      return;
    }

    const statusHint =
      options.redirectOnSuccess && res.status !== 201
        ? ' Analysis must return HTTP 201 with a statement id before opening Results.'
        : '';
    console.warn('[UploadHub] Batch did not meet golden-path handoff', {
      status: res.status,
      statementId: id,
      redirectOnSuccess: !!options.redirectOnSuccess
    });
    if (res.status === 422 && json.error === 'CHECKSUM_GATE_FAILED') {
      appendSystemBubble(buildChecksumGateFailedBubble(json), 'is-warning bubble--recovery');
    } else {
      appendSystemBubble(
        escapeHtml(json.error || json.message || 'Batch failed (' + res.status + ').' + statusHint),
        'is-error'
      );
    }
    state.uploading = false;
    els.dropZone.classList.remove('is-busy');
    setHubProgress(false);
    setPrimaryAction('runAnalysis');
  }

  async function requestLogin(e) {
    e.preventDefault();
    const email = els.loginEmail.value.trim();
    const password = els.loginPassword.value;
    if (!email || !password) {
      els.authStatus.textContent = 'Email and password required.';
      return;
    }
    els.loginBtn.disabled = true;
    els.authStatus.textContent = 'Authenticating…';
    try {
      await HeliosAuth.login(email, password, apiBaseUrl());
      els.authStatus.textContent = 'Signed in.';
    } catch (err) {
      els.authStatus.textContent = err.message || 'Login failed.';
    } finally {
      els.loginBtn.disabled = false;
    }
    updateAuthStatus();
  }

  function onPrimaryActionClick(e) {
    e.stopPropagation();
    console.log('[UploadHub] Primary action click', {
      mode: state.primaryActionMode,
      uploadSessionId: state.lastUploadSessionId,
      uploading: state.uploading
    });
    if (state.primaryActionMode === 'classifying' || state.primaryActionMode === 'running') {
      console.error('[UploadHub] Click ignored — analysis in progress');
      return;
    }
    if (state.primaryActionMode === 'runAnalysis') {
      void runFullAnalysis();
    } else if (state.primaryActionMode === 'upload') {
      els.fileInput.click();
    } else {
      console.error('[UploadHub] Click ignored — unknown primary action mode:', state.primaryActionMode);
    }
  }

  function bindDropZone() {
    els.dropZone.addEventListener('click', (e) => {
      if (
        e.target.closest('#primary-action-btn') ||
        e.target.closest('.staged-files')
      ) {
        return;
      }
      els.fileInput.click();
    });
    els.dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        els.fileInput.click();
      }
    });
    els.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      els.dropZone.classList.add('is-dragover');
    });
    els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('is-dragover'));
    els.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      els.dropZone.classList.remove('is-dragover');
      stageFiles(e.dataTransfer.files);
    });
    els.fileInput.addEventListener('change', () => {
      stageFiles(els.fileInput.files);
      els.fileInput.value = '';
    });
    if (els.primaryActionBtn) {
      els.primaryActionBtn.addEventListener('click', onPrimaryActionClick);
    }
  }

  async function init() {
    els.chatHistory = document.getElementById('chat-history');
    els.dropZone = document.getElementById('drop-zone');
    els.dropZoneCompact = document.querySelector('.drop-zone-compact');
    els.compactFileCount = document.getElementById('compact-file-count');
    els.fileInput = document.getElementById('file-input');
    els.authPanel = document.getElementById('auth-panel');
    els.loginEmail = document.getElementById('login-email');
    els.loginPassword = document.getElementById('login-password');
    els.loginBtn = document.getElementById('login-btn');
    els.loginForm = document.getElementById('login-form');
    els.authStatus = document.getElementById('auth-status');
    els.dealId = document.getElementById('deal-id');
    els.businessName = document.getElementById('business-name');
    els.statedRevenue = document.getElementById('stated-revenue');
    els.pdfFrame = document.getElementById('pdf-frame');
    els.pdfEmpty = document.getElementById('pdf-empty');
    els.inspectorClose = document.getElementById('inspector-close');
    els.stagedList = document.getElementById('staged-files-list');
    els.primaryActionBtn = document.getElementById('primary-action-btn');
    els.hubProgress = document.getElementById('hub-progress');

    bindDropZone();
    els.loginForm.addEventListener('submit', requestLogin);
    els.inspectorClose.addEventListener('click', closeInspector);

    document.getElementById('sign-out-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      HeliosAuth.logout();
    });

    HeliosAuth.setBaseUrl(apiBaseUrl());
    HeliosAuth.onAuthExpired?.(() => {
      appendSystemBubble(
        'Your session expired during analysis. <a href="./login.html">Sign in again</a> and retry Run Analysis.',
        'is-error'
      );
      resetUiAfterSessionExpired();
    });
    if (!HeliosAuth.isValidJwt(getToken())) {
      if (!HeliosAuth.requireAuth('./manual-upload.html')) return;
    }
    updateAuthStatus();
    renderStagedFiles();
    setPrimaryAction('upload');

    appendSystemBubble(
      'Drop or upload PDFs — files are classified automatically. Then click <strong>Run Analysis</strong>.',
      ''
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init());
  } else {
    void init();
  }
})();
