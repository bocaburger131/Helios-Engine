const fs = require('fs');

const resultsHtml = fs.readFileSync('public/manual-results.html', 'utf8');
const uploadHtml = fs.readFileSync('public/manual-upload.html', 'utf8');

// Extract everything from <!DOCTYPE html> to </style>
const styleMatch = resultsHtml.match(/<!DOCTYPE html>[\s\S]*?<\/style>/);
const newHeadAndStyles = styleMatch[0];

// In manual-upload, find where <body> starts
const bodyStart = uploadHtml.indexOf('<body>');

// In manual-results, find the top nav:
const navMatch = resultsHtml.match(/<nav class="top-nav">[\s\S]*?<\/nav>/);
const newNav = navMatch[0];

const buildNewUploadHtml = () => {
    return `${newHeadAndStyles}
<body>
  ${newNav}
  <main class="dashboard" style="max-width: 1240px; margin: 32px auto; padding: 0 24px;">
    <header style="margin-bottom: 32px;">
      <div>
        <h1 style="margin: 0 0 8px; font-size: 2rem; color: #0f172a; font-weight: 700; letter-spacing: -0.02em;">Manual Statement Upload</h1>
        <p style="margin: 0; color: var(--muted); font-size: 1.05rem;">Process PDF bank statements using the Helios Engine. Generates comprehensive macro and micro analyses.</p>
      </div>
    </header>

    <div style="display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 24px; align-items: start;">
      
      <!-- Left Column: Auth & Config -->
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <article class="card">
          <h2>Authenticate</h2>
          <p style="margin-top: 0; color: var(--muted); font-size: 0.92rem;">Log in with your admin credentials to generate a bearer token. Required for analysis.</p>
          <form class="login-form" id="login-form">
            <input type="email" id="login-email" placeholder="Email" autocomplete="username" style="width: 100%; margin-bottom: 12px; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border);" />
            <input type="password" id="login-password" placeholder="Password" autocomplete="current-password" style="width: 100%; margin-bottom: 12px; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border);" />
            <button type="submit" style="width: 100%; padding: 10px; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">Request Token</button>
          </form>
          <p class="login-status" id="login-status" style="margin-top: 12px; font-size: 0.85rem; color: var(--muted);">Token not requested yet.</p>
          
          <label style="display: block; margin-top: 16px; font-weight: 600; font-size: 0.9rem;">
            Access Token
            <textarea id="token" rows="4" placeholder="Token will appear here or paste manually..." style="width: 100%; margin-top: 6px; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-soft); color: var(--text); font-family: monospace; font-size: 0.85rem;"></textarea>
          </label>
        </article>

        <article class="card">
          <h2>Upload Configuration</h2>
          <label style="display: block; margin-bottom: 16px; font-weight: 600; font-size: 0.9rem;">
            API Base URL
            <input type="text" id="base-url" style="width: 100%; margin-top: 6px; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-soft); color: var(--text);" />
          </label>

          <label style="display: block; margin-bottom: 16px; font-weight: 600; font-size: 0.9rem;">
            Deal ID (Optional)
            <input type="text" id="deal-id" placeholder="e.g. DEAL-12345" style="width: 100%; margin-top: 6px; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border);" />
          </label>

          <label style="display: block; font-weight: 600; font-size: 0.9rem;">
            Select PDF Statements
            <input type="file" id="file-input" multiple accept="application/pdf" style="width: 100%; margin-top: 6px; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: #f8fafc;" />
          </label>
          <p style="font-size: 0.8rem; color: var(--muted); margin-top: 4px;">Hold Ctrl/Cmd to select multiple files.</p>
        </article>
      </div>

      <!-- Right Column: Console & Action -->
      <div style="display: flex; flex-direction: column; gap: 24px; min-height: 500px;">
        <article class="card" style="flex: 1; display: flex; flex-direction: column;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <h2 style="margin: 0;">Execution Console</h2>
            <span id="console-state" style="padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; background: #e2e8f0; color: #64748b;">Awaiting Input</span>
          </div>
          
          <div id="log-output" style="flex: 1; min-height: 400px; background: #0f172a; color: #10b981; padding: 16px; border-radius: 8px; font-family: 'Fira Code', monospace; font-size: 0.85rem; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; max-height: 500px;">
            <!-- Logs appear here -->
          </div>

          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end;">
            <button id="run-btn" style="padding: 12px 24px; font-size: 1rem; font-weight: 600; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.2s;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              Run Analysis Pipeline
            </button>
          </div>
        </article>
      </div>
      
    </div>
  </main>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const state = {
        baseUrl: (localStorage.getItem('bsaDashboardBaseUrl') || window.location.origin).replace(/\\/$/, ''),
        token: localStorage.getItem('bsaDashboardToken') || '',
        uploadInProgress: false
      };

      const elements = {
        baseUrl: document.getElementById('base-url'),
        loginForm: document.getElementById('login-form'),
        loginEmail: document.getElementById('login-email'),
        loginPassword: document.getElementById('login-password'),
        token: document.getElementById('token'),
        loginStatus: document.getElementById('login-status'),
        fileInput: document.getElementById('file-input'),
        dealId: document.getElementById('deal-id'),
        runButton: document.getElementById('run-btn'),
        consoleState: document.getElementById('console-state'),
        logOutput: document.getElementById('log-output')
      };

      elements.baseUrl.value = state.baseUrl;

      const appendLog = (message, type = 'info') => {
        const line = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString([], { hour12: false });
        
        let color = '#94a3b8'; // default greyish
        if (type === 'system') color = '#3b82f6';
        if (type === 'success') color = '#22c55e';
        if (type === 'warning') color = '#eab308';
        if (type === 'error') color = '#ef4444';
        
        line.innerHTML = \`<span style="color: #64748b; margin-right: 8px;">[\${timestamp}]</span> <span style="color: \${color};">\${message}</span>\`;
        elements.logOutput.appendChild(line);
        elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
      };

      const setLoginStatus = (msg, colorStr) => {
        elements.loginStatus.textContent = msg;
        elements.loginStatus.style.color = colorStr;
      };

      const setConsoleState = (label, type) => {
        elements.consoleState.textContent = label;
        if (type === 'idle') {
          elements.consoleState.style.background = '#e2e8f0';
          elements.consoleState.style.color = '#64748b';
        } else if (type === 'ready') {
          elements.consoleState.style.background = '#dcfce7';
          elements.consoleState.style.color = '#16a34a';
        } else if (type === 'working') {
          elements.consoleState.style.background = '#dbeafe';
          elements.consoleState.style.color = '#2563eb';
        } else if (type === 'error') {
          elements.consoleState.style.background = '#fee2e2';
          elements.consoleState.style.color = '#dc2626';
        }
      };

      const persistBaseUrl = (url) => {
        state.baseUrl = url.replace(/\\/$/, '');
        localStorage.setItem('bsaDashboardBaseUrl', state.baseUrl);
      };

      const persistToken = (tokenValue) => {
        state.token = tokenValue || '';
        elements.token.value = state.token;
        if (state.token) {
          localStorage.setItem('bsaDashboardToken', state.token);
        } else {
          localStorage.removeItem('bsaDashboardToken');
        }
      };

      const requestToken = async (e) => {
        e.preventDefault();
        const email = elements.loginEmail.value.trim();
        const password = elements.loginPassword.value;
        const submitBtn = elements.loginForm.querySelector('button');

        if (!email || !password) {
          setLoginStatus('Email and password required', 'var(--warning)');
          appendLog('Authentication skipped: missing email or password.', 'warning');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Authenticating...';
        setLoginStatus('Authenticating...', 'var(--text)');
        appendLog(\`Requesting token from \${state.baseUrl}/api/auth/login\`, 'info');

        try {
          const response = await fetch(\`\${state.baseUrl}/api/auth/login\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });

          const data = await response.json().catch(() => ({}));
          const tokenStr = data.data?.token || data.token;

          if (!response.ok || !tokenStr) {
            throw new Error(data?.error || data?.message || \`Login failed (\${response.status})\`);
          }

          persistToken(tokenStr);
          setLoginStatus('Authenticated. Token cached.', 'var(--success)');
          setConsoleState('Authenticated', 'ready');
          appendLog('Authentication successful. Bearer token is ready.', 'success');
        } catch (error) {
          setLoginStatus(error.message || 'Authentication failed.', 'var(--danger)');
          setConsoleState('Auth Error', 'error');
          appendLog(\`Authentication failed: \${error.message || 'Unknown error'}\`, 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Request Token';
        }
      };

      const setRunButtonBusy = (isBusy) => {
        if (isBusy) {
          elements.runButton.disabled = true;
          elements.runButton.style.opacity = '0.7';
          elements.runButton.innerHTML = \`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg> Processing...\`;
        } else {
          elements.runButton.disabled = false;
          elements.runButton.style.opacity = '1';
          elements.runButton.innerHTML = \`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Run Analysis Pipeline\`;
        }
      };

      const runAnalysis = async () => {
        if (state.uploadInProgress) {
          appendLog('Analysis already in progress, please wait...', 'warning');
          return;
        }

        const files = Array.from(elements.fileInput.files || []);
        const dealId = elements.dealId.value.trim();
        const authToken = localStorage.getItem('bsaDashboardToken') || elements.token.value.trim() || state.token;

        if (!files.length) {
          appendLog('No PDF files selected. Choose at least one statement first.', 'warning');
          return;
        }

        if (!authToken) {
          appendLog('Authentication Error: No token found. Please log in first.', 'error');
          setLoginStatus('No token found. Please authenticate.', 'var(--warning)');
          setConsoleState('Auth Required', 'error');
          return;
        }

        if (authToken !== state.token) {
          persistToken(authToken);
        }

        state.uploadInProgress = true;
        setRunButtonBusy(true);
        setConsoleState('Processing', 'working');

        appendLog(\`Preparing \${files.length} file(s) for macro analysis...\`, 'info');
        files.forEach((file) => {
          appendLog(\`Queued file: \${file.name} (\${(file.size / 1024).toFixed(1)} KB)\`, 'system');
        });

        const formData = new FormData();
        if (dealId) {
          formData.append('dealId', dealId);
        }
        files.forEach((file) => formData.append('statements', file, file.name));

        try {
          const response = await fetch(\`\${state.baseUrl}/api/statements/batch\`, {
            method: 'POST',
            headers: {
              Authorization: \`Bearer \${authToken}\`
            },
            body: formData
          });

          if (response.status === 401 || response.status === 403) {
            appendLog('Authentication failed: token is invalid or expired. Please generate a new token.', 'error');
            setLoginStatus('Token expired or invalid — re-authenticate.', 'var(--warning)');
            setConsoleState('Auth Required', 'error');
            return;
          }

          const result = await response.json().catch(() => ({}));

          if (!response.ok || !result?.success) {
            throw new Error(result?.error || result?.message || \`Batch upload failed (\${response.status})\`);
          }

          const summary = result?.data?.summary || {};
          const alertSummary = summary?.alertSummary || {};
          const risk = result?.data?.overallRisk || {};

          appendLog('Batch analysis completed successfully.', 'success');
          appendLog(\`Statements parsed: \${summary.parsedSuccessfully || summary.totalFiles || files.length}\`, 'system');
          appendLog(\`Transactions: \${summary.totalTransactions || 'N/A'} | Alerts: \${summary.totalAlerts || 0}\`, 'system');
          appendLog(\`Alert breakdown C:\${alertSummary.critical || 0} H:\${alertSummary.high || 0} M:\${alertSummary.medium || 0} L:\${alertSummary.low || 0}\`, 'system');
          appendLog(\`Average risk score: \${risk.averageRiskScore ?? 'N/A'} | Veritas: \${risk.averageVeritasScore ?? 'N/A'}\`, 'system');
          appendLog('Redirecting to manual results dashboard in 3 seconds...', 'info');

          setTimeout(() => {
            window.location.href = './manual-results.html';
          }, 3000);

        } catch (error) {
          appendLog(\`Error during macro analysis: \${error.message}\`, 'error');
          setConsoleState('Failed', 'error');
        } finally {
          state.uploadInProgress = false;
          setRunButtonBusy(false);
          if (elements.consoleState.textContent !== 'Failed' && elements.consoleState.textContent !== 'Auth Required') {
             setConsoleState('Complete', 'ready');
          }
        }
      };

      // Events
      elements.loginForm.addEventListener('submit', requestToken);
      elements.runButton.addEventListener('click', runAnalysis);

      elements.fileInput.addEventListener('change', () => {
        const count = elements.fileInput.files.length;
        if (count > 0) {
          appendLog(\`\${count} file(s) selected and ready for processing.\`, 'info');
        }
      });

      elements.baseUrl.addEventListener('change', () => {
        persistBaseUrl(elements.baseUrl.value.trim());
        appendLog(\`API base URL set to \${state.baseUrl}\`, 'info');
      });

      elements.token.addEventListener('change', () => {
        const token = elements.token.value.trim();
        persistToken(token);
        if (token) {
          setLoginStatus('Token updated manually.', 'var(--success)');
          setConsoleState('Authenticated', 'ready');
          appendLog('Manual token accepted.', 'success');
        } else {
          setLoginStatus('Token cleared.', 'var(--warning)');
          setConsoleState('Awaiting Input', 'idle');
          appendLog('Token cleared.', 'warning');
        }
      });

      // Initialization
      persistBaseUrl(state.baseUrl);
      persistToken(state.token);

      appendLog('Shift 4 Funding - Vera AI Diagnostics', 'system');
      appendLog('System status: online', 'system');
      appendLog('Engine: Helios v2.0.0', 'system');
      appendLog('Ready for document ingestion...', 'system');

      if (state.token) {
        setLoginStatus('Cached bearer token loaded.', 'var(--success)');
        setConsoleState('Authenticated', 'ready');
        appendLog('Token loaded from browser cache.', 'success');
      } else {
        setLoginStatus('Authenticate or paste an active bearer token.', 'var(--muted)');
        setConsoleState('Awaiting Auth', 'idle');
      }
      
      // Inject spin animation
      const style = document.createElement('style');
      style.innerHTML = \`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      \`;
      document.head.appendChild(style);
    });
  </script>
</body>
</html>
`;
};

fs.writeFileSync('public/manual-upload.html', buildNewUploadHtml());
