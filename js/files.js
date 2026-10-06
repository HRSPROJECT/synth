/* ═══════════════════════════════════════════════
   SYTH — files.js
   File upload: PDF (pdf.js), DOCX (mammoth),
   TXT/CSV/MD — extracts text for agent context
   ═══════════════════════════════════════════════ */
'use strict';

// Uploaded files store: { name, type, text, size }
const _uploadedFiles = [];

/* ── PDF.js worker ────────────────────────────────────────────────── */
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* ── PUBLIC: add files from FileList ─────────────────────────────── */
async function addFiles(fileList) {
  const promises = Array.from(fileList).map(f => _readFile(f));
  const results  = await Promise.allSettled(promises);
  results.forEach(r => { if (r.status === 'fulfilled' && r.value) _uploadedFiles.push(r.value); });
  _renderFileList();
}

function removeFile(name) {
  const idx = _uploadedFiles.findIndex(f => f.name === name);
  if (idx !== -1) _uploadedFiles.splice(idx, 1);
  _renderFileList();
}

function getFilesContext() {
  if (!_uploadedFiles.length) return '';
  const parts = _uploadedFiles.map(f => {
    const preview = f.text.slice(0, 1200);
    return `--- FILE: ${f.name} (${f.type}) ---\n${preview}${f.text.length > 1200 ? '\n[...truncated...]' : ''}`;
  });
  return 'ATTACHED FILES CONTEXT:\n\n' + parts.join('\n\n');
}

function hasFiles() { return _uploadedFiles.length > 0; }
function getFiles() { return [..._uploadedFiles]; }

/* ── INTERNAL READERS ────────────────────────────────────────────── */
async function _readFile(file) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const size = _formatSize(file.size);
  let text   = '';

  try {
    if (ext === 'pdf')            text = await _readPDF(file);
    else if (ext === 'docx')      text = await _readDOCX(file);
    else if (['txt','csv','md','json'].includes(ext)) text = await _readText(file);
    else text = await _readText(file); // try as text anyway
  } catch (e) {
    console.warn(`[SYTH files] Could not read ${file.name}:`, e.message);
    text = `[Could not extract text from ${file.name}]`;
  }

  return { name: file.name, type: ext.toUpperCase(), text, size };
}

async function _readPDF(file) {
  if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js not loaded');
  const arrayBuffer = await file.arrayBuffer();
  const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages       = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return pages.join('\n\n');
}

async function _readDOCX(file) {
  if (typeof mammoth === 'undefined') throw new Error('mammoth not loaded');
  const arrayBuffer = await file.arrayBuffer();
  const result      = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function _readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsText(file);
  });
}

/* ── RENDER FILE CHIPS ────────────────────────────────────────────── */
function _renderFileList() {
  const container = document.getElementById('fileList');
  if (!container) return;
  container.innerHTML = _uploadedFiles.map(f => `
    <div class="file-chip">
      <span class="fc-icon">${_fileIcon(f.type)}</span>
      <span class="fc-name" title="${escHtml(f.name)}">${escHtml(f.name)}</span>
      <span style="color:var(--text3);font-size:10px">${f.size}</span>
      <span class="fc-remove" data-name="${escHtml(f.name)}" title="Remove">✕</span>
    </div>`).join('');

  container.querySelectorAll('.fc-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFile(btn.dataset.name));
  });
}

function _fileIcon(type) {
  const map = { PDF:'📄', DOCX:'📃', TXT:'📝', CSV:'📊', MD:'📋', JSON:'🔧' };
  return map[type] || '📎';
}

function _formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + 'KB';
  return (bytes/1048576).toFixed(1) + 'MB';
}
