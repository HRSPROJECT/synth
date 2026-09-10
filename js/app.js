/* ═══════════════════════════════════════════════
   SYTH — app.js
   Entry point: init, all event bindings,
   API modal with localStorage, file dropzone,
   map toggle, export buttons
   ═══════════════════════════════════════════════ */
'use strict';

const LS_KEY = 'syth_api_keys_v3';

document.addEventListener('DOMContentLoaded', () => {
  _syncProviderFields();
  initParticles();
  _loadSavedKeys();
  _bindModal();
  _bindHeader();
  _bindInputPanel();
  _bindKeyboard();
  console.log('%cSYTH Ready', 'color:#00d4ff;font-size:20px;font-weight:900;letter-spacing:4px;');
});

/* ── LOCALSTORAGE ─────────────────────────────────────────────────── */
function _saveKeys(gemini, tavily, e2b, model = 'gemini-2.5-flash', provider = 'gemini', openrouter = '') {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ gemini, tavily, e2b, model, provider, openrouter })); } catch(_) {}
}
function _loadSavedKeys() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const { gemini='', tavily='', e2b='', model='gemini-2.5-flash', provider='gemini', openrouter='' } = JSON.parse(raw);
    const selectedProvider = provider === 'openrouter' ? 'openrouter' : 'gemini';
    const aiKey = selectedProvider === 'openrouter' ? openrouter : gemini;
    if (!aiKey || !tavily || !e2b) return;
    _setInput('geminiKey', gemini);
    _setInput('openrouterKey', openrouter);
    _setInput('tavilyKey', tavily);
    _setInput('e2bKey',    e2b);
    _setInput('geminiModel', model);
    _setInput('providerSelect', selectedProvider);
    setKeys(gemini, tavily, e2b, model, selectedProvider, openrouter);
    _syncProviderFields();
    document.getElementById('apiModal').style.display = 'none';
    showNotif('Keys loaded ✓', 'success', 2000);
  } catch(_) {}
}
function _clearSavedKeys() { try { localStorage.removeItem(LS_KEY); } catch(_) {} }
function _setInput(id, val) { const el=document.getElementById(id); if(el) el.value=val; }
function _syncProviderFields() {
  const select = document.getElementById('providerSelect');
  const geminiWrap = document.getElementById('geminiKeyWrap');
  const openrouterWrap = document.getElementById('openrouterKeyWrap');
  const provider = select ? select.value : (SYTH_KEYS.provider || 'gemini');
  if (geminiWrap) geminiWrap.style.display = provider === 'openrouter' ? 'none' : 'block';
  if (openrouterWrap) openrouterWrap.style.display = provider === 'openrouter' ? 'block' : 'none';
  const modelLabel = document.getElementById('modelLabel');
  if (modelLabel) {
    modelLabel.textContent = provider === 'openrouter' ? 'OpenRouter Model' : 'Gemini Model';
  }
}

/* ── MODAL ────────────────────────────────────────────────────────── */
function _bindModal() {
  document.getElementById('btnLaunch')?.addEventListener('click', _handleLaunch);
  document.getElementById('providerSelect')?.addEventListener('change', _syncProviderFields);
  ['geminiKey','openrouterKey','tavilyKey','e2bKey'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if(e.key==='Enter') _handleLaunch(); });
  });
  document.getElementById('btnClearKeys')?.addEventListener('click', () => {
    _clearSavedKeys();
    ['geminiKey','openrouterKey','tavilyKey','e2bKey'].forEach(id => _setInput(id,''));
    _setInput('providerSelect', 'gemini');
    _setInput('geminiModel', 'gemini-2.5-flash');
    _syncProviderFields();
    setKeys('', '', '', 'gemini-2.5-flash', 'gemini', '');
    showNotif('Saved keys cleared.','info');
  });
}

function _handleLaunch() {
  const provider = document.getElementById('providerSelect')?.value || 'gemini';
  const gemini = document.getElementById('geminiKey')?.value.trim()||'';
  const openrouter = document.getElementById('openrouterKey')?.value.trim()||'';
  const tavily = document.getElementById('tavilyKey')?.value.trim()||'';
  const e2b    = document.getElementById('e2bKey')?.value.trim()||'';
  const model  = document.getElementById('geminiModel')?.value || (provider === 'openrouter' ? 'poolside/laguna-s-2.1:free' : 'gemini-2.5-flash');
  const activeAiKey = provider === 'openrouter' ? openrouter : gemini;
  if (!activeAiKey) { showNotif(`${provider === 'openrouter' ? 'OpenRouter' : 'Gemini'} API key required`, 'error'); return; }
  if (!tavily) { showNotif('Tavily API key required','error'); return; }
  if (!e2b)    { showNotif('E2B API key required','error');    return; }
  setKeys(gemini, tavily, e2b, model, provider, openrouter);
  const remember = document.getElementById('rememberKeys')?.checked ?? true;
  if (remember) { _saveKeys(gemini, tavily, e2b, model, provider, openrouter); showNotif('SYTH launched! Keys saved.','success'); }
  else          { _clearSavedKeys();              showNotif('SYTH launched! Session only.','success'); }
  document.getElementById('apiModal').style.display = 'none';
}

function showApiModal() {
  _setInput('geminiKey', SYTH_KEYS.gemini);
  _setInput('openrouterKey', SYTH_KEYS.openrouter);
  _setInput('tavilyKey', SYTH_KEYS.tavily);
  _setInput('e2bKey',    SYTH_KEYS.e2b);
  _setInput('providerSelect', SYTH_KEYS.provider || 'gemini');
  _setInput('geminiModel', getActiveModel());
  _syncProviderFields();
  document.getElementById('apiModal').style.display = 'flex';
}

/* ── HEADER ───────────────────────────────────────────────────────── */
function _bindHeader() {
  document.getElementById('btnShowKeys')?.addEventListener('click', showApiModal);
  document.getElementById('btnExportPDF')?.addEventListener('click',  exportPDF);
  document.getElementById('btnExportTXT')?.addEventListener('click',  exportTXT);
  document.getElementById('btnExportDOCX')?.addEventListener('click', exportDOCX);
}

/* ── INPUT PANEL ─────────────────────────────────────────────────── */
function _bindInputPanel() {
  // Domain chips
  document.querySelectorAll('.domain-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.domain-chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  // Run / Stop
  document.getElementById('btnRun')?.addEventListener('click', _handleRun);
  document.getElementById('btnStop')?.addEventListener('click', () => stopExperiment());

  // File upload
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  document.getElementById('dropLink')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', e => { if(e.target.files?.length) addFiles(e.target.files); fileInput.value=''; });

  dropZone?.addEventListener('click', () => fileInput?.click());
  dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone?.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });

  // Map toggle
  document.getElementById('mapToggle')?.addEventListener('change', e => {
    const wrap = document.getElementById('mapInputWrap');
    if (!wrap) return;
    if (e.target.checked) {
      wrap.style.display = 'block';
      initInputMap();
      invalidateInputMap();
    } else {
      wrap.style.display = 'none';
    }
  });

  // Map tool buttons
  document.querySelectorAll('.map-tool[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-tool[data-tool]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      setMapTool(btn.dataset.tool);
    });
  });

  // Clear map
  document.getElementById('btnMapClear')?.addEventListener('click', () => {
    clearMapAnnotations();
    showNotif('Map cleared.','info');
  });

  // Welcome domain cards
  document.addEventListener('click', e => {
    const card = e.target.closest('.domain-card[data-query]');
    if (card) {
      const input = document.getElementById('userQuery');
      if (input) { input.value = card.dataset.query; input.focus(); }
    }
  });
}

async function _handleRun() {
  if (!getActiveAiKey()) { showNotif('Configure API keys first','error'); showApiModal(); return; }
  const query  = document.getElementById('userQuery')?.value.trim()||'';
  const active = document.querySelector('.domain-chip.active');
  const domain = active ? active.dataset.domain : 'General';
  await runExperiment(query, domain);
}

/* ── KEYBOARD ─────────────────────────────────────────────────────── */
function _bindKeyboard() {
  document.addEventListener('keydown', e => {
    const modal = document.getElementById('apiModal');
    const open  = modal?.style.display !== 'none';
    if (!open && (e.metaKey||e.ctrlKey) && e.key==='Enter') { e.preventDefault(); _handleRun(); }
    if (e.key==='Enter' && e.shiftKey && e.target.id==='userQuery') { e.preventDefault(); _handleRun(); }
    if (e.key==='Escape' && open && getActiveAiKey()) modal.style.display = 'none';
  });
}
