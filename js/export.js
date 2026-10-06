/* ═══════════════════════════════════════════════
   SYTH — export.js
   Export full report as PDF, TXT, DOCX
   ═══════════════════════════════════════════════ */
'use strict';

/* ── TXT EXPORT ──────────────────────────────────────────────────── */
function exportTXT() {
  if (!currentExperiment) { showNotif('Run an experiment first', 'error'); return; }
  const { query, domain, reportText, elapsed } = currentExperiment;
  const header = `SYTH — Research Report\n${'='.repeat(60)}\nQuestion: ${query}\nDomain:   ${domain}\nDate:     ${new Date().toLocaleDateString()}\nDuration: ${elapsed}\n${'='.repeat(60)}\n\n`;
  const full   = header + _stripMd(reportText);
  _download(full, `syth-report-${_slug(query)}.txt`, 'text/plain');
  showNotif('TXT downloaded!', 'success');
}

/* ── PDF EXPORT ──────────────────────────────────────────────────── */
async function exportPDF() {
  if (!currentExperiment) { showNotif('Run an experiment first', 'error'); return; }
  showNotif('Generating PDF…', 'info', 8000);

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 16;
    const usableW = pageW - margin * 2;
    let y = margin;

    // Helper: add text with word wrap and page breaks
    function addText(text, fontSize, color, bold = false, extraY = 0) {
      y += extraY;
      doc.setFontSize(fontSize);
      doc.setTextColor(...color);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(text, usableW);
      lines.forEach(line => {
        if (y + fontSize * 0.4 > pageH - margin) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += fontSize * 0.5;
      });
    }

    // Cover
    doc.setFillColor(4, 8, 15);
    doc.rect(0, 0, pageW, pageH, 'F');
    doc.setFontSize(32); doc.setTextColor(0, 212, 255); doc.setFont('helvetica', 'bold');
    doc.text('SYTH', pageW / 2, 50, { align: 'center' });
    doc.setFontSize(11); doc.setTextColor(120, 145, 200);
    doc.text('Universal Digital Experimentation Platform', pageW / 2, 60, { align: 'center' });
    doc.setFontSize(14); doc.setTextColor(232, 240, 255);
    const qLines = doc.splitTextToSize(currentExperiment.query, usableW - 20);
    let qy = 80;
    qLines.forEach(l => { doc.text(l, pageW/2, qy, { align:'center' }); qy += 8; });
    doc.setFontSize(10); doc.setTextColor(85, 96, 128);
    doc.text(`${currentExperiment.domain} · ${new Date().toLocaleDateString()} · ${currentExperiment.elapsed}`, pageW/2, qy+10, { align:'center' });

    // Content pages
    doc.addPage();
    doc.setFillColor(4, 8, 15);
    doc.rect(0, 0, pageW, pageH, 'F');
    y = margin + 4;

    // Title
    addText('Research Report', 18, [0, 212, 255], true, 0);
    addText(currentExperiment.query, 13, [232, 240, 255], false, 2);
    y += 4;

    // Parse report text into sections
    const lines = _stripMd(currentExperiment.reportText).split('\n');
    for (const line of lines) {
      if (!line.trim()) { y += 2; continue; }
      if (line.startsWith('## ')) {
        addText(line.replace(/^##\s*/,''), 13, [0, 212, 255], true, 4);
      } else if (line.startsWith('### ')) {
        addText(line.replace(/^###\s*/,''), 11, [123, 95, 255], true, 2);
      } else if (line.startsWith('# ')) {
        addText(line.replace(/^#\s*/,''), 15, [0, 212, 255], true, 6);
      } else {
        addText(line, 9, [120, 145, 200], false, 0);
      }
    }

    // Scenarios
    doc.addPage();
    doc.setFillColor(4, 8, 15);
    doc.rect(0, 0, pageW, pageH, 'F');
    y = margin + 4;
    addText('Scenario Analysis', 16, [0, 212, 255], true, 0);
    const sc = currentExperiment.scenarios;
    [['Best Case', sc.best, [0,255,136]], ['Average Case', sc.avg, [0,212,255]], ['Worst Case', sc.worst, [255,68,102]], ['Custom', sc.custom, [255,204,0]]].forEach(([label,s,col]) => {
      if (!s) return;
      addText(label, 12, col, true, 6);
      addText(s.title||'', 10, [232,240,255], false, 2);
      addText(_stripMd(s.body||''), 9, [120,145,200], false, 1);
    });

    // Footer on all pages
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(68, 80, 112);
      doc.text(`SYTH Platform · Page ${i} of ${pages}`, pageW/2, pageH - 8, { align:'center' });
    }

    doc.save(`syth-report-${_slug(currentExperiment.query)}.pdf`);
    showNotif('PDF downloaded!', 'success');
  } catch(e) {
    console.error(e);
    showNotif('PDF error: ' + e.message.slice(0,60), 'error');
  }
}

/* ── DOCX EXPORT (HTML → blob) ───────────────────────────────────── */
function exportDOCX() {
  if (!currentExperiment) { showNotif('Run an experiment first', 'error'); return; }
  const { query, domain, reportText, elapsed } = currentExperiment;

  // Build a self-contained HTML that Word can import as DOCX
  const md  = typeof marked !== 'undefined' ? marked.parse(reportText) : reportText;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  body{font-family:Calibri,sans-serif;font-size:11pt;color:#1a1a2e;line-height:1.6;margin:2cm}
  h1{color:#004a8f;font-size:18pt;border-bottom:2px solid #004a8f;padding-bottom:4px}
  h2{color:#0066cc;font-size:14pt;margin-top:20px}
  h3{color:#0080ff;font-size:12pt}
  table{border-collapse:collapse;width:100%;margin:12px 0}
  th{background:#004a8f;color:#fff;padding:8px 12px;font-size:10pt}
  td{padding:7px 12px;border:1px solid #ccc;font-size:10pt}
  tr:nth-child(even) td{background:#f0f4ff}
  code{background:#f0f4ff;padding:1px 4px;border-radius:3px;font-family:Consolas,monospace;font-size:9pt}
  pre{background:#f0f4ff;padding:12px;border-radius:4px;border:1px solid #ccc}
  blockquote{border-left:4px solid #0066cc;padding-left:12px;color:#555;margin:12px 0}
</style></head><body>
<h1>SYTH Research Report</h1>
<p><strong>Question:</strong> ${escHtml(query)}<br/>
<strong>Domain:</strong> ${escHtml(domain)}<br/>
<strong>Date:</strong> ${new Date().toLocaleDateString()}<br/>
<strong>Duration:</strong> ${elapsed}</p>
<hr/>
${md}
</body></html>`;

  _download(html, `syth-report-${_slug(query)}.doc`, 'application/msword');
  showNotif('DOCX downloaded (open with Word)!', 'success');
}

/* ── HELPERS ─────────────────────────────────────────────────────── */
function _stripMd(text) {
  return text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s/gm, '• ')
    .replace(/^\s*\d+\.\s/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function _slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40);
}

function _download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
