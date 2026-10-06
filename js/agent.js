/* ═══════════════════════════════════════════════
   SYTH — agent.js  (Autonomous Loop Engine)

   Like Claude Code: the agent decides what to do,
   when to do it, how many times to run code,
   whether to re-search, iterate on analysis, etc.

   Flow:
   1. Agent sees all context and emits a PLAN (JSON action list)
   2. SYTH executes each action the agent chose
   3. Agent sees results and may emit MORE actions
   4. Loop continues until agent emits { done: true }
   ═══════════════════════════════════════════════ */
'use strict';

let _abort = false;
let currentExperiment = null;
const MAX_LOOPS = 12;   // safety cap — agent can do up to 12 action rounds

export function stopExperiment() {
  _abort = true;
  setStatus('Stopped', false);
  setRunning(false);
  removeThinkingBar();
  showNotif('Stopped.', 'info');
}

/* ══════════════════════════════════════════════
   TOOL REGISTRY — what the agent can do
══════════════════════════════════════════════ */
const TOOLS = {
  search:    { desc: 'Search the web via Tavily',                        fn: _toolSearch    },
  code:      { desc: 'Write and execute Python or shell tasks in E2B',   fn: _toolCode      },
  analyze:   { desc: 'Deep analysis section grounded in actual results', fn: _toolAnalyze   },
  map:       { desc: 'Render a map simulation from data',               fn: _toolMap       },
  scenarios: { desc: 'Generate best/avg/worst/custom scenario cards',    fn: _toolScenarios },
  charts:    { desc: 'Build simulation charts and metric grid',         fn: _toolCharts    },
  report:    { desc: 'Write final comprehensive report (streaming)',     fn: _toolReport    },
  chat:      { desc: 'Answer the user in plain chat-like text',         fn: _toolChat      },
  custom:    { desc: 'Create a custom AI-generated analytical box',     fn: _toolCustom    },
  note:      { desc: 'Add an inline thinking/observation section',       fn: _toolNote      },
};

/* ══════════════════════════════════════════════
   MAIN ENTRY
══════════════════════════════════════════════ */
export async function runExperiment(query, domain) {
  if (!query.trim())     { showNotif('Enter a research question', 'error'); return; }
  if (!getActiveAiKey()) { showNotif('Configure API keys first', 'error'); return; }

  _abort = false;
  currentExperiment = null;
  clearOutputPage();
  setRunning(true);
  setStatus('Agent starting…', true);
  setProgress(3, 'Initialising…');
  const t0 = Date.now();

  // ── collect all inputs ──────────────────────
  const fileCtx = hasFiles()          ? getFilesContext()  : '';
  const mapCtx  = hasMapAnnotations() ? getMapContext()    : '';
  const mapJSON = hasMapAnnotations() ? getMapJSON()       : '';
  const annotations = typeof getAnnotations === 'function' ? getAnnotations() : [];
  const hasMap  = annotations.length > 0;

  // ── shared memory across all loops ──────────
  const memory = {
    query, domain, fileCtx, mapCtx, mapJSON, annotations, hasMap,
    searchResults:  [],    // array of Tavily result sets
    codeRuns:       [],    // array of { code, output }
    analyses:       [],    // array of text
    scenarios:      null,
    chartData:      null,
    customScenarioConfig: [],
    reportText:     '',
    allSections:    [],    // section objects added to page
    iteration:      0,
  };

  try {
    // ── FIRST PLAN: agent decides the whole strategy ──
    const plan = await _agentPlan(memory);
    _chk();

    // ── AUTONOMOUS LOOP ──────────────────────────────
    let done = false;
    while (!done && memory.iteration < MAX_LOOPS) {
      memory.iteration++;
      setProgress(Math.min(95, 5 + memory.iteration * 8), `Loop ${memory.iteration}…`);
      _chk();

      // Execute all actions the agent chose this round
      for (const action of plan.actions) {
        if (_abort) break;
        await _executeAction(action, memory);
        _chk();
      }

      // Hard stop: once a substantive report exists, the run is complete.
      if (memory.reportText && memory.reportText.trim().length > 200) {
        done = true;
        break;
      }

      // Ask agent: are we done, or do you want to do more?
      const next = await _agentReview(memory);
      _chk();

      if (next.done) {
        done = true;
      } else {
        // Agent wants more — replace plan actions with new ones
        plan.actions = next.actions || [];
        if (!plan.actions.length) done = true;
      }
    }

    // ── FINISH ──────────────────────────────────────
    setProgress(100, 'Done');
    setStatus('Complete ✓', false);
    const elapsed = formatDuration(Date.now() - t0);
    addDivider(`✓ Experiment complete — ${elapsed} · ${memory.iteration} agent loop(s)`);
    document.getElementById('exportBtns').style.display = 'flex';
    currentExperiment = {
      query, domain, elapsed,
      scenarios:  memory.scenarios,
      reportText: memory.reportText,
      annotations,
    };
    showNotif(`Done in ${elapsed}!`, 'success');

  } catch(err) {
    removeThinkingBar();
    if (err.message !== '__ABORT__') {
      const s = addSection('error','report','✗','Agent Error');
      s.bodyEl.innerHTML = `<span style="color:#ff4466">${escHtml(err.message)}</span>`;
      s.setError('');
      setStatus('Error', false);
      showNotif('Error: ' + err.message.slice(0,80), 'error');
      console.error('[SYTH agent]', err);
    }
  } finally {
    setRunning(false);
    removeThinkingBar();
  }
}

/* ══════════════════════════════════════════════
   AGENT PLAN  — decides what to do first
══════════════════════════════════════════════ */
async function _agentPlan(memory) {
  showThinkingBar('Agent is reading your inputs and planning…');
  setStatus('Planning…', true);

  const systemCtx = _buildSystemContext(memory);

  const planPrompt = `${systemCtx}

You are SYTH's autonomous agent. Based on the user's question, files, and map annotations above, decide EXACTLY what actions to take.

Available tools:
${Object.entries(TOOLS).map(([k,v])=>`  ${k}: ${v.desc}`).join('\n')}

You MUST respond with a JSON object only (no markdown, no explanation outside JSON):
{
  "reasoning": "Why you chose these actions (1-2 sentences)",
  "actions": [
    {
      "tool": "<tool name>",
      "title": "<section title shown to user>",
      "instruction": "<specific instruction for this action — be very detailed>",
      "priority": "high|medium"
    }
  ]
}

Rules:
- Include the core evidence steps: search + code + analysis
- You may add additional custom analytical boxes whenever the question needs them
- Custom tools are encouraged for domain-specific outputs such as weather model, risk lens, optimization box, cost simulator, financial stress test, market comparator, or scenario battle card
- If map annotations exist, ALWAYS include a map action with specific per-location analysis
- If files were uploaded, reference them in relevant action instructions
- You may include code multiple times (e.g. first simulate, then calculate distances, then plot)
- Instruction for "code" must specify EXACTLY what to compute, what libraries, what to print
- For map locations, instruction must name the REAL PLACE NAMES from the annotations
- Ground all numbers in actual search results, file contents, and sandbox executions; do not invent values
- If the task is about live data such as weather, market price, scraping, or public conditions, prefer a sandbox script that fetches the data and prints exact values instead of guessing
- DO NOT use generic instructions like "analyze the data" — be very specific
- Prefer custom dynamic result cards over repeating the same default chart/report template if the question needs a more targeted view`;

  const raw = await geminiAsk(planPrompt, () => _abort, 4096);
  removeThinkingBar();
  _chk();

  try {
    const json = JSON.parse(_extractJSON(raw));
    addSection('plan','plan','🧠',`Agent Plan — ${json.reasoning||'Starting…'}`).bodyEl.innerHTML =
      `<div class="md-body">${marked.parse(
        json.actions.map((a,i)=>`**${i+1}. ${a.tool.toUpperCase()}** — ${a.title}\n${a.instruction}`).join('\n\n')
      )}</div>`;
    return json;
  } catch(e) {
    // fallback: default plan
    return { reasoning: 'Default plan', actions: _defaultActions(memory) };
  }
}

/* ══════════════════════════════════════════════
   AGENT REVIEW — after each loop, decide if done
══════════════════════════════════════════════ */
async function _agentReview(memory) {
  if (memory.reportText && memory.reportText.trim().length > 200) return { done: true, reasoning: 'Final report is complete.' };
  if (memory.iteration >= MAX_LOOPS - 1) return { done: true };

  showThinkingBar('Agent reviewing progress…');

  const summary = `
Done so far (iteration ${memory.iteration}):
- Web searches: ${memory.searchResults.length}
- Code executions: ${memory.codeRuns.length}
- Analysis sections: ${memory.analyses.length}
- Scenarios generated: ${memory.scenarios ? 'yes' : 'no'}
- Report written: ${memory.reportText ? 'yes ('+memory.reportText.split(' ').length+' words)' : 'no'}
- Map rendered: ${memory.hasMap ? 'yes' : 'n/a'}
`;

  const reviewPrompt = `${_buildSystemContext(memory)}

PROGRESS SUMMARY:
${summary}

Code outputs so far:
${memory.codeRuns.map((r,i)=>`[RUN ${i+1}]:\n${r.output.slice(0,300)}`).join('\n')}

Based on this progress, decide if the experiment is complete or if more work is needed.

Respond with JSON only:
{
  "done": true/false,
  "reasoning": "why",
  "actions": [ ... ]    // only if done=false — new actions to run
}

Consider done=true when: report is written, scenarios exist, at least 1 code run done.`;

  const raw = await geminiAsk(reviewPrompt, () => _abort, 2048);
  removeThinkingBar();

  try {
    return JSON.parse(_extractJSON(raw));
  } catch(e) {
    return { done: true };
  }
}

/* ══════════════════════════════════════════════
   ACTION EXECUTOR — dispatches to tool functions
══════════════════════════════════════════════ */
async function _executeAction(action, memory) {
  const toolFn = TOOLS[action.tool]?.fn || _toolCustom;
  if (!toolFn) {
    console.warn('[SYTH] Unknown tool:', action.tool);
    return;
  }
  updateThinking(`${action.tool}: ${action.title||action.instruction?.slice(0,60)||'…'}`);
  await toolFn(action, memory);
}

/* ══════════════════════════════════════════════
   TOOL IMPLEMENTATIONS
══════════════════════════════════════════════ */

/* ── SEARCH ────────────────────────────────── */
async function _toolSearch(action, memory) {
  showThinkingBar(`Searching: ${action.title||action.instruction?.slice(0,50)||'…'}`);
  const sec = addSection(`search-${memory.searchResults.length}`, 'search', '🔍',
    action.title || 'Web Research');

  // Agent may specify a custom query in instruction
  const q = action.instruction?.match(/query:\s*"([^"]+)"/i)?.[1]
    || `${memory.query} ${memory.domain} ${memory.mapCtx ? 'Maharashtra India' : ''} research evidence data`;

  try {
    const data = await tavilySearch(q, 6);
    sec.bodyEl.innerHTML = buildSearchHTML(data);
    const ctx = [
      data.answer ? `Summary: ${data.answer}` : '',
      ...(data.results||[]).map(r=>`[${r.title}] ${(r.content||r.snippet||'').slice(0,300)}`),
    ].filter(Boolean).join('\n\n');
    memory.searchResults.push({ query: q, context: ctx, answer: data.answer||'' });
    sec.setDone(`${data.results?.length||0} sources`);
  } catch(e) {
    sec.setError(`Search failed: ${e.message.slice(0,60)}`);
    memory.searchResults.push({ query: q, context: '', answer: '' });
  }
  removeThinkingBar();
}

/* ── CODE ──────────────────────────────────── */
async function _toolCode(action, memory) {
  const runIdx = memory.codeRuns.length + 1;
  showThinkingBar(`Writing code (run #${runIdx})…`);
  const sec = addSection(`code-${runIdx}`, 'code', '⌗',
    action.title || `Code Execution #${runIdx}`);

  // Build full context for code generation
  const searchCtxSnippet = memory.searchResults.map(s=>s.context).join('\n').slice(0,600);
  const prevOutputs = memory.codeRuns.map((r,i)=>`# Previous run ${i+1} output:\n# ${r.output.slice(0,200).replace(/\n/g,'\n# ')}`).join('\n');

  const codePrompt = `You are writing Python for SYTH's code sandbox.

TASK: ${action.instruction}

RESEARCH QUESTION: ${memory.query}
DOMAIN: ${memory.domain}
${memory.mapJSON ? `MAP DATA (JSON with real place names and coordinates):\n${memory.mapJSON}\n` : ''}
${searchCtxSnippet ? `WEB RESEARCH CONTEXT:\n${searchCtxSnippet}\n` : ''}
${prevOutputs ? `PREVIOUS CODE OUTPUTS (build on these):\n${prevOutputs}\n` : ''}

RULES:
- Use any relevant Python stdlib + numpy + scipy + math + json + collections + requests
- If the task involves weather, live conditions, public datasets, or scraping, fetch actual live values in the sandbox using requests/http and print the exact result
- You MAY use haversine formula for geographic distance calculations between coordinates
- For map data: use the exact lat/lng coordinates provided above
- Print ALL results with clear labels
- Include location-specific outputs if map data is provided (by place name, not just coords)
- Do not invent numbers or percentages without a reasoned calculation from the data
- No external file I/O, no matplotlib (can't display), no pip installs
- Return ONLY raw Python — no markdown fences, no comments starting with #! 
- Max 60 lines`;

  updateThinking('Generating code…');
  let code = await geminiAsk(codePrompt, () => _abort, 2048);
  code = code.replace(/```python\n?/gi,'').replace(/```\n?/g,'').trim();
  _chk();

  updateThinking(`Executing in E2B sandbox (run #${runIdx})…`);
  const result  = await e2bRunCode(code);
  const output  = result.stdout || result.stderr || 'No output';

  const statusLabel = result.live
    ? `E2B sandbox: ${result.sandboxId}`
    : `Simulated locally — E2B unavailable`;

  sec.bodyEl.innerHTML = buildSandboxBlock(code, output, 'Python', statusLabel);
  if (!result.live) {
    sec.bodyEl.innerHTML += `<div style="margin-top:10px;color:#ffb4c0;font-size:12px;">⚠️ ${escHtml(result.error || 'Sandbox creation failed. The app is using local simulation only.')}</div>`;
    showNotif('E2B sandbox unavailable — local simulation is running', 'info', 6000);
  }
  sec.setDone(`${output.split('\n').length} lines output`);
  memory.codeRuns.push({ code, output, live: !!result.live, error: result.error || '' });
  removeThinkingBar();
}

/* ── ANALYZE ───────────────────────────────── */
async function _toolAnalyze(action, memory) {
  showThinkingBar('Deep analysis…');
  const sec = addSection(`analyze-${memory.analyses.length}`, 'analyze', '📊',
    action.title || 'Evidence Analysis');

  const prompt = `${_buildSystemContext(memory)}

TASK: ${action.instruction}

${memory.codeRuns.length ? `CODE SIMULATION RESULTS:\n${memory.codeRuns.map((r,i)=>`[Run ${i+1}]: ${r.output.slice(0,400)}`).join('\n')}\n` : ''}

Write a deep analytical section in markdown. Be specific — reference actual place names, actual numbers from code output, actual search findings. Do NOT be generic. Numbers must trace back to real evidence from search or sandbox output; if data is missing or approximate, say so clearly.`;

  let text = '';
  text = await geminiStream(prompt, (_,f)=>{ streamMarkdown(sec.bodyEl,f); }, ()=>_abort, 8192);
  finalizeMarkdown(sec.bodyEl, text);
  sec.setDone();
  memory.analyses.push(text);
  removeThinkingBar();
}

/* ── MAP ───────────────────────────────────── */
async function _toolMap(action, memory) {
  if (!memory.hasMap) return;
  showThinkingBar('Building spatial simulation map…');
  const sec = addSection(`map-${Date.now()}`, 'map', '🗺️',
    action.title || 'Spatial Simulation Map');

  // Ask agent what type of map and any extra solution points from code output
  const mapPrompt = `${_buildSystemContext(memory)}

TASK: ${action.instruction}

CODE OUTPUTS: ${memory.codeRuns.map(r=>r.output.slice(0,300)).join('\n')}

Respond JSON only:
{
  "simType": "heatmap|route|solution",
  "analysis": "<markdown spatial analysis — 200 words — USE REAL PLACE NAMES — reference each location by name>",
  "solutionPoints": [ { "lat": 0, "lng": 0, "label": "name", "value": "detail" } ]
}

solutionPoints: locations the agent recommends (from analysis), may be same as or near user points.
analysis: MUST name specific places, districts, states from the map annotations — NOT generic text.`;

  let mapData = { simType: 'heatmap', analysis: '', solutionPoints: [] };
  try {
    const raw = await geminiAsk(mapPrompt, ()=>_abort, 2048);
    mapData   = JSON.parse(_extractJSON(raw));
  } catch(e) {
    mapData.analysis = `Spatial analysis for ${memory.annotations.map(a=>a.placeName||'#'+a.id).join(', ')}.`;
  }
  _chk();

  // Render map analysis as markdown
  const introEl = document.createElement('div');
  introEl.className = 'md-body';
  introEl.innerHTML = marked.parse(mapData.analysis || '');
  sec.bodyEl.appendChild(introEl);

  // Render the actual map
  const wrap = document.createElement('div');
  wrap.className = 'map-output-wrap';
  const simTypeLabel = (mapData.simType||'heatmap').toUpperCase();
  wrap.innerHTML = `<div class="map-out-label">🗺️ Spatial Simulation — ${simTypeLabel}</div>
    <div class="map-out-el" id="simMap-${Date.now()}" style="height:420px"></div>`;
  sec.bodyEl.appendChild(wrap);

  setTimeout(() => {
    renderSimMap(wrap, memory.annotations, mapData.simType||'heatmap', mapData.solutionPoints||[]);
  }, 500);

  sec.setDone(`${memory.annotations.length} locations · ${simTypeLabel}`);
  removeThinkingBar();
}

/* ── SCENARIOS ─────────────────────────────── */
async function _toolScenarios(action, memory) {
  showThinkingBar('Generating scenarios…');
  const sec = addSection('scenarios', 'scenario', '📋',
    action.title || 'Scenario Analysis');

  const searchSnippet = memory.searchResults.map(s=>s.context).join('\n').slice(0,500);
  const codeSnippet   = memory.codeRuns.map(r=>r.output).join('\n').slice(0,400);

  const prompt = `TASK: ${action.instruction}

Research question: "${memory.query}" | Domain: ${memory.domain}
${memory.mapCtx ? `Specific locations:\n${memory.mapCtx.slice(0,400)}` : ''}
Evidence: ${searchSnippet}
Simulation: ${codeSnippet}

Generate four scenario analyses. Keep each under 130 words with specific numbers.
Reference real place names if map context exists.

## BEST CASE SCENARIO
[Title]
[Analysis — specific percentages, numbers]
Key metrics: [KPI1: XX%], [KPI2: XX%], [KPI3: XX%]

## AVERAGE CASE SCENARIO
[Title]
[Analysis]
Key metrics: [KPI1: XX%], [KPI2: XX%], [KPI3: XX%]

## WORST CASE SCENARIO
[Title]
[Analysis]
Key metrics: [KPI1: XX%], [KPI2: XX%], [KPI3: XX%]

## CUSTOM SCENARIO
[Title: Adaptive Strategy]
[Analysis]
Key metrics: [KPI1: XX%], [KPI2: XX%], [KPI3: XX%]`;

  const scenText = await geminiAsk(prompt, ()=>_abort, 3000);
  _chk();

  const paramPrompt = `You are designing a custom scenario control panel for this research question.

Question: "${memory.query}"
Domain: ${memory.domain}

Return ONLY JSON with this structure:
{
  "parameters": [
    { "name": "budget", "label": "Budget change (%)", "type": "number", "default": 0, "min": -75, "max": 75 },
    { "name": "risk", "label": "Risk level (%)", "type": "number", "default": 35, "min": 0, "max": 100 }
  ]
}

Give 2-4 parameters that matter for this specific question and domain. They should be numeric values the user can type.`;

  let customParams = defaultCustomScenarioParams(memory.query, memory.domain);
  try {
    const raw = await geminiAsk(paramPrompt, ()=>_abort, 1024);
    const parsed = JSON.parse(_extractJSON(raw));
    if (parsed?.parameters?.length) customParams = parsed.parameters;
  } catch (_) {}
  memory.customScenarioConfig = customParams;

  memory.scenarios = {
    best:   parseScenarioSection(scenText,'BEST CASE SCENARIO'),
    avg:    parseScenarioSection(scenText,'AVERAGE CASE SCENARIO'),
    worst:  parseScenarioSection(scenText,'WORST CASE SCENARIO'),
    custom: parseScenarioSection(scenText,'CUSTOM SCENARIO'),
  };

  renderScenarioCards(sec.bodyEl, memory.scenarios, memory.customScenarioConfig);
  sec.setDone('4 scenarios');

  setTimeout(() => {
    document.getElementById('btnCustomScenario')?.addEventListener('click', () => {
      const p = document.getElementById('customScenarioInput')?.value.trim();
      const paramFields = [...document.querySelectorAll('.custom-param-input')];
      const paramValues = {};
      paramFields.forEach(f => {
        const key = f.dataset.name;
        if (key) paramValues[key] = Number(f.value || 0);
      });
      if (p || Object.keys(paramValues).length) _generateCustomScenario(p || 'Custom scenario', memory, paramValues);
    });
  }, 400);
  removeThinkingBar();
}

/* ── CHARTS ────────────────────────────────── */
async function _toolCharts(action, memory) {
  const scenarios = memory.scenarios || _fallbackScenarios();
  const sec = addSection('charts','sim','⚡', action.title||'Simulation & Charts');
  const chartData = buildChartData(scenarios, memory.domain, memory.query);
  memory.chartData = chartData;
  renderCharts(sec.bodyEl, chartData);
  renderSimGrid(sec.bodyEl, scenarios);
  sec.setDone('4 charts + metrics');
}

/* ── REPORT ────────────────────────────────── */
async function _toolReport(action, memory) {
  showThinkingBar('Writing comprehensive report…');
  const sec = addSection('report','report','📄', action.title||'Full Research Report');

  const searchSnippet = memory.searchResults.map(s=>s.context).join('\n').slice(0,800);
  const codeSnippet   = memory.codeRuns.map((r,i)=>`[Run ${i+1}]:\n${r.output.slice(0,350)}`).join('\n');
  const analysisSnip  = memory.analyses.join('\n').slice(0,700);

  const prompt = `You are SYTH. Write a full research report in markdown.

TASK: ${action.instruction}

RESEARCH QUESTION: ${memory.query}
DOMAIN: ${memory.domain}
${memory.mapCtx ? `SPECIFIC LOCATIONS (from user map):\n${memory.mapCtx}\n` : ''}
${memory.fileCtx ? `UPLOADED FILES:\n${memory.fileCtx.slice(0,500)}\n` : ''}
WEB EVIDENCE: ${searchSnippet}
SIMULATION OUTPUTS: ${codeSnippet}
ANALYSIS: ${analysisSnip}

Write the full report. Include all of:
# Research Report: ${memory.query.slice(0,60)}
## Executive Summary
## Background & Context  
## Methodology
## Key Findings
## Quantitative Analysis (use numbers from simulation)
## Best / Average / Worst Case Analysis
${memory.hasMap ? '## Location-Specific Analysis (reference each place by name)' : ''}
## Risks & Uncertainties
## Recommendations
## Limitations
## Conclusion
## References

IMPORTANT: If map locations exist, write about them BY NAME (e.g. "Nashik district", "Pune region") — never just "the locations". Use real place names throughout.
All numbers must be tied to evidence from the search results, files, or sandbox output. If data is weak or approximate, label it as an estimate and say why.
Target: 1000+ words. Use tables and bullet points.`;

  let text = '';
  text = await geminiStream(prompt, (_,f)=>{ streamMarkdown(sec.bodyEl,f); }, ()=>_abort, 16384);
  finalizeMarkdown(sec.bodyEl, text);
  memory.reportText = text;
  sec.setDone(`${text.split(/\s+/).length} words`);
  removeThinkingBar();
}

/* ── CUSTOM DYNAMIC BOX ─────────────────────── */
async function _toolCustom(action, memory) {
  const sec = addSection(`custom-${Date.now()}`, 'sim', action.iconEmoji || '✦', action.title || 'Custom Analysis');
  const prompt = `${_buildSystemContext(memory)}

TASK: ${action.instruction}

Create a focused analytical result box for this question. This should not be a generic dashboard card. It should be a specific insight object with 1-2 key findings, supported by evidence, and include a short recommendation or interpretation.
Return markdown only.
Prefer a short title, 2-4 bullet points, and a clear conclusion.`;
  const text = await geminiAsk(prompt, ()=>_abort, 2048);
  finalizeMarkdown(sec.bodyEl, text);
  sec.setDone();
}

/* ── CHAT ANSWER ────────────────────────────── */
async function _toolChat(action, memory) {
  const sec = addSection(`chat-${Date.now()}`, 'plan', '💬', action.title || 'Direct Answer');
  const prompt = `${_buildSystemContext(memory)}

TASK: ${action.instruction}

Give a clear direct answer to the user's question in plain conversational language.
Use actual evidence from web search, files, code outputs, and map annotations. If a fact is approximate or not directly confirmed, say so.
Keep it concise but useful: 1) answer directly, 2) explain what evidence was checked, 3) mention any uncertainty or next step.
Return markdown with a short summary and 2-4 bullet points.`;
  const text = await geminiAsk(prompt, ()=>_abort, 2048);
  finalizeMarkdown(sec.bodyEl, text);
  sec.setDone();
  memory.answerText = text;
}

/* ── NOTE ──────────────────────────────────── */
async function _toolNote(action, memory) {
  const sec = addSection(`note-${Date.now()}`, 'plan', '💡', action.title||'Agent Observation');
  const prompt = `${_buildSystemContext(memory)}\n\nTask: ${action.instruction}\nWrite a brief markdown observation (100 words max).`;
  const text   = await geminiAsk(prompt, ()=>_abort, 512);
  finalizeMarkdown(sec.bodyEl, text);
  sec.setDone();
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */

function _buildSystemContext(memory) {
  const parts = [
    `RESEARCH QUESTION: "${memory.query}"`,
    `DOMAIN: ${memory.domain}`,
  ];
  if (memory.mapCtx)  parts.push(`\nUSER MAP ANNOTATIONS (with real place names):\n${memory.mapCtx}`);
  if (memory.mapJSON) parts.push(`\nMAP JSON:\n${memory.mapJSON}`);
  if (memory.fileCtx) parts.push(`\nUPLOADED FILES:\n${memory.fileCtx.slice(0,800)}`);
  return parts.join('\n');
}

function _extractJSON(text) {
  // Try to find JSON object in text
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : text.trim();
}

function _chk() { if (_abort) throw new Error('__ABORT__'); }

function _defaultActions(memory) {
  const actions = [
    { tool:'search',    title:'Web Research',               instruction:`Search for: "${memory.query}" ${memory.domain} research evidence, live context, and grounded data for the question` },
    { tool:'code',      title:'Numerical Simulation',       instruction:`Compute grounded numerical simulation for: ${memory.query}. Use numpy and requests if needed. Print best/avg/worst case results and any live weather, pricing, or public data values when relevant. ${memory.mapJSON ? 'Use these map coordinates: ' + memory.mapJSON.slice(0,300) : ''}` },
    { tool:'analyze',   title:'Evidence Analysis',          instruction:`Analyse all findings for: ${memory.query}. Be specific with numbers and cite actual evidence. ${memory.mapCtx ? 'Reference each location by name.' : ''}` },
    { tool:'custom',    title:'Domain-Specific Insight Box', instruction:`Create one additional custom analytical box tailored to "${memory.query}" in the ${memory.domain} domain. It should answer the user’s unique situation rather than repeating generic dashboard values.` },
    { tool:'scenarios', title:'Scenario Analysis',          instruction:`Generate 4 scenarios for: ${memory.query}. Base percentages on actual evidence and label estimates when data is approximate.` },
    { tool:'charts',    title:'Simulation Charts',          instruction:'Build comparison charts and metric grid from grounded simulation outputs only, using the actual question context.' },
    { tool:'report',    title:'Comprehensive Report',       instruction:`Write full report for: ${memory.query}. ${memory.hasMap ? 'Must include per-location analysis by place name.' : ''}` },
    { tool:'chat',      title:'Direct Answer',              instruction:`Answer the user’s question plainly in chat style using evidence from search, code, files, and map annotations. Mention uncertainty explicitly when numbers are approximate.` },
  ];
  if (memory.hasMap) {
    actions.splice(2, 0, {
      tool:'map', title:'Spatial Analysis Map',
      instruction:`Analyse these specific locations: ${memory.annotations.map(a=>a.placeName||a.state||('Lat '+a.latlng.lat.toFixed(3))).join(', ')}. Show heatmap/route. Reference each location by its real name.`,
    });
  }
  return actions;
}

function _fallbackScenarios() {
  return {
    best:   { title:'Optimistic Outcome', body:'Best case analysis pending.', metrics:[{name:'KPI',value:'80%',pct:80}] },
    avg:    { title:'Expected Outcome',   body:'Average case analysis pending.', metrics:[{name:'KPI',value:'55%',pct:55}] },
    worst:  { title:'Pessimistic Outcome',body:'Worst case analysis pending.', metrics:[{name:'KPI',value:'25%',pct:25}] },
    custom: { title:'Custom Strategy',    body:'Custom case pending.', metrics:[{name:'KPI',value:'65%',pct:65}] },
  };
}

async function _generateCustomScenario(prompt, memory, paramValues = {}) {
  const btn = document.getElementById('btnCustomScenario');
  if (btn) { btn.textContent='⏳…'; btn.disabled=true; }
  try {
    const paramsText = Object.entries(paramValues).length
      ? `\nCustom parameter values:\n${Object.entries(paramValues).map(([k,v]) => `${k}: ${v}`).join('\n')}`
      : '';

    const p = `Research: "${memory.query}"\nCustom: "${prompt}"${paramsText}\n\nUse the supplied values to calculate a custom case. If a parameter changes cost, risk, or performance, adjust the results logically and produce realistic percentages.\n\nFormat:\n## CUSTOM SCENARIO\n[Title]\n[Analysis]\nKey metrics: [KPI1: XX%], [KPI2: XX%], [KPI3: XX%]`;
    const r  = await geminiAsk(p, null, 1024);
    const sc = parseScenarioSection(r,'CUSTOM SCENARIO');
    if (Object.keys(paramValues).length) {
      sc.title = `${sc.title || 'Custom Strategy'} (${Object.entries(paramValues).map(([k,v]) => `${k}=${v}`).join(', ')})`;
    }
    updateCustomCard(sc);
    if (memory.scenarios) memory.scenarios.custom = sc;
    if (currentExperiment) currentExperiment.scenarios.custom = sc;
    showNotif('Custom scenario updated!','success');
  } catch(e) { showNotif('Error: '+e.message.slice(0,60),'error'); }
  finally { if (btn) { btn.textContent='Calculate'; btn.disabled=false; } }
}
