/* ═══════════════════════════════════════════════
   SYTH — map.js
   Fix: reverse geocode every annotation to get
   real place names, district, state, country.
   Agent gets structured JSON with real names,
   not just raw coordinates.
   ═══════════════════════════════════════════════ */
'use strict';

let _inputMap    = null;
let _activeTool  = 'marker';
let _annotations = [];   // { type, latlng, note, id, placeName, district, state, country }
let _annId       = 0;

/* ── INIT INPUT MAP ─────────────────────────────────────────────── */
function initInputMap() {
  if (_inputMap) return;
  // Default center: India
  _inputMap = L.map('inputMap', { zoomControl: true }).setView([20.5937, 78.9629], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19,
  }).addTo(_inputMap);
  _inputMap.on('click', _handleMapClick);
  setTimeout(() => _inputMap.invalidateSize(), 150);
}

function setMapTool(tool) {
  _activeTool = tool;
  const hints = {
    marker: '📍 Click to drop a location marker',
    note:   '📝 Click to place an annotated note',
    zone:   '⬡ Click to mark a zone or area',
  };
  const el = document.getElementById('mapHint');
  if (el) el.textContent = hints[tool] || 'Click on the map';
}

function clearMapAnnotations() {
  _annotations = [];
  _inputMap?.eachLayer(l => { if (l._sythAnn) _inputMap.removeLayer(l); });
  _renderAnnotationList();
}

/* ── MAP CLICK — reverse geocode immediately ──────────────────────── */
async function _handleMapClick(e) {
  const { lat, lng } = e.latlng;
  const id  = ++_annId;
  let note  = '';
  if (_activeTool === 'note') note = prompt('Add a note for this location:') || '';

  // Placeholder while we geocode
  const ann = { type: _activeTool, latlng: { lat, lng }, note, id,
    placeName: `Approximate location (${lat.toFixed(4)}, ${lng.toFixed(4)})`, district: '', state: '', country: '', geocoded: false, confidence: 'approximate' };
  _annotations.push(ann);
  _addMapMarker(ann);
  _renderAnnotationList();

  // Reverse geocode using Nominatim (OSM)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      ann.placeName = data.display_name?.split(',')[0] || ann.placeName;
      ann.district  = addr.county || addr.district || addr.city_district || '';
      ann.state     = addr.state || '';
      ann.country   = addr.country || '';
      ann.fullAddr  = data.display_name || '';
      ann.geocoded  = !!(data.display_name && (addr.city || addr.town || addr.village || addr.county || addr.state || addr.country));
      ann.confidence = ann.geocoded ? 'geocoded' : 'approximate';
      if (!ann.geocoded) ann.placeName = `Approximate area near (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      // Update marker popup with real name
      _inputMap?.eachLayer(l => {
        if (l._annId === id && l.getPopup) {
          l.setPopupContent(_popupHTML(ann));
        }
      });
      _renderAnnotationList();
    }
  } catch(e) {
    console.warn('[SYTH map] Nominatim error:', e.message);
  }
}

/* ── ADD MARKER TO MAP ────────────────────────────────────────────── */
function _addMapMarker(ann) {
  const cols  = { marker: '#00d4ff', note: '#ffcc00', zone: '#00ff88' };
  const emojis= { marker: '📍', note: '📝', zone: '⬡' };
  const col   = cols[ann.type] || '#00d4ff';
  const icon  = L.divIcon({
    className: '',
    html: `<div style="background:${col};color:#fff;border-radius:50%;width:30px;height:30px;
      display:flex;align-items:center;justify-content:center;font-size:15px;
      border:2px solid rgba(255,255,255,.4);box-shadow:0 0 10px ${col}88;
      cursor:pointer;">${emojis[ann.type]}</div>
      <div style="text-align:center;font-size:9px;color:${col};margin-top:2px;
      white-space:nowrap;font-weight:700;text-shadow:0 0 6px #000;">#${ann.id}</div>`,
    iconSize: [30, 42], iconAnchor: [15, 42],
  });
  const marker = L.marker([ann.latlng.lat, ann.latlng.lng], { icon });
  marker._sythAnn = true;
  marker._annId   = ann.id;
  marker.bindPopup(_popupHTML(ann), { maxWidth: 280 });
  marker.addTo(_inputMap);
}

function _popupHTML(ann) {
  return `<div style="font-family:sans-serif;font-size:12px;line-height:1.6;min-width:200px;">
    <strong style="font-size:13px;">${ann.type.toUpperCase()} #${ann.id}</strong><br/>
    ${ann.placeName ? `<span style="color:#0066cc;font-weight:600">${ann.placeName}</span><br/>` : ''}
    ${ann.district  ? `<span style="color:#555">District: ${ann.district}</span><br/>` : ''}
    ${ann.state     ? `<span style="color:#555">State: ${ann.state}</span><br/>` : ''}
    ${ann.country   ? `<span style="color:#555">Country: ${ann.country}</span><br/>` : ''}
    <span style="color:#999;font-size:10px">Lat: ${ann.latlng.lat.toFixed(5)}, Lng: ${ann.latlng.lng.toFixed(5)}</span>
    ${ann.note ? `<br/><em style="color:#333">"${ann.note}"</em>` : ''}
  </div>`;
}

/* ── RENDER ANNOTATION LIST ───────────────────────────────────────── */
function _renderAnnotationList() {
  const c = document.getElementById('mapAnnotations');
  if (!c) return;
  if (!_annotations.length) { c.innerHTML = ''; return; }
  c.innerHTML = _annotations.map(a => `
    <div class="map-ann-item">
      <div class="map-ann-icon">${a.type==='marker'?'📍':a.type==='note'?'📝':'⬡'}</div>
      <div class="map-ann-body">
        <div class="map-ann-title">${a.geocoded ? escHtml(a.placeName) : `#${a.id} (locating…)`}</div>
        ${a.district||a.state ? `<div class="map-ann-coords">${[a.district,a.state,a.country].filter(Boolean).join(', ')}</div>` : ''}
        <div class="map-ann-coords">Lat ${a.latlng.lat.toFixed(5)}, Lng ${a.latlng.lng.toFixed(5)}</div>
        ${a.note ? `<div class="map-ann-note">"${escHtml(a.note)}"</div>` : ''}
      </div>
      <span class="map-ann-remove" data-id="${a.id}">✕</span>
    </div>`).join('');

  c.querySelectorAll('.map-ann-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      _annotations = _annotations.filter(a => a.id !== id);
      _inputMap?.eachLayer(l => { if (l._annId === id) _inputMap.removeLayer(l); });
      _renderAnnotationList();
    });
  });
}

/* ── RICH CONTEXT FOR AGENT (with real place names) ───────────────── */
function getMapContext() {
  if (!_annotations.length) return '';
  const lines = [
    '=== USER MAP ANNOTATIONS ===',
    `Total locations marked: ${_annotations.length}`,
    '',
  ];
  _annotations.forEach(a => {
    lines.push(`LOCATION #${a.id} [${a.type.toUpperCase()}]`);
    lines.push(`  Confidence: ${a.geocoded ? 'geocoded' : 'approximate'}`);
    if (a.placeName) lines.push(`  Place     : ${a.placeName}`);
    if (a.district)  lines.push(`  District  : ${a.district}`);
    if (a.state)     lines.push(`  State     : ${a.state}`);
    if (a.country)   lines.push(`  Country   : ${a.country}`);
    if (a.fullAddr)  lines.push(`  Full addr : ${a.fullAddr}`);
    lines.push(`  Coords    : Lat ${a.latlng.lat.toFixed(6)}, Lng ${a.latlng.lng.toFixed(6)}`);
    if (a.note)      lines.push(`  User note : "${a.note}"`);
    lines.push('');
  });
  lines.push('IMPORTANT: ALL analysis, simulation, and recommendations must be SPECIFIC to these');
  lines.push('exact locations. Reference places by their real names (not just coordinates).');
  lines.push('Do NOT mention unrelated regions, states, or countries.');
  return lines.join('\n');
}

/* ── STRUCTURED JSON FOR CODE SANDBOX ────────────────────────────── */
function getMapJSON() {
  return JSON.stringify(_annotations.map(a => ({
    id:        a.id,
    type:      a.type,
    place:     a.placeName || null,
    district:  a.district  || null,
    state:     a.state     || null,
    country:   a.country   || null,
    lat:       parseFloat(a.latlng.lat.toFixed(6)),
    lng:       parseFloat(a.latlng.lng.toFixed(6)),
    note:      a.note      || null,
    confidence: a.geocoded ? 'geocoded' : 'approximate',
  })), null, 2);
}

function hasMapAnnotations() { return _annotations.length > 0; }
function getAnnotations()    { return [..._annotations]; }

/* ── RENDER SIMULATION MAP OUTPUT ────────────────────────────────── */
function renderSimMap(container, annotations, simType = 'heatmap', agentPoints = []) {
  if (!container) return;
  const mapEl = container.querySelector('.map-out-el');
  if (!mapEl) return;

  // Center and zoom to fit all annotations
  const lats = annotations.map(a => a.latlng.lat);
  const lngs = annotations.map(a => a.latlng.lng);
  const center = annotations.length
    ? [(Math.min(...lats)+Math.max(...lats))/2, (Math.min(...lngs)+Math.max(...lngs))/2]
    : [20.5937, 78.9629];
  const zoom = annotations.length ? _calcZoom(lats, lngs) : 5;

  const map = L.map(mapEl, { zoomControl: true }).setView(center, zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19,
  }).addTo(map);

  // Original annotation markers
  annotations.forEach(a => {
    const col  = a.type==='marker'?'#00d4ff':a.type==='note'?'#ffcc00':'#00ff88';
    const icon = L.divIcon({
      className: '',
      html: `<div style="background:${col};border-radius:50%;width:24px;height:24px;
        display:flex;align-items:center;justify-content:center;font-size:13px;
        border:2px solid rgba(255,255,255,.4);box-shadow:0 0 8px ${col}66;">
        ${a.type==='marker'?'📍':a.type==='note'?'📝':'⬡'}</div>`,
      iconSize:[24,24], iconAnchor:[12,12],
    });
    L.marker([a.latlng.lat,a.latlng.lng], {icon})
      .bindPopup(`<b>${a.placeName||'#'+a.id}</b><br/>${[a.district,a.state].filter(Boolean).join(', ')}<br/>${a.note||''}`)
      .addTo(map);
  });

  // Heatmap overlay
  if ((simType==='heatmap'||simType==='intensity') && annotations.length) {
    const heat = annotations.flatMap(a => {
      const pts = [];
      // Cluster points around the real location
      for (let i=0; i<60; i++) {
        const r     = Math.random()*0.5;
        const theta = Math.random()*2*Math.PI;
        pts.push([
          a.latlng.lat + r*Math.cos(theta)*0.3,
          a.latlng.lng + r*Math.sin(theta)*0.3,
          Math.random(),
        ]);
      }
      return pts;
    });
    if (typeof L.heatLayer !== 'undefined') {
      L.heatLayer(heat, { radius:40, blur:25, maxZoom:12,
        gradient:{0.2:'#00008b',0.4:'#0044ff',0.6:'#00d4ff',0.8:'#00ff88',1.0:'#ffcc00'}
      }).addTo(map);
    }
  }

  // Route between points
  if ((simType==='route'||simType==='path') && annotations.length >= 2) {
    const ll = annotations.map(a => [a.latlng.lat,a.latlng.lng]);
    L.polyline(ll, {color:'#00d4ff',weight:3,opacity:.9,dashArray:'8 5'}).addTo(map);
    ll.forEach((p,i) => {
      const ic = L.divIcon({
        className:'',
        html:`<div style="background:${i===0?'#00ff88':i===ll.length-1?'#ff4466':'#00d4ff'};
          color:#fff;border-radius:50%;width:22px;height:22px;
          display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${i+1}</div>`,
        iconSize:[22,22],iconAnchor:[11,11],
      });
      L.marker(p,{icon:ic}).addTo(map);
    });
  }

  // Agent-specified solution points from code output
  if (agentPoints.length) {
    agentPoints.forEach((pt,i) => {
      if (!pt.lat||!pt.lng) return;
      const ic = L.divIcon({
        className:'',
        html:`<div style="background:#00ff88;color:#000;border-radius:8px;padding:3px 8px;
          font-size:10px;font-weight:700;white-space:nowrap;
          box-shadow:0 0 10px #00ff8888;">✓ ${pt.label||'Point '+(i+1)}</div>`,
        iconAnchor:[0,0],
      });
      L.marker([pt.lat,pt.lng],{icon:ic})
        .bindPopup(`<b>${pt.label||'Result'}</b><br/>${pt.value||''}`)
        .addTo(map);
    });
  }

  setTimeout(() => map.invalidateSize(), 300);
  return map;
}

/* ── CALC ZOOM ────────────────────────────────────────────────────── */
function _calcZoom(lats, lngs) {
  const latSpan = Math.max(...lats) - Math.min(...lats);
  const lngSpan = Math.max(...lngs) - Math.min(...lngs);
  const span    = Math.max(latSpan, lngSpan);
  if (span < 0.1) return 13;
  if (span < 0.5) return 11;
  if (span < 1)   return 10;
  if (span < 3)   return 9;
  if (span < 6)   return 8;
  if (span < 12)  return 7;
  return 6;
}

function invalidateInputMap() {
  setTimeout(() => _inputMap?.invalidateSize(), 200);
}
