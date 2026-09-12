import './style.css';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

async function bootLegacyApp() {
  const scripts = [
    '/public/js/api.js',
    '/public/js/ui.js',
    '/public/js/map.js',
    '/public/js/files.js',
    '/public/js/charts.js',
    '/public/js/export.js',
    '/public/js/agent.js',
    '/public/js/app.js',
  ];

  for (const src of scripts) {
    await loadScript(src);
  }

  const root = document.querySelector('#app');
  if (!root) return;

  root.innerHTML = `
    <div class="page-shell">
      <div id="particles"></div>
      <div class="notif" id="notif"></div>

      <div id="apiModal">
        <div class="modal-box">
          <div class="modal-logo">
            <span class="syth-name">SYNTH</span>
            <span class="syth-sub">Universal Digital Experimentation Platform</span>
          </div>
          <p class="modal-desc">Transform real-world questions into evidence-driven discoveries powered by AI, live web research, and computational simulation.</p>
          <div class="api-badges">
            <span class="api-badge badge-gemini">✦ Gemini</span>
            <span class="api-badge badge-tavily">🔍 Tavily</span>
            <span class="api-badge badge-e2b">⌗ E2B</span>
          </div>

          <div class="api-field">
            <label>AI Provider</label>
            <select id="providerSelect">
              <option value="gemini">Gemini</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </div>

          <div class="api-field" id="geminiKeyWrap">
            <label>Gemini API Key</label>
            <input type="password" id="geminiKey" placeholder="AIza..." autocomplete="off"/>
          </div>
          <div class="api-field" id="openrouterKeyWrap" style="display:none">
            <label>OpenRouter API Key</label>
            <input type="password" id="openrouterKey" placeholder="sk-or-..." autocomplete="off"/>
          </div>
          <div class="api-field">
            <label id="modelLabel">Gemini Model</label>
            <input type="text" id="geminiModel" value="gemini-2.5-flash" placeholder="gemini-2.5-flash" autocomplete="off"/>
          </div>
          <div class="api-field">
            <label>Tavily API Key</label>
            <input type="password" id="tavilyKey" placeholder="tvly-..." autocomplete="off"/>
          </div>
          <div class="api-field">
            <label>E2B API Key</label>
            <input type="password" id="e2bKey" placeholder="e2b_..." autocomplete="off"/>
          </div>

          <div class="remember-row">
            <label class="remember-label">
              <input type="checkbox" id="rememberKeys" checked/>
              <span>Remember keys on this device</span>
            </label>
            <button class="btn-clear-keys" id="btnClearKeys">🗑 Clear saved</button>
          </div>
          <button class="btn-launch" id="btnLaunch">⚗ Launch SYNTH</button>
        </div>
      </div>

      <header>
        <div class="logo">SYNTH <span>Experimentation Platform</span></div>
        <div class="header-right">
          <div class="header-status">
            <div class="status-dot" id="statusDot"></div>
            <span class="status-text" id="statusText">Ready</span>
          </div>
          <div class="export-btns" id="exportBtns" style="display:none">
            <button class="btn-export" id="btnExportPDF">📄 PDF</button>
            <button class="btn-export" id="btnExportTXT">📝 TXT</button>
            <button class="btn-export" id="btnExportDOCX">📃 DOCX</button>
          </div>
          <button class="btn-keys" id="btnShowKeys">🔑 Keys</button>
        </div>
      </header>

      <div class="input-panel" id="inputPanel">
        <div class="input-section">
          <div class="input-section-label">⚗ Research Question</div>
          <textarea class="main-input" id="userQuery" rows="3" placeholder="What do you want to discover?..."></textarea>
          <div class="domain-row">
            <span class="domain-chip" data-domain="Agriculture">🌾 Agriculture</span>
            <span class="domain-chip" data-domain="Energy">⚡ Energy</span>
            <span class="domain-chip" data-domain="Environment">🌿 Environment</span>
            <span class="domain-chip" data-domain="Engineering">⚙️ Engineering</span>
            <span class="domain-chip" data-domain="Education">📚 Education</span>
            <span class="domain-chip" data-domain="Transport">🚗 Transport</span>
            <span class="domain-chip" data-domain="Economics">💹 Economics</span>
            <span class="domain-chip" data-domain="Health">🏥 Health</span>
          </div>
        </div>

        <div class="input-section">
          <div class="input-section-label">📎 Attach Files <span class="label-hint">(PDF, DOCX, TXT — agent reads all)</span></div>
          <div class="drop-zone" id="dropZone">
            <div class="drop-icon">📂</div>
            <div class="drop-text">Drop files here or <span class="drop-link" id="dropLink">browse</span></div>
            <div class="drop-hint">Supports PDF · DOCX · TXT · CSV · MD</div>
            <input type="file" id="fileInput" multiple accept=".pdf,.docx,.txt,.csv,.md" style="display:none"/>
          </div>
          <div class="file-list" id="fileList"></div>
        </div>

        <div class="input-section">
          <div class="input-section-label">
            🗺️ Map Input
            <label class="toggle-switch">
              <input type="checkbox" id="mapToggle"/>
              <span class="toggle-slider"></span>
            </label>
            <span class="label-hint">Mark locations, zones, routes — agent reads all annotations</span>
          </div>
          <div id="mapInputWrap" style="display:none">
            <div class="map-toolbar">
              <button class="map-tool active" data-tool="marker" id="toolMarker">📍 Marker</button>
              <button class="map-tool" data-tool="note" id="toolNote">📝 Note</button>
              <button class="map-tool" data-tool="zone" id="toolZone">⬡ Zone</button>
              <button class="map-tool btn-map-clear" id="btnMapClear">🗑 Clear all</button>
              <span class="map-hint" id="mapHint">Click on map to place markers</span>
            </div>
            <div id="inputMap"></div>
            <div class="map-annotations" id="mapAnnotations"></div>
          </div>
        </div>

        <div class="run-row">
          <button class="btn-run" id="btnRun">
            <span class="spinner" id="runSpinner"></span>
            <span id="btnRunText">⚗ Run Experiment</span>
          </button>
          <button class="btn-stop" id="btnStop">⏹ Stop</button>
          <div class="progress-wrap" id="progressWrap">
            <div class="progress-fill" id="progressBar"></div>
            <span class="progress-label" id="progressLabel">0%</span>
          </div>
        </div>
      </div>

      <div class="output-page" id="outputPage">
        <div class="welcome-hero" id="welcomeHero">
          <div class="welcome-glow"></div>
          <div class="welcome-icon">⚗</div>
          <h1 class="welcome-title">Welcome to SYNTH</h1>
          <p class="welcome-sub">Ask a question. Attach files. Mark locations on a map.<br/>SYNTH's AI agent will plan, research, compute, simulate, and generate a full evidence report — all on one continuous living page.</p>
          <div class="feature-grid">
            <div class="feature-card"><div class="fc-icon">🧠</div><div>Hypothesis Generation</div></div>
            <div class="feature-card"><div class="fc-icon">🔍</div><div>Live Web Research</div></div>
            <div class="feature-card"><div class="fc-icon">⌗</div><div>Code Sandbox</div></div>
            <div class="feature-card"><div class="fc-icon">📊</div><div>Multi-Case Simulation</div></div>
            <div class="feature-card"><div class="fc-icon">🗺️</div><div>Map Analysis</div></div>
            <div class="feature-card"><div class="fc-icon">📄</div><div>Full Report Export</div></div>
          </div>
        </div>

        <div id="sectionsContainer"></div>
      </div>
    </div>
  `;

  document.dispatchEvent(new Event('DOMContentLoaded'));
}

bootLegacyApp().catch((error) => {
  console.error('SYTH boot failed:', error);
});
