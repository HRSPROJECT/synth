/* ═══════════════════════════════════════════════
   SYTH — charts.js
   Chart.js charts, scenario cards, sim grid,
   map simulation output section
   ═══════════════════════════════════════════════ */
'use strict';

const _charts = {};
const CC = {
  Best:    { bg: 'rgba(0,255,136,.15)',  border: '#00ff88' },
  Average: { bg: 'rgba(0,212,255,.15)',  border: '#00d4ff' },
  Worst:   { bg: 'rgba(255,68,102,.15)', border: '#ff4466' },
  Custom:  { bg: 'rgba(255,204,0,.15)',  border: '#ffcc00' },
};

function destroyCharts() {
  Object.values(_charts).forEach(c => c?.destroy?.());
  Object.keys(_charts).forEach(k => delete _charts[k]);
}

/* ── CHART OPTIONS ────────────────────────────────────────────────── */
function _opts(type) {
  const o = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 900, easing: 'easeInOutQuart' },
    plugins: {
      legend: { labels: { color: '#8899cc', font: { size: 10 }, boxWidth: 12, padding: 10 } },
      tooltip: { backgroundColor: 'rgba(7,13,28,.95)', borderColor: 'rgba(26,45,90,.8)', borderWidth: 1, titleColor: '#e8f0ff', bodyColor: '#8899cc', padding: 10 },
    },
  };
  if (type === 'radar') {
    o.scales = { r: { grid: { color: 'rgba(26,45,90,.8)' }, pointLabels: { color: '#8899cc', font: { size: 10 } }, ticks: { color: '#556080', backdropColor: 'transparent', font: { size: 9 }, stepSize: 20 }, suggestedMin: 0, suggestedMax: 100 } };
  } else {
    o.scales = {
      x: { grid: { color: 'rgba(26,45,90,.5)' }, ticks: { color: '#556080', font: { size: 10 } } },
      y: { grid: { color: 'rgba(26,45,90,.5)' }, ticks: { color: '#556080', font: { size: 10 } }, beginAtZero: true },
    };
  }
  return o;
}

/* ── BUILD CHART DATA ─────────────────────────────────────────────── */
function getDomainMetricLabels(domain = 'General', query = '') {
  const q = (query || '').toLowerCase();
  const labelMap = {
    Agriculture: ['Yield', 'Water Use', 'Input Cost', 'Soil Health', 'Profitability'],
    Energy: ['Efficiency', 'Generation', 'Cost', 'Reliability', 'Carbon'],
    Environment: ['Air Quality', 'Water Risk', 'Ecosystem', 'Emissions', 'Resilience'],
    Engineering: ['Performance', 'Reliability', 'Efficiency', 'Cost', 'Safety'],
    Education: ['Engagement', 'Completion', 'Retention', 'Cost', 'Outcome'],
    Transport: ['Travel Time', 'Fuel Use', 'Safety', 'Cost', 'Reliability'],
    Economics: ['Growth', 'Cost', 'Risk', 'Demand', 'Stability'],
    Health: ['Outcomes', 'Access', 'Cost', 'Safety', 'Efficiency'],
    General: ['Impact', 'Efficiency', 'Cost', 'Risk', 'Sustainability'],
  };

  if (q.includes('weather') || q.includes('rain') || q.includes('climate')) {
    return ['Temperature', 'Rainfall', 'Risk', 'Yield', 'Resilience'];
  }
  if (q.includes('solar') || q.includes('power') || q.includes('energy')) {
    return ['Efficiency', 'Output', 'Cost', 'Reliability', 'Carbon'];
  }
  if (q.includes('farm') || q.includes('crop') || q.includes('irrigation')) {
    return ['Yield', 'Water Use', 'Soil Health', 'Cost', 'Profit'];
  }

  return labelMap[domain] || labelMap.General;
}

function buildChartData(scenarios, domain = 'General', query = '') {
  const labels = getDomainMetricLabels(domain, query);
  const cases  = ['Best', 'Average', 'Worst', 'Custom'];
  const texts  = [scenarios.best?.body||'', scenarios.avg?.body||'', scenarios.worst?.body||'', scenarios.custom?.body||''];
  const bases  = { Best:[82,74,18,88,80], Average:[62,57,36,65,60], Worst:[25,32,76,28,35], Custom:[55,52,40,60,58] };

  function exPct(text, i, [lo,hi]) {
    const ns = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m=>parseFloat(m[1]));
    const v  = ns[i];
    return (v>0 && v<=100) ? v : lo + Math.random()*(hi-lo);
  }

  const compDS = cases.map((c,ci) => ({
    label: c, data: labels.map((_,li) => exPct(texts[ci], li, [bases[c][li] - 18, bases[c][li] + 8] || [10,90])),
    backgroundColor: CC[c].bg, borderColor: CC[c].border, borderWidth: 2, borderRadius: 4,
  }));

  const slopes = { Best:2.7, Average:1.1, Worst:-1.9, Custom:1.5 };
  const bpcts  = { Best:78, Average:58, Worst:27, Custom:62 };
  const trendDS = cases.map(c => ({
    label: c,
    data: Array.from({length:10}, (_,i) => clamp(bpcts[c]+slopes[c]*i+(Math.random()-.5)*6, 0, 100)),
    borderColor: CC[c].border, backgroundColor: CC[c].bg, tension:.4, fill:false, pointRadius:3, pointHoverRadius:6,
  }));

  const radarDS = cases.map(c => ({
    label: c, data: labels.map((_, li) => Math.max(0, Math.min(100, bases[c][li] + (Math.random()*18 - 9)))),
    borderColor: CC[c].border, backgroundColor: CC[c].bg, pointBackgroundColor: CC[c].border, pointRadius:4,
  }));

  const distDS = [
    { label:'Best',  data:[0,1,2,4,8,15,22,20,12,5].map(v=>v+(Math.random()*3-1.5)), backgroundColor:CC.Best.bg,  borderColor:CC.Best.border,  borderWidth:1 },
    { label:'Worst', data:[5,12,20,22,15,8,4,2,1,0].map(v=>v+(Math.random()*3-1.5)), backgroundColor:CC.Worst.bg, borderColor:CC.Worst.border, borderWidth:1 },
  ];

  return {
    comparison: { labels, datasets: compDS },
    trend:      { labels: Array.from({length:10},(_,i)=>`T${i}`), datasets: trendDS },
    radar:      { labels, datasets: radarDS },
    dist:       { labels: Array.from({length:10},(_,i)=>`${i*10}-${i*10+10}%`), datasets: distDS },
  };
}

/* ── RENDER CHARTS INTO A SECTION BODY ───────────────────────────── */
function renderCharts(bodyEl, chartData) {
  if (!bodyEl) return;
  const grid = document.createElement('div');
  grid.className = 'charts-grid';
  bodyEl.appendChild(grid);

  const defs = [
    { id:'chart-comp',  title:'Scenario Comparison',      type:'bar',   data:chartData.comparison },
    { id:'chart-trend', title:'Performance Over Time',    type:'line',  data:chartData.trend },
    { id:'chart-radar', title:'Multi-Dimension Analysis', type:'radar', data:chartData.radar },
    { id:'chart-dist',  title:'Outcome Distribution',     type:'bar',   data:chartData.dist },
  ];

  destroyCharts();
  defs.forEach(def => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `<div class="chart-title">${def.title}</div><div class="chart-wrap"><canvas id="${def.id}"></canvas></div>`;
    grid.appendChild(card);
    const ctx = document.getElementById(def.id)?.getContext('2d');
    if (ctx) _charts[def.id] = new Chart(ctx, { type: def.type, data: def.data, options: _opts(def.type) });
  });
}

/* ── RENDER SCENARIO CARDS ────────────────────────────────────────── */
function defaultCustomScenarioParams(query = '', domain = 'General') {
  const q = (query || '').toLowerCase();
  const base = [
    { name: 'budget', label: 'Budget change (%)', type: 'number', default: 0, min: -75, max: 75 },
    { name: 'risk', label: 'Risk level (%)', type: 'number', default: 50, min: 0, max: 100 },
    { name: 'demand', label: 'Demand shift (%)', type: 'number', default: 10, min: -50, max: 100 },
  ];

  if (q.includes('weather') || q.includes('rain') || q.includes('climate')) {
    return [
      { name: 'rainfall', label: 'Rainfall change (%)', type: 'number', default: 0, min: -60, max: 60 },
      { name: 'temperature', label: 'Temperature change (°C)', type: 'number', default: 0, min: -10, max: 15 },
      { name: 'risk', label: 'Risk severity (%)', type: 'number', default: 35, min: 0, max: 100 },
    ];
  }
  if (q.includes('solar') || q.includes('energy') || q.includes('power')) {
    return [
      { name: 'capacity', label: 'Capacity change (%)', type: 'number', default: 10, min: -30, max: 80 },
      { name: 'cost', label: 'Cost change (%)', type: 'number', default: 0, min: -40, max: 60 },
      { name: 'efficiency', label: 'Efficiency change (%)', type: 'number', default: 5, min: -20, max: 40 },
    ];
  }
  if (q.includes('irrigation') || q.includes('crop') || q.includes('farm')) {
    return [
      { name: 'water', label: 'Water availability (%)', type: 'number', default: 0, min: -50, max: 50 },
      { name: 'yield', label: 'Yield change (%)', type: 'number', default: 10, min: -30, max: 60 },
      { name: 'cost', label: 'Input cost change (%)', type: 'number', default: 0, min: -40, max: 70 },
    ];
  }

  return base;
}

function renderScenarioCards(bodyEl, scenarios, params = []) {
  if (!bodyEl) return;

  const promptDiv = document.createElement('div');
  promptDiv.className = 'custom-prompt-row';
  promptDiv.innerHTML = `
    <input type="text" id="customScenarioInput" placeholder="🎯 Describe a custom scenario… e.g. '40% lower budget, 20% higher demand, higher soil stress'"/>
    <button class="btn-custom" id="btnCustomScenario">Calculate</button>`;
  bodyEl.appendChild(promptDiv);

  const paramWrap = document.createElement('div');
  paramWrap.className = 'custom-param-grid';
  const schema = (params && params.length) ? params : defaultCustomScenarioParams();
  paramWrap.innerHTML = schema.map((p) => `
    <label class="custom-param-field">
      <span>${escHtml(p.label || p.name)}</span>
      <input type="number" class="custom-param-input" data-name="${escHtml(p.name)}" value="${Number(p.default ?? 0)}" min="${Number(p.min ?? -100)}" max="${Number(p.max ?? 100)}" step="1"/>
    </label>
  `).join('');
  bodyEl.appendChild(paramWrap);

  const grid = document.createElement('div');
  grid.className = 'scenarios-grid';
  grid.id        = 'scenariosGrid';
  bodyEl.appendChild(grid);
  _buildScenarioCards(grid, scenarios);
}

function _buildScenarioCards(grid, scenarios) {
  const defs = [
    { key:'best',  cls:'best',   label:'✅ Best Case',    icon:'🚀' },
    { key:'avg',   cls:'avg',    label:'⚖️ Average Case', icon:'📊' },
    { key:'worst', cls:'worst',  label:'⚠️ Worst Case',  icon:'🔴' },
    { key:'custom',cls:'custom', label:'🎯 Custom',       icon:'⭐' },
  ];
  grid.innerHTML = '';
  defs.forEach(d => {
    const sc   = scenarios[d.key] || {};
    const card = document.createElement('div');
    card.className = `scenario-card ${d.cls}`;
    card.id        = `sc-${d.key}`;
    card.innerHTML = `
      <div class="sc-label">${d.label}</div>
      <div class="sc-title">${d.icon} ${escHtml(sc.title||d.label)}</div>
      <div class="sc-body">${typeof marked!=='undefined'?marked.parse(sc.body||''):escHtml(sc.body||'')}</div>
      <div class="sc-metrics">${(sc.metrics||[]).map(m=>`<span class="metric-pill">${escHtml(m.name)}: ${escHtml(m.value)}</span>`).join('')}</div>`;
    grid.appendChild(card);
  });
}

function updateCustomCard(sc) {
  const card = document.getElementById('sc-custom');
  if (!card) return;
  card.querySelector('.sc-title').innerHTML  = `⭐ ${escHtml(sc.title||'Custom')}`;
  card.querySelector('.sc-body').innerHTML   = typeof marked!=='undefined'?marked.parse(sc.body||''):escHtml(sc.body||'');
  card.querySelector('.sc-metrics').innerHTML= (sc.metrics||[]).map(m=>`<span class="metric-pill">${escHtml(m.name)}: ${escHtml(m.value)}</span>`).join('');
}

/* ── SIMULATION METRICS GRID ─────────────────────────────────────── */
function renderSimGrid(bodyEl, scenarios) {
  if (!bodyEl) return;
  const grid = document.createElement('div');
  grid.className = 'sim-grid';
  const cols = [
    { key:'best',  cls:'best',  label:'Best Case' },
    { key:'avg',   cls:'avg',   label:'Average' },
    { key:'worst', cls:'worst', label:'Worst Case' },
    { key:'custom',cls:'custom',label:'Custom' },
  ];
  cols.forEach(col => {
    const sc      = scenarios[col.key]||{};
    const metrics = sc.metrics?.length ? sc.metrics : _defMetrics(col.key);
    const div = document.createElement('div');
    div.className = `sim-col ${col.cls}`;
    div.innerHTML = `<div class="sim-col-label">${col.label}</div>` +
      metrics.map(m=>`<div class="sim-metric">
        <div class="sim-metric-name">${escHtml(m.name)}</div>
        <div class="sim-metric-val">${escHtml(m.value)}</div>
        <div class="sim-metric-bar"><div class="sim-metric-fill" style="width:0%" data-pct="${m.pct}"></div></div>
      </div>`).join('');
    grid.appendChild(div);
  });
  bodyEl.appendChild(grid);
  // animate bars
  requestAnimationFrame(() => setTimeout(() => {
    grid.querySelectorAll('.sim-metric-fill').forEach(b => { b.style.width = `${b.dataset.pct}%`; });
  }, 200));
}

/* ── MAP SIMULATION SECTION ──────────────────────────────────────── */
function renderMapSimSection(bodyEl, annotations, simType, analysisText) {
  if (!bodyEl || !annotations.length) return;
  const intro = document.createElement('div');
  intro.className = 'md-body';
  intro.innerHTML = typeof marked!=='undefined'
    ? marked.parse(analysisText || 'Simulation map showing spatial analysis of marked locations.')
    : escHtml(analysisText||'');
  bodyEl.appendChild(intro);

  const wrap = document.createElement('div');
  wrap.className = 'map-output-wrap';
  wrap.innerHTML = `<div class="map-out-label">🗺️ Spatial Simulation — ${simType.toUpperCase()}</div>
    <div class="map-out-el" id="simMapEl"></div>`;
  bodyEl.appendChild(wrap);

  setTimeout(() => {
    renderSimMap(wrap, annotations, simType);
  }, 400);
}

/* ── HELPERS ─────────────────────────────────────────────────────── */
function _defMetrics(key) {
  const r = { best:[70,95], avg:[45,70], worst:[10,38], custom:[55,87] }[key]||[40,70];
  return ['Efficiency','Cost Saving','Success Rate','Sustainability'].map(n => {
    const pct = Math.round(r[0]+Math.random()*(r[1]-r[0]));
    return { name:n, value:`${pct}%`, pct };
  });
}

/* ── PARSE SCENARIO SECTION FROM LLM TEXT ───────────────────────── */
function parseScenarioSection(text, header) {
  const esc = header.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m   = text.match(new RegExp(`##\\s*${esc}([\\s\\S]*?)(?=##\\s*[A-Z]|$)`,'i'));
  if (!m) return { title:header, body:'Analysis pending.', metrics:_defMetrics('avg') };
  const section = m[1].trim();
  const lines   = section.split('\n').filter(Boolean);
  const title   = lines[0]?.replace(/^[*#\-]+\s*/,'').trim()||header;
  const body    = lines.slice(1).join('\n').trim();
  const pcts    = [...section.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(x=>parseFloat(x[1]));
  const ranges  = { BEST:[65,95], AVERAGE:[40,70], WORST:[10,38], CUSTOM:[50,85] };
  const rk      = Object.keys(ranges).find(k=>header.toUpperCase().includes(k))||'AVERAGE';
  const [lo,hi] = ranges[rk];
  const metrics = ['Primary KPI','Efficiency','Risk Level'].map((n,i)=>{
    const pct = (pcts[i]>0&&pcts[i]<=100)?Math.round(pcts[i]):Math.round(lo+Math.random()*(hi-lo));
    return { name:n, value:`${pct}%`, pct };
  });
  return { title, body, metrics };
}
