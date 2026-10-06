/* ═══════════════════════════════════════════════
   SYTH — ui.js
   Continuous page section builder, streaming render,
   status, progress, notifications, helpers
   ═══════════════════════════════════════════════ */
'use strict';

/* ── NOTIFICATION ─────────────────────────────────────────────────── */
let _notifTimer = null;
export function showNotif(msg, type = 'info', dur = 3500) {
  const el = document.getElementById('notif');
  if (!el) return;
  el.textContent = msg;
  el.className   = `notif show ${type}`;
  clearTimeout(_notifTimer);
  _notifTimer = setTimeout(() => { el.className = 'notif'; }, dur);
}

/* ── STATUS / PROGRESS ────────────────────────────────────────────── */
function setStatus(text, active = true) {
  const dot  = document.getElementById('statusDot');
  const span = document.getElementById('statusText');
  if (span) span.textContent = text;
  if (dot) {
    const c = active ? 'var(--accent)' : 'var(--accent3)';
    dot.style.background = c;
    dot.style.boxShadow  = `0 0 8px ${c}`;
  }
}

function setProgress(pct, label = '') {
  const wrap  = document.getElementById('progressWrap');
  const bar   = document.getElementById('progressBar');
  const lbl   = document.getElementById('progressLabel');
  if (wrap) wrap.classList.add('show');
  if (bar)  bar.style.width = `${Math.min(100, pct)}%`;
  if (lbl)  lbl.textContent = label || `${Math.round(pct)}%`;
}

function hideProgress() {
  const wrap = document.getElementById('progressWrap');
  if (wrap) wrap.classList.remove('show');
}

/* ── RUN BUTTON ───────────────────────────────────────────────────── */
function setRunning(running) {
  const btn  = document.getElementById('btnRun');
  const spin = document.getElementById('runSpinner');
  const txt  = document.getElementById('btnRunText');
  const stop = document.getElementById('btnStop');
  if (btn)  btn.disabled = running;
  if (spin) spin.classList.toggle('show', running);
  if (txt)  txt.textContent = running ? 'Running…' : '⚗ Run Experiment';
  if (stop) stop.classList.toggle('show', running);
}

/* ── SECTIONS CONTAINER ───────────────────────────────────────────── */
function clearOutputPage() {
  const c = document.getElementById('sectionsContainer');
  if (c) c.innerHTML = '';
  document.getElementById('welcomeHero').style.display = 'none';
  document.getElementById('exportBtns').style.display  = 'none';
  // destroy old charts
  if (typeof destroyCharts === 'function') destroyCharts();
}

/**
 * Append a new section block to the continuous output page.
 * Returns { sectionEl, bodyEl, setStatus } for live updates.
 *
 * @param {string} id          unique section id
 * @param {string} iconType    CSS class (plan|search|code|analyze|report|scenario|sim|map|export)
 * @param {string} iconEmoji   emoji char
 * @param {string} title       section heading
 * @param {string} cardClass   extra class for the card
 */
function addSection(id, iconType, iconEmoji, title, cardClass = '') {
  const container = document.getElementById('sectionsContainer');
  if (!container) return {};

  const sec = document.createElement('div');
  sec.className = 'out-section';
  sec.id        = `sec-${id}`;
  sec.innerHTML = `
    <div class="section-header">
      <div class="section-icon ${iconType}">${iconEmoji}</div>
      <div class="section-title">${escHtml(title)}</div>
      <div class="section-meta" id="secmeta-${id}"></div>
      <div class="section-status running" id="secstatus-${id}">
        <span class="pulse-dot"></span> Running
      </div>
    </div>
    <div class="section-card ${cardClass || iconType}" id="seccard-${id}">
      <div class="md-body" id="secbody-${id}"></div>
    </div>`;
  container.appendChild(sec);
  container.scrollTop = container.scrollHeight;
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const bodyEl   = document.getElementById(`secbody-${id}`);
  const statusEl = document.getElementById(`secstatus-${id}`);
  const metaEl   = document.getElementById(`secmeta-${id}`);

  return {
    sectionEl: sec,
    bodyEl,
    setDone(metaText = '') {
      statusEl.className = 'section-status done';
      statusEl.innerHTML = '✓ Done';
      if (metaText) metaEl.textContent = metaText;
    },
    setError(msg = '') {
      statusEl.className = 'section-status error';
      statusEl.innerHTML = '✗ Error';
      bodyEl.innerHTML   = `<span style="color:#ff4466">${escHtml(msg)}</span>`;
    },
    setMeta(text) { metaEl.textContent = text; },
    cardEl: document.getElementById(`seccard-${id}`),
  };
}

/* ── THINKING BAR ─────────────────────────────────────────────────── */
function showThinkingBar(text = 'Agent is thinking…') {
  const container = document.getElementById('sectionsContainer');
  if (!container) return null;
  const el = document.createElement('div');
  el.className = 'thinking-bar';
  el.id        = 'thinkingBar';
  el.innerHTML = `<div class="thinking-dots"><span></span><span></span><span></span></div>
    <span class="thinking-text" id="thinkingText">${escHtml(text)}</span>`;
  container.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return el;
}
function updateThinking(text) {
  const el = document.getElementById('thinkingText');
  if (el) el.textContent = text;
}
function removeThinkingBar() {
  document.getElementById('thinkingBar')?.remove();
}

/* ── MARKDOWN STREAMING INTO AN ELEMENT ──────────────────────────── */
function markdownToHtml(raw) {
  const text = String(raw || '');
  const mermaidBlocks = [];
  const withPlaceholders = text.replace(/```mermaid\s*([\s\S]*?)```/g, (_, body) => {
    const token = `%%MERMAID_BLOCK_${mermaidBlocks.length}%%`;
    mermaidBlocks.push(`<div class="mermaid">${body.trim()}</div>`);
    return token;
  });

  let html = typeof marked !== 'undefined' ? marked.parse(withPlaceholders) : escHtml(withPlaceholders);
  mermaidBlocks.forEach((block, i) => {
    html = html.replace(`%%MERMAID_BLOCK_${i}%%`, block);
  });
  return html;
}

function streamMarkdown(el, full) {
  if (!el) return;
  const md = markdownToHtml(full);
  el.innerHTML = md + '<span class="stream-cursor"></span>';
  if (window.mermaid) {
    requestAnimationFrame(() => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
      mermaid.run({ nodes: el.querySelectorAll('.mermaid') });
    });
  }
  const page = document.getElementById('outputPage');
  if (page) page.scrollTop = page.scrollHeight;
}

function finalizeMarkdown(el, full) {
  if (!el) return;
  el.innerHTML = markdownToHtml(full);
  if (window.mermaid) {
    requestAnimationFrame(() => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
      mermaid.run({ nodes: el.querySelectorAll('.mermaid') });
    });
  }
}

/* ── SECTION DIVIDER ─────────────────────────────────────────────── */
function addDivider(label = '') {
  const c = document.getElementById('sectionsContainer');
  if (!c) return;
  const d = document.createElement('div');
  d.className = 'section-divider';
  d.innerHTML = `<span>${escHtml(label)}</span>`;
  c.appendChild(d);
}

/* ── SANDBOX BLOCK ───────────────────────────────────────────────── */
function buildSandboxBlock(code, output, lang = 'Python', status = 'Executed') {
  return `<div class="sandbox-wrap">
    <div class="sandbox-header">
      <span class="sandbox-lang">⌗ ${escHtml(lang)}</span>
      <span class="sandbox-status">✓ ${escHtml(status)}</span>
    </div>
    <div class="sandbox-code">${escHtml(code)}</div>
    <div class="sandbox-output">&gt; ${escHtml(output)}</div>
  </div>`;
}

/* ── SEARCH RESULTS HTML ─────────────────────────────────────────── */
function buildSearchHTML(data) {
  let html = '';
  if (data.answer) {
    html += `<div class="search-answer-box">
      <div class="search-answer-label">🤖 AI Answer</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.7">${escHtml(data.answer)}</div>
    </div>`;
  }
  (data.results || []).forEach(r => {
    const snippet = (r.content || r.snippet || '').slice(0, 300);
    html += `<div class="search-result-item">
      <div class="search-result-title"><a href="${escHtml(r.url)}" target="_blank" rel="noopener">${escHtml(r.title || '')}</a></div>
      <div class="search-result-url">${escHtml(r.url || '')}</div>
      <div class="search-result-snippet">${escHtml(snippet)}${snippet.length >= 300 ? '…' : ''}</div>
    </div>`;
  });
  return html;
}

/* ── PARTICLES ───────────────────────────────────────────────────── */
export function initParticles() {
  const c = document.getElementById('particles');
  if (!c) return;
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const s = Math.random() * 3 + 1;
    p.style.cssText = `width:${s}px;height:${s}px;left:${Math.random()*100}%;animation-duration:${Math.random()*20+15}s;animation-delay:${Math.random()*15}s;opacity:${(Math.random()*.4+.1).toFixed(2)}`;
    c.appendChild(p);
  }
}

/* ── HELPERS ─────────────────────────────────────────────────────── */
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDuration(ms) {
  if (ms < 1000)  return `${ms}ms`;
  if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
  return `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s`;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
