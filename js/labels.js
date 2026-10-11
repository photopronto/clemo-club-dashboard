// Address labels (PDF) and Royal Mail Click & Drop import file (CSV).
(function () {
  // All sizes in mm, A4 portrait.
  const LAYOUTS = {
    L7160: { name: 'Avery L7160 — 21 per sheet (63.5 × 38.1 mm)', cols: 3, rows: 7, w: 63.5, h: 38.1, left: 7.2, top: 15.1, dx: 66.0, dy: 38.1 },
    L7159: { name: 'Avery L7159 — 24 per sheet (63.5 × 33.9 mm)', cols: 3, rows: 8, w: 63.5, h: 33.9, left: 7.2, top: 12.9, dx: 66.0, dy: 33.9 },
    L7163: { name: 'Avery L7163 — 14 per sheet (99.1 × 38.1 mm)', cols: 2, rows: 7, w: 99.1, h: 38.1, left: 4.7, top: 15.1, dx: 101.6, dy: 38.1 },
    L7162: { name: 'Avery L7162 — 16 per sheet (99.1 × 33.9 mm)', cols: 2, rows: 8, w: 99.1, h: 33.9, left: 4.7, top: 12.9, dx: 101.6, dy: 33.9 },
    PLAIN: { name: 'Plain A4 paper with cut lines — 14 per sheet', cols: 2, rows: 7, w: 100, h: 38, left: 5, top: 15.5, dx: 100, dy: 38, guides: true },
  };

  // jsPDF's built-in fonts only cover Latin-1; swap the usual suspects.
  const clean = (s) => String(s || '')
    .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .normalize('NFC').replace(/[^\x20-\x7E\xA0-\xFF]/g, (ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, ''))
    .trim();

  function labelLines(r) {
    const lines = [r.name].concat(U.addressLines(r)).map(clean).filter(Boolean);
    // Postcode in capitals on its own line is what Royal Mail asks for
    return lines;
  }

  function makePdf(rows, opts) {
    const L = LAYOUTS[opts.layout] || LAYOUTS.L7160;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const perPage = L.cols * L.rows;
    const pad = 4;
    const ret = opts.returnAddress ? clean('If undelivered please return to: ' + opts.sender) : '';
    let slot = Math.max(0, Math.min(perPage - 1, (opts.startAt || 1) - 1));
    let page = 0;

    const drawGuides = () => {
      if (!L.guides) return;
      doc.setLineDashPattern([1.5, 1.5], 0); doc.setDrawColor(170); doc.setLineWidth(0.2);
      for (let c = 0; c <= L.cols; c++) doc.line(L.left + c * L.dx, L.top - 4, L.left + c * L.dx, L.top + L.rows * L.dy + 4);
      for (let rr = 0; rr <= L.rows; rr++) doc.line(L.left - 4, L.top + rr * L.dy, L.left + L.cols * L.dx + 4, L.top + rr * L.dy);
      doc.setLineDashPattern([], 0);
    };
    drawGuides();

    rows.forEach((r) => {
      if (slot >= perPage) { doc.addPage(); page++; slot = 0; drawGuides(); }
      const col = slot % L.cols, row = Math.floor(slot / L.cols);
      const x = L.left + col * L.dx, y = L.top + row * L.dy;
      const lines = labelLines(r);
      const maxW = L.w - pad * 2;
      const retH = ret ? 3.2 : 0;
      const maxH = L.h - pad * 2 - retH;

      // largest size (11pt → 6.5pt) where every line fits
      let size = 11;
      for (; size > 6.5; size -= 0.5) {
        doc.setFontSize(size);
        const lh = size * 0.3528 * 1.18;
        doc.setFont('helvetica', 'bold');
        const w0 = doc.getTextWidth(lines[0] || '');
        doc.setFont('helvetica', 'normal');
        const wN = Math.max(0, ...lines.slice(1).map((l) => doc.getTextWidth(l)));
        if (Math.max(w0, wN) <= maxW && lines.length * lh <= maxH) break;
      }
      const lh = size * 0.3528 * 1.18;
      const blockH = lines.length * lh;
      let ty = y + pad + Math.max(0, (maxH - blockH) / 2) + size * 0.3528;
      lines.forEach((l, i) => {
        doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
        doc.setFontSize(size);
        doc.text(l, x + pad, ty, { maxWidth: maxW });
        ty += lh;
      });
      if (ret) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(110);
        doc.text(ret, x + pad, y + L.h - pad + 0.5, { maxWidth: maxW });
        doc.setTextColor(0);
      }
      slot++;
    });
    return doc;
  }

  const csvCell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  function clickAndDrop(rows, opts) {
    const header = ['Order reference', 'Full name', 'Address line 1', 'Address line 2', 'Address line 3', 'Town', 'County',
      'Postcode', 'Country code', 'Email', 'Phone', 'Weight (g)', 'Package size', 'Service code', 'Contents', 'Order value (GBP)', 'Customer reference'];
    const ym = opts.month.slice(0, 7).replace('-', '');
    const lines = rows.map((r, i) => [
      'CC' + ym + '-' + String(i + 1).padStart(3, '0'),
      r.name, r.address_1, r.address_2, '', r.city, r.county, (r.postcode || '').toUpperCase(),
      r.country || 'GB', r.email || '', r.phone || '', opts.weight || 400, opts.packageSize || 'Large letter', opts.service || '',
      'Book', opts.value || '', 'Clemo Club ' + U.monthName(opts.month),
    ].map(csvCell).join(','));
    return '﻿' + [header.join(',')].concat(lines).join('\r\n') + '\r\n';
  }

  window.Labels = { LAYOUTS, makePdf, clickAndDrop, labelLines, clean };
})();
