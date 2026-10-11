// Small helpers shared by the whole dashboard.
(function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Tagged template that escapes interpolations unless wrapped with raw()
  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  const raw = (s) => new Raw(s);
  const html = (strings, ...vals) => raw(strings.reduce((out, s, i) => {
    let v = i < vals.length ? vals[i] : '';
    if (Array.isArray(v)) v = v.map((x) => (x instanceof Raw ? x.s : esc(x))).join('');
    else v = v instanceof Raw ? v.s : esc(v);
    return out + s + v;
  }, ''));

  const gbp = (n, dp = 2) => (n == null || isNaN(n)) ? '–'
    : (n < 0 ? '−£' : '£') + Math.abs(Number(n)).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });

  const pad = (n) => String(n).padStart(2, '0');
  // Dates are handled as 'YYYY-MM-DD' strings in UK time
  const todayISO = () => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g('year')}-${g('month')}-${g('day')}`;
  };
  const monthStart = (iso) => (iso || todayISO()).slice(0, 7) + '-01';
  const addMonths = (iso, n) => {
    const [y, m] = iso.slice(0, 7).split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
  };
  const toDate = (iso) => {
    if (!iso) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); }
    return new Date(iso);
  };
  const fmtDate = (iso, opts) => {
    const d = toDate(iso); if (!d) return '–';
    return d.toLocaleDateString('en-GB', Object.assign({ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }, opts));
  };
  const fmtShort = (iso) => fmtDate(iso, { year: undefined });
  const monthName = (iso, withYear = true) => toDate(monthStart(iso)).toLocaleDateString('en-GB', { month: 'long', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
  const monthShort = (iso) => toDate(monthStart(iso)).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 7) return Math.floor(s / 86400) + ' d ago';
    return fmtShort(iso);
  };
  const tenure = (months) => {
    if (months == null) return '–';
    if (months < 1) return 'New';
    if (months < 12) return months + (months === 1 ? ' month' : ' months');
    const y = Math.floor(months / 12), m = months % 12;
    return y + (y === 1 ? ' year' : ' years') + (m ? ' ' + m + ' mo' : '');
  };
  const addressLines = (r) => [r.address_1, r.address_2, r.city, r.county, r.postcode, r.country && r.country !== 'GB' ? r.country : null].filter(Boolean);

  let toastTimer;
  const toast = (msg) => {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  };

  const download = (filename, blobOrText, type = 'text/plain') => {
    const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  const ic = (d) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);
  const icons = {
    overview: ic('<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v9h12v-9"/>'),
    month: ic('<rect x="5" y="3" width="6" height="18" rx="1"/><rect x="13" y="6" width="6" height="15" rx="1"/>'),
    members: ic('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3.3 3-5 5.5-5s4.7 1.7 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.3.1 4 1.6 4.8 4.8"/>'),
    gifts: ic('<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18M12 9v11"/><path d="M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9c2 0 5.5 0 5.5-1.5S13.5 5.5 12 9"/>'),
    money: ic('<path d="M15.5 6.5C14.6 5.6 13.4 5 12 5c-2.5 0-4 1.6-4 4v9"/><path d="M5.5 12.5h8"/><path d="M5.5 19h12"/>'),
    archive: ic('<path d="M4 20h16"/><rect x="5" y="5" width="3.5" height="13"/><rect x="9.5" y="7" width="3.5" height="11"/><path d="m14.5 8.2 3.3-.9 2.9 10.6-3.3.9z"/>'),
    settings: ic('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/>'),
    print: ic('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>'),
    download: ic('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>'),
    plus: ic('<path d="M12 5v14M5 12h14"/>'),
    close: ic('<path d="M6 6l12 12M18 6 6 18"/>'),
    check: ic('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    refresh: ic('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>'),
    search: ic('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
    bell: ic('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    signout: ic('<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>'),
  };

  window.U = { esc, raw, html, gbp, todayISO, monthStart, addMonths, fmtDate, fmtShort, monthName, monthShort, ago, tenure, addressLines, toast, download, icons };
})();
