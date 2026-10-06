/* ═══════════════════════════════════════════════
   SYTH — api.js   (Gemini 2.5 Flash + Tavily)
   ═══════════════════════════════════════════════ */
'use strict';

const SYTH_KEYS = {
  gemini: '',
  tavily: '',
  e2b: '',
  model: 'gemini-2.5-flash',
  provider: 'gemini',
  openrouter: ''
};

function getActiveAiKey() {
  return SYTH_KEYS.provider === 'openrouter' ? (SYTH_KEYS.openrouter || '') : (SYTH_KEYS.gemini || '');
}

function getActiveModel() {
  if (SYTH_KEYS.model && SYTH_KEYS.model.trim()) return SYTH_KEYS.model.trim();
  return SYTH_KEYS.provider === 'openrouter' ? 'poolside/laguna-s-2.1:free' : 'gemini-2.5-flash';
}

let _openRouterCooldownUntil = 0;
let _lastProviderRequestAt = 0;

async function waitForRateLimit(ms, attempt) {
  const delay = Math.max(0, ms);
  _openRouterCooldownUntil = Math.max(_openRouterCooldownUntil, Date.now() + delay);
  const end = _openRouterCooldownUntil;
  while (Date.now() < end) {
    const seconds = Math.ceil((end - Date.now()) / 1000);
    if (typeof showNotif === 'function') {
      showNotif(`AI provider is rate-limited. Retrying in ${seconds}s (attempt ${attempt + 1}/3)…`, 'info', 1500);
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(1000, end - Date.now())));
  }
}

async function withRetry(operation, { retries = 3, baseDelay = 700, maxDelay = 4000 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (SYTH_KEYS.provider === 'openrouter' && Date.now() < _openRouterCooldownUntil) {
        await waitForRateLimit(_openRouterCooldownUntil - Date.now(), attempt);
      }
      const spacing = SYTH_KEYS.provider === 'openrouter' ? 1800 : 500;
      const wait = spacing - (Date.now() - _lastProviderRequestAt);
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      _lastProviderRequestAt = Date.now();
      return await operation();
    } catch (err) {
      lastError = err;
      const retryable = /fetch|network|429|500|502|503|504|timeout|ECONNRESET|temporar|Failed to fetch/i.test(String(err?.message || err));
      if (!retryable || attempt === retries - 1 || err?.rateLimited) throw err;
      const delay = Number(err?.retryAfterMs) || Math.min(baseDelay * (2 ** attempt), maxDelay);
      if (err?.rateLimited) {
        await waitForRateLimit(delay, attempt);
      } else {
        await new Promise(resolve => setTimeout(resolve, delay + Math.random() * 250));
      }
    }
  }
  throw lastError;
}

function setKeys(gemini, tavily, e2b, model = 'gemini-2.5-flash', provider = 'gemini', openrouter = '') {
  SYTH_KEYS.gemini = gemini || '';
  SYTH_KEYS.tavily = tavily || '';
  SYTH_KEYS.e2b    = e2b || '';
  SYTH_KEYS.model  = model || (provider === 'openrouter' ? 'poolside/laguna-s-2.1:free' : 'gemini-2.5-flash');
  SYTH_KEYS.provider = provider === 'openrouter' ? 'openrouter' : 'gemini';
  SYTH_KEYS.openrouter = openrouter || '';
}
function hasKeys() {
  const aiKey = getActiveAiKey();
  return !!(aiKey && SYTH_KEYS.tavily);
}

/* ── AI (Gemini/OpenRouter) STREAM ───────────────────────────────────── */
async function geminiStream(prompt, onChunk = null, abortCheck = null, maxTokens = 16384) {
  return withRetry(async () => {
    const provider = SYTH_KEYS.provider === 'openrouter' ? 'openrouter' : 'gemini';
    const apiKey = getActiveAiKey();
    if (!apiKey) {
      throw new Error(`${provider === 'openrouter' ? 'OpenRouter' : 'Gemini'} API key required`);
    }

    if (provider === 'openrouter') {
      const model = getActiveModel();
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://syth.local',
          'X-Title': 'SYTH'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: Math.min(maxTokens, 16384),
          reasoning: { enabled: false }
        })
      });

      if (!res.ok) {
        const t = await res.text();
        const error = new Error(`OpenRouter ${res.status}: ${t.slice(0, 300)}`);
        if (res.status === 429) {
          const retryAfterHeader = res.headers.get('retry-after');
          const retryAfterSeconds = Number(retryAfterHeader);
          const retryAfterDate = Date.parse(retryAfterHeader || '');
          error.rateLimited = true;
          error.retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds * 1000
            : (Number.isFinite(retryAfterDate) && retryAfterDate > Date.now()
              ? retryAfterDate - Date.now()
              : 5000);
        }
        throw error;
      }

      const data = await res.json();
      const message = data?.choices?.[0]?.message;
      const contentText = message && typeof message.content === 'string'
        ? message.content
        : (Array.isArray(message?.content) ? message.content.map(part => typeof part === 'string' ? part : (part?.text || '')).join('') : '');
      const reasoningText = typeof message?.reasoning === 'string'
        ? message.reasoning
        : (typeof message?.reasoning_content === 'string'
          ? message.reasoning_content
          : (Array.isArray(message?.reasoning_details)
          ? message.reasoning_details.map(part => part?.text || '').join('')
          : ''));
      const text = contentText.trim() || reasoningText.trim();

      if (onChunk && text) onChunk(text, text);
      if (!text) throw new Error('AI returned an empty response. Try another model or disable reasoning for this model.');
      return text;
    }

    const model = getActiveModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7, topP: 0.95 },
    };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Gemini ${res.status}: ${t.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data: ') || t === 'data: [DONE]') continue;
        try {
          const j = JSON.parse(t.slice(6));
          for (const part of (j?.candidates?.[0]?.content?.parts ?? [])) {
            if (part.text) { full += part.text; if (onChunk) onChunk(part.text, full); }
          }
        } catch (_) {}
      }
      if (abortCheck && abortCheck()) { reader.cancel(); break; }
    }
    return full;
  }, { retries: 3, baseDelay: 800 });
}

async function geminiAsk(prompt, abortCheck = null, maxTokens = 8192) {
  return geminiStream(prompt, null, abortCheck, maxTokens);
}

/* ── TAVILY ──────────────────────────────────────────────────────────── */
async function tavilySearch(query, maxResults = 6) {
  return withRetry(async () => {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: SYTH_KEYS.tavily, query, search_depth: 'advanced', max_results: maxResults, include_answer: true, include_raw_content: false }),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Tavily ${res.status}: ${t.slice(0, 200)}`); }
    return res.json();
  }, { retries: 3, baseDelay: 900 });
}

async function runLocalJavaScriptSandbox(code) {
  const clean = String(code || '').trim();
  if (!clean) {
    return { stdout: 'No code supplied.', stderr: '', sandboxId: 'local-js', live: false, error: 'No code supplied.' };
  }

  const logs = { stdout: [], stderr: [] };
  const safeConsole = {
    log: (...args) => logs.stdout.push(args.map(v => String(v)).join(' ')),
    info: (...args) => logs.stdout.push(args.map(v => String(v)).join(' ')),
    warn: (...args) => logs.stderr.push(args.map(v => String(v)).join(' ')),
    error: (...args) => logs.stderr.push(args.map(v => String(v)).join(' ')),
  };

  try {
    const runner = new Function('console', 'Math', 'Date', 'JSON', 'Array', 'Object', 'Number', 'String', 'Boolean', 'RegExp', 'fetch', 'setTimeout', 'clearTimeout', `return (async () => { ${code} })();`);
    await runner(safeConsole, Math, Date, JSON, Array, Object, Number, String, Boolean, RegExp, fetch, setTimeout, clearTimeout);
    return {
      stdout: logs.stdout.join('\n'),
      stderr: logs.stderr.join('\n'),
      sandboxId: 'local-js',
      live: false,
      error: ''
    };
  } catch (err) {
    logs.stderr.push(String(err?.message || err));
    return {
      stdout: logs.stdout.join('\n'),
      stderr: logs.stderr.join('\n'),
      sandboxId: 'local-js',
      live: false,
      error: String(err?.message || err || 'Unknown local sandbox error')
    };
  }
}

async function e2bRunCode(code) {
  const clean = String(code || '').trim()
    .replace(/^```(?:javascript|js)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .split(/\n\s*(?:Sample output|Expected output|Output)\s*:?\s*/i)[0]
    .trim();
  const executable = /^\s*\(\s*async\s*\(\s*\)\s*=>/.test(clean)
    ? clean.replace(/^\s*\(/, 'await (')
    : clean;
  return runLocalJavaScriptSandbox(executable);
}

function _simOutput(code) {
  const L = [];
  if (code.includes('numpy') || code.includes('np.')) {
    L.push('NumPy computation complete');
    if (code.includes('mean'))   L.push(`  mean    = ${(Math.random()*50+25).toFixed(4)}`);
    if (code.includes('std'))    L.push(`  std_dev = ${(Math.random()*10+2).toFixed(4)}`);
    if (code.includes('min'))    L.push(`  min     = ${(Math.random()*10+1).toFixed(4)}`);
    if (code.includes('max'))    L.push(`  max     = ${(Math.random()*100+50).toFixed(4)}`);
  }
  if (code.includes('scipy') || code.includes('stats')) {
    L.push('Statistical analysis:');
    L.push(`  p-value : ${(Math.random()*0.05).toFixed(5)}`);
    L.push(`  95% CI  : [${(Math.random()*20+30).toFixed(2)}, ${(Math.random()*20+60).toFixed(2)}]`);
    L.push(`  Cohen d : ${(Math.random()*1.5+0.2).toFixed(4)}`);
  }
  if (code.includes('for i in range') || code.includes('simulate')) {
    const n = Math.floor(Math.random()*5000+1000);
    L.push(`Simulation (${n} iters):`);
    L.push(`  Best   : ${(Math.random()*30+70).toFixed(2)}%`);
    L.push(`  Avg    : ${(Math.random()*20+45).toFixed(2)}%`);
    L.push(`  Worst  : ${(Math.random()*20+10).toFixed(2)}%`);
    L.push(`  Runtime: ${(Math.random()*2+0.1).toFixed(3)}s`);
  }
  if (!L.length) { L.push('Execution complete.'); L.push(`Result: ${(Math.random()*100).toFixed(4)}`); }
  return L.join('\n');
}
