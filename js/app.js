// Clemo Club dashboard
(function () {
  const { html, raw, gbp, fmtDate, fmtShort, monthName, monthShort, monthStart, addMonths, todayISO, ago, tenure, addressLines, toast, download, icons } = U;
  const api = window.makeApi();
  const app = document.getElementById('app');
  const state = { alerts: [], settings: {}, me: null };
  const THIS_MONTH = monthStart(todayISO());

  // ---------- helpers ----------
  const planTag = (p, kind) => kind === 'gift'
    ? html`<span class="tag gift">Gift · ${p === 'postal' ? 'Postal' : 'Local'}</span>`
    : html`<span class="tag ${p}">${p === 'postal' ? 'Postal' : 'Local'}</span>`;
  const statusTag = (r) => {
    if (r.overdue) return html`<span class="tag bad">Overdue</span>`;
    if (r.last_payment_failed && r.status === 'active') return html`<span class="tag bad">Payment failed</span>`;
    const map = { active: ['ok', 'Active'], 'pending-cancel': ['warn', 'Leaving'], 'on-hold': ['bad', 'On hold'],
      pending: ['plain', 'Pending'], cancelled: ['plain', 'Left'], expired: ['plain', 'Finished'] };
    const [cls, label] = map[r.status] || ['plain', r.status];
    return html`<span class="tag ${cls}">${label}</span>`;
  };
  const isCurrent = (r) => ['active', 'pending-cancel', 'on-hold', 'pending'].includes(r.status) && !(r.kind === 'gift' && !r.gift_start_month && false);
  const needsAttention = (r) => r.overdue || (r.last_payment_failed && r.status === 'active') || r.status === 'on-hold' || r.needs_start_month;
  const setting = (k, d) => (state.settings[k] == null || state.settings[k] === '' ? d : state.settings[k]);
  const unread = () => state.alerts.filter((a) => !a.read_at);

  async function guard(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { console.error(e); toast(e.message || 'Something went wrong'); throw e; }
  }

  // ---------- shell ----------
  const NAV = [
    ['overview', 'Overview', icons.overview],
    ['month', 'This month', icons.month],
    ['members', 'Members', icons.members],
    ['gifts', 'Gifts', icons.gifts],
    ['money', 'Money', icons.money],
    ['books', 'Past books', icons.archive],
    ['settings', 'Settings', icons.settings],
  ];

  function shell(active, content) {
    const n = unread().length;
    const email = state.me ? state.me.email : '';
    app.innerHTML = html`
      <div class="shell">
        <nav class="nav" aria-label="Main">
          <a class="rail-logo" href="#/overview" title="Clemo Club" aria-label="Clemo Club overview"><img class="ink-art" src="img/open-book.webp" alt="" width="42" height="39"></a>
          ${NAV.map(([key, label, icon]) => html`<a href="#/${key}" title="${label}" ${raw(active === key ? 'aria-current="page"' : '')}>${icon}<span class="rail-label">${label}</span>${key === 'overview' && n ? html`<span class="count" aria-label="${n} alerts">${n}</span>` : ''}</a>`)}
          <div class="nav-foot"><button type="button" class="rail-btn" data-action="signout" title="${api.demo ? 'Reset demo' : 'Sign out'}" aria-label="${api.demo ? 'Reset demo' : 'Sign out'}">${icons.signout}</button></div>
        </nav>
        <main id="main">
          <header class="topbar">
            <label class="search">${icons.search}<span class="sr-only">Search members</span>
              <input type="search" id="top-search" placeholder="Search members by name, email or postcode" value="${memberQuery}" autocomplete="off"></label>
            <div class="topbar-right">
              <a class="top-btn" href="#/overview" aria-label="${n} alerts">${icons.bell}<span class="hide-m">Alerts</span><span class="count ${n ? 'on' : ''}">${n}</span></a>
              <span class="who" title="${email}">${(email || '?').slice(0, 1)}</span>
            </div>
          </header>
          ${api.demo ? html`<div class="demo-banner">Demo mode with sample members. Nothing here is real, and changes vanish when you reload.</div>` : ''}${content}
        </main>
        <nav class="tabbar" aria-label="Main">
          ${NAV.filter(([k]) => k !== 'books').map(([key, label, icon]) => html`<a href="#/${key}" ${raw(active === key ? 'aria-current="page"' : '')}>${icon}<span>${label.replace('This month', 'Month')}</span>${key === 'overview' && n ? html`<span class="count">${n}</span>` : ''}</a>`)}
        </nav>
      </div>`;
    const search = document.getElementById('top-search');
    search.addEventListener('input', (e) => {
      memberQuery = e.target.value;
      if (!location.hash.startsWith('#/members')) { memberFilter = 'all'; location.hash = '#/members'; }
      else if (typeof renderMembers === 'function') renderMembers();
    });
    if (active === 'members' && memberQuery) { search.focus(); search.setSelectionRange(memberQuery.length, memberQuery.length); }
  }

  function closeDrawer() {
    const open = document.querySelector('.drawer');
    document.querySelectorAll('.scrim, .drawer').forEach((el) => el.remove());
    if (open && /^#\/members\/./.test(location.hash)) history.replaceState(null, '', '#/members');
  }
  function drawer(content) {
    closeDrawer();
    const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.addEventListener('click', closeDrawer);
    const d = document.createElement('aside'); d.className = 'drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = content;
    document.body.append(scrim, d);
    const first = d.querySelector('input, select, textarea, button'); if (first) first.focus();
    return d;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // ---------- brand ----------
  const LOGO = 'https://clemobooks.co.uk/wp-content/uploads/2026/01/Clemo-Books-Logo-Web.png';
  const brand = () => raw(`<a class="brand" href="#/overview" aria-label="Clemo Club overview">
      <img class="brand-logo" src="${LOGO}" alt="Clemo Books" onerror="this.hidden=true;this.nextElementSibling.hidden=false">
      <span class="brand-name" hidden>Clemo Books</span>
      <span class="brand-sub">Clemo Club</span></a>`);

  // ---------- cover (or spine when there's no cover) ----------
  function bookFace(month, book) {
    if (!book || !book.cover_url) return spine(month, book);
    return html`<div class="cover-wrap"><img class="cover" src="${book.cover_url}" alt="Cover of ${book.title}" referrerpolicy="no-referrer"
      onerror="this.parentNode.classList.add('broken')">${spine(month, book)}</div>`;
  }

  // ---------- spine ----------
  function spine(month, book) {
    const m = monthName(month, false), y = month.slice(0, 4);
    if (!book) {
      return html`<div class="spine empty" aria-label="No book chosen for ${m}"><span class="spine-top">&nbsp;</span>
        <span class="spine-mid"><img class="ink-art spine-art" src="img/open-book.webp" alt="" width="54" height="50"><span class="spine-title">No book yet</span></span><span class="spine-month">${monthShort(month)}<small>${y}</small></span></div>`;
    }
    return html`<div class="spine" aria-label="${book.title} by ${book.author || ''}, ${m} ${y}">
      <span class="spine-top">CLEMO</span>
      <span class="spine-mid"><span class="spine-title">${book.title}</span><span class="spine-author">${book.author || ''}</span></span>
      <span class="spine-month">${monthShort(month)}<small>${y}</small></span></div>`;
  }

  // ---------- OVERVIEW ----------
  async function viewOverview() {
    shell('overview', html`<p class="muted">Loading…</p>`);
    const [allRows, sum, alerts] = await Promise.all([api.overview(), api.summary(THIS_MONTH), api.alerts()]);
    state.alerts = alerts;
    const rows = allRows.filter((r) => !r.hidden_at);
    const current = rows.filter((r) => ['active', 'pending-cancel'].includes(r.status));
    const subsActive = current.filter((r) => r.kind === 'subscription');
    const monthly = subsActive.filter((r) => r.status === 'active').reduce((a, r) => a + Number(r.price || 0), 0);
    const problems = rows.filter((r) => r.overdue || (r.last_payment_failed && r.status === 'active') || r.status === 'on-hold');
    const in7 = addDays(todayISO(), 7);
    const due = subsActive.filter((r) => r.status === 'active' && r.next_payment_on && r.next_payment_on >= todayISO() && r.next_payment_on <= in7)
      .sort((a, b) => a.next_payment_on.localeCompare(b.next_payment_on));
    const open = unread();
    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' });

    shell('overview', html`
      <div class="page-head"><div><h1>Clemo Club</h1>
        <div class="sub">${today}. ${sum.total_members} ${sum.total_members === 1 ? 'person is' : 'people are'} getting the ${monthName(THIS_MONTH, false)} book.</div></div></div>

      <div class="figures">
        <div class="figure"><b>${subsActive.length}</b><span>${subsActive.filter((r) => r.plan === 'local').length} local, ${subsActive.filter((r) => r.plan === 'postal').length} postal members</span></div>
        <div class="figure"><b>${current.filter((r) => r.kind === 'gift').length}</b><span>gift memberships running</span></div>
        <div class="figure"><b>${gbp(monthly, 0)}</b><span>monthly subscription income</span></div>
        <div class="figure"><b>${gbp(sum.revenue, 0)}</b><span>taken so far in ${monthName(THIS_MONTH, false)}${sum.expected_count ? html`, ${gbp(sum.expected_revenue, 0)} still due from ${sum.expected_count} ${sum.expected_count === 1 ? 'renewal' : 'renewals'}` : ''}</span></div>
        <div class="figure ${sum.predicted_profit >= 0 ? 'good' : 'bad'}"><b>${gbp(sum.predicted_profit, 0)}</b><span>predicted ${monthName(THIS_MONTH, false)} profit once everyone due has paid</span></div>
        <div class="figure ${problems.length ? 'bad' : ''}"><b>${problems.length}</b><span>payment ${problems.length === 1 ? 'problem' : 'problems'}</span></div>
      </div>

      <section class="section">
        <div class="section-head"><h2>Needs attention</h2><span class="muted">${open.length ? open.length + ' to deal with' : ''}</span>
          <div class="right">${open.length ? html`<button class="btn small" data-action="all-read">Mark all done</button>` : ''}</div></div>
        <div class="panel">${alertList(open.slice(0, 12))}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>${monthName(THIS_MONTH)}</h2><div class="right"><a class="btn small" href="#/month">Open this month</a></div></div>
        <div class="month">
          ${bookFace(THIS_MONTH, sum.book)}
          <div class="month-body">
            ${sum.book ? html`<h2>${sum.book.title}</h2><p class="byline">${sum.book.author || ''}</p>`
              : html`<h2>No book chosen yet</h2><p class="byline">Add this month's pick to work out copies and profit.</p>`}
            ${sum.missing_book_cost ? html`<p class="small muted" style="margin:0">Profit doesn't include the book yet. Add its cost per copy on This month.</p>` : ''}
            <div class="figures fill">
              <div class="figure"><b>${sum.copies_needed}</b><span>copies to order (incl. ${setting('spare_copies', 1)} spare)</span></div>
              <div class="figure"><b>${sum.postal}</b><span>to post</span></div>
              <div class="figure"><b>${sum.local}</b><span>to collect</span></div>
              <div class="figure"><b>${gbp(sum.revenue, 0)}</b><span>taken so far</span></div>
              <div class="figure"><b>${gbp(sum.costs, 0)}</b><span>costs</span></div>
            </div>
          </div>
        </div>
      </section>

      <section class="section two-col">
        <div>
          <div class="section-head"><h2>Payments due this week</h2></div>
          <div class="panel">${due.length ? html`<ul class="list">${due.map((r) => html`
            <li><div class="alert-main"><b><a href="#/members/${r.subscription_id}">${r.name}</a></b><p>${planTag(r.plan, r.kind)} ${gbp(r.price)}</p></div>
            <div class="num">${fmtShort(r.next_payment_on)}</div></li>`)}</ul>` : html`<div class="empty-state">No renewals in the next 7 days.</div>`}</div>
          <div class="section-head" style="margin-top:24px"><h2>Recent payments</h2></div>
          <div class="panel table-wrap" id="recent-payments"><div class="empty-state">Loading…</div></div>
        </div>
        <div>
          <div class="section-head"><h2>Payment problems</h2></div>
          <div class="panel">${problems.length ? html`<ul class="list">${problems.map((r) => html`
            <li><div class="alert-main"><b><a href="#/members/${r.subscription_id}">${r.name}</a></b><p>${statusTag(r)} ${r.next_payment_on ? 'Due ' + fmtShort(r.next_payment_on) : ''}</p></div>
            <div class="num">${gbp(r.price)}</div><a class="btn small" href="#/members/${r.subscription_id}">Retry or send link</a></li>`)}</ul>` : html`<div class="empty-state">Every renewal has gone through.</div>`}</div>
        </div>
      </section>`);
    loadRecentPayments();
    app.onclick = (e) => {
      const o = e.target.closest('#recent-payments [data-open]'); if (o) { location.hash = '#/members/' + o.dataset.open; return; }
      const t = e.target.closest('[data-action]'); if (t) commonAction(t);
    };
  }

  async function loadRecentPayments() {
    const box = document.getElementById('recent-payments'); if (!box) return;
    let list;
    try { list = await api.recentPayments(10); } catch (e) { box.innerHTML = html`<div class="empty-state">Couldn't load payments.</div>`; return; }
    if (!document.body.contains(box)) return;
    const what = { signup: 'Joined', renewal: 'Renewal', gift: 'Gift' };
    const tag = { paid: html`<span class="tag ok">Paid</span>`, failed: html`<span class="tag bad">Failed</span>`, refunded: html`<span class="tag warn">Refunded</span>` };
    box.innerHTML = list.length ? html`<table class="data recent"><thead><tr><th>Date</th><th>Member</th><th class="hide-m">For</th><th class="r">Amount</th><th>Status</th></tr></thead>
      <tbody>${list.map((p) => html`<tr ${raw(p.subscription_id && !p.deleted ? 'class="clickable" data-open="' + U.esc(p.subscription_id) + '" tabindex="0"' : '')}>
        <td class="num">${fmtShort(p.paid_at || p.order_date || p.created_at)}</td>
        <td class="name">${p.name}</td>
        <td class="hide-m">${what[p.kind] || p.kind}${p.plan ? html` · ${p.plan === 'postal' ? 'Postal' : 'Local'}` : ''}</td>
        <td class="r">${gbp(p.amount)}</td>
        <td>${tag[p.status] || html`<span class="tag plain">${p.status}</span>`}</td></tr>`)}</tbody></table>`
      : html`<div class="empty-state">No payments yet.</div>`;
  }

  function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  function alertList(list) {
    if (!list.length) return html`<div class="empty-state caught-up"><img class="ink-art" src="img/tortoise.webp" alt="" width="72" height="86"><div><b>All caught up.</b><br>Nothing needs you right now.</div></div>`;
    return html`<ul class="list">${list.map((a) => html`
      <li>
        <span class="alert-dot ${a.severity}" aria-hidden="true"></span>
        <div class="alert-main"><b>${a.title}</b>${a.body ? html`<p>${a.body}</p>` : ''}<p class="small muted">${ago(a.created_at)}</p></div>
        <div class="alert-actions">
          ${a.kind === 'labels_ready' || a.kind === 'late_joiner' ? html`<a class="btn small" href="#/month/${a.month || THIS_MONTH}">Labels</a>` : ''}
          ${a.subscription_id && a.kind !== 'labels_ready' ? html`<a class="btn small" href="#/members/${a.subscription_id}">Open</a>` : ''}
          <button class="btn small ghost" data-action="alert-read" data-id="${a.id}">Done</button>
        </div>
      </li>`)}</ul>`;
  }

  // ---------- THIS MONTH ----------
  async function viewMonth(month) {
    month = monthStart(month || THIS_MONTH);
    shell('month', html`<p class="muted">Loading…</p>`);
    if (month >= THIS_MONTH) await api.prepareMonth(month);
    const [sum, roster, book, costs, runs] = await Promise.all([api.summary(month), api.roster(month), api.book(month), api.costs(month), api.labelRuns(month)]);
    const postal = roster.filter((r) => r.plan === 'postal');
    const local = roster.filter((r) => r.plan === 'local');
    const unlabelled = postal.filter((r) => !r.label_run_id);
    const lastRun = runs[runs.length - 1];
    const lateJoiners = lastRun ? unlabelled : [];
    const noAddress = postal.filter((r) => !r.address_1 || !r.postcode);
    const flagged = roster.filter((r) => r.overdue || r.status === 'pending-cancel');
    const isPast = month < THIS_MONTH;

    shell('month', html`
      <div class="page-head">
        <div><h1>${monthName(month)}</h1><div class="sub">${roster.length} getting the book: ${postal.length} by post, ${local.length} collecting.</div></div>
        <div class="actions">
          <a class="btn" href="#/month/${addMonths(month, -1)}" aria-label="Previous month">‹ ${monthShort(addMonths(month, -1))}</a>
          ${month !== THIS_MONTH ? html`<a class="btn" href="#/month">This month</a>` : ''}
          <a class="btn" href="#/month/${addMonths(month, 1)}" aria-label="Next month">${monthShort(addMonths(month, 1))} ›</a>
        </div>
      </div>

      <div class="month">
        ${bookFace(month, book)}
        <div class="month-body">
          <form class="panel pad" id="book-form">
            <h3 style="margin-bottom:12px">${book ? 'This month’s book' : 'Add this month’s book'}</h3>
            <div class="form-grid">
              <label class="field wide">Title<input type="text" name="title" required value="${book ? book.title : ''}"></label>
              <label class="field">Author<input type="text" name="author" value="${book ? book.author || '' : ''}"></label>
              <label class="field">ISBN<input type="text" name="isbn" inputmode="numeric" value="${book ? book.isbn || '' : ''}"></label>
              <div class="field find-cell"><span aria-hidden="true">&nbsp;</span><button class="btn" type="button" data-action="find-book">${icons.search} Find cover</button></div>
              <label class="field">Cost per copy (£)<input type="number" name="cost_per_copy" step="0.01" min="0" value="${book && book.cost_per_copy != null ? book.cost_per_copy : ''}"></label>
              <label class="field">Copies ordered<input type="number" name="copies_ordered" min="0" step="1" placeholder="${sum.copies_needed}" value="${book && book.copies_ordered != null ? book.copies_ordered : ''}"></label>
              <label class="field">Supplier<input type="text" name="supplier" value="${book ? book.supplier || '' : ''}"></label>
              <label class="field">Shop price (£)<input type="number" name="rrp" step="0.01" min="0" value="${book && book.rrp != null ? book.rrp : ''}"></label>
              <label class="field wide">Notes<input type="text" name="notes" value="${book ? book.notes || '' : ''}"></label>
              <label class="field wide">Cover image
                <span class="cover-field"><img id="cover-preview" alt="" ${raw(book && book.cover_url ? '' : 'hidden')} src="${book && book.cover_url ? book.cover_url : ''}" referrerpolicy="no-referrer">
                <input type="text" name="cover_url" inputmode="url" placeholder="Found automatically from the ISBN, or paste an image link" value="${book ? book.cover_url || '' : ''}"></span></label>
            </div>
            <div style="margin-top:14px;display:flex;gap:10px;align-items:center"><button class="btn primary" type="submit">Save book</button>
              <span class="small muted">Leave "Copies ordered" empty to use the suggested ${sum.copies_needed}.</span></div>
          </form>
        </div>
      </div>

      <section class="section">
        <div class="section-head"><h2>Copies and money</h2></div>
        <div class="figures">
          <div class="figure"><b>${sum.copies_needed}</b><span>copies to order: ${sum.total_members} members + ${setting('spare_copies', 1)} spare</span></div>
          <div class="figure"><b>${gbp(sum.revenue)}</b><span>taken so far</span></div>
          <div class="figure"><b>${gbp(sum.expected_revenue)}</b><span>still due from ${sum.expected_count} ${sum.expected_count === 1 ? 'renewal' : 'renewals'}</span></div>
          <div class="figure"><b>${gbp(sum.costs)}</b><span>costs</span></div>
          <div class="figure ${sum.predicted_profit >= 0 ? 'good' : 'bad'}"><b>${gbp(sum.predicted_profit)}</b><span>predicted profit (${gbp(sum.profit)} so far)</span></div>
        </div>
        <div class="two-col" style="margin-top:16px">
          <div class="panel"><table class="data"><tbody>
            <tr><td>Subscription payments (${sum.subscription_payments})</td><td class="r">${gbp(sum.subscription_revenue)}</td></tr>
            <tr><td>Gift memberships (share for this month)</td><td class="r">${gbp(sum.gift_revenue)}</td></tr>
            <tr><td>Books: ${sum.copies} × ${book && book.cost_per_copy != null ? gbp(book.cost_per_copy) : '?'}</td><td class="r">−${gbp(sum.book_cost)}</td></tr>
            <tr><td>Postage: ${sum.postal} × ${gbp(setting('postage_per_parcel', 2.7))}</td><td class="r">−${gbp(sum.postage)}</td></tr>
            <tr><td>Packaging: ${sum.postal} × ${gbp(setting('packaging_per_parcel', 0.5))}</td><td class="r">−${gbp(sum.packaging)}</td></tr>
            <tr><td>Card fees</td><td class="r">−${gbp(sum.card_fees)}</td></tr>
            <tr><td>Other costs</td><td class="r">−${gbp(sum.extra_costs)}</td></tr>
            <tr><td>Profit so far</td><td class="r">${gbp(sum.profit)}</td></tr>
            <tr><td>Renewals still due (${sum.expected_count}), less card fees</td><td class="r">+${gbp(sum.expected_revenue - sum.expected_fees)}</td></tr>
          </tbody><tfoot><tr><td>Predicted profit</td><td class="r">${gbp(sum.predicted_profit)}</td></tr></tfoot></table></div>
          <div class="panel pad">
            <h3>Other costs this month</h3>
            ${costs.length ? html`<ul class="list" style="margin:8px -16px">${costs.map((c) => html`<li><div class="alert-main">${c.label}</div><div class="num">${gbp(c.amount)}</div>
              <button class="btn small ghost danger" data-action="del-cost" data-id="${c.id}" aria-label="Remove ${c.label}">Remove</button></li>`)}</ul>` : html`<p class="small muted" style="margin-top:6px">Venue, snacks, gift notes… anything else that came out of this month.</p>`}
            <form id="cost-form" class="form-grid" style="margin-top:10px">
              <label class="field">What for<input type="text" name="label" required placeholder="Meet-up snacks"></label>
              <label class="field">Amount (£)<input type="number" name="amount" step="0.01" min="0" required></label>
              <div style="align-self:end"><button class="btn" type="submit">${icons.plus} Add cost</button></div>
            </form>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Posting</h2><span class="muted">${postal.filter((r) => r.posted_at).length} of ${postal.length} posted</span>
          <div class="right">
            <button class="btn primary" data-action="labels" ${raw(postal.length ? '' : 'disabled')}>${icons.print} Labels PDF</button>
            <button class="btn" data-action="clickdrop" ${raw(postal.length ? '' : 'disabled')}>${icons.download} Click & Drop file</button>
          </div></div>
        ${lateJoiners.length ? html`<div class="notice warning"><b>${lateJoiners.length} joined after the last labels were printed</b> (${fmtShort(lastRun.created_at)}): ${lateJoiners.map((r) => r.name).join(', ')}. Print "Not yet labelled" to get just these.</div>` : ''}
        ${noAddress.length ? html`<div class="notice danger"><b>Missing address:</b> ${noAddress.map((r) => r.name).join(', ')}. Add it on their member page before printing.</div>` : ''}
        <div class="panel table-wrap">${postal.length ? html`<table class="data">
          <thead><tr><th>Name</th><th class="hide-m">Address</th><th>Label</th><th>Posted</th></tr></thead>
          <tbody>${postal.map((r) => html`<tr>
            <td><a class="name" href="#/members/${r.subscription_id}">${r.name}</a> ${r.kind === 'gift' ? html`<span class="tag gift">Gift</span>` : ''} ${r.overdue ? html`<span class="tag bad">Overdue</span>` : ''} ${r.status === 'pending-cancel' ? html`<span class="tag warn">Last book</span>` : ''}</td>
            <td class="hide-m small">${addressLines(r).join(', ') || html`<span class="tag bad">No address</span>`}</td>
            <td>${r.label_run_id ? html`<span class="tag ok">Printed</span>` : html`<span class="tag plain">Not yet</span>`}</td>
            <td><label class="check"><input type="checkbox" data-action="posted" data-id="${r.subscription_id}" ${raw(r.posted_at ? 'checked' : '')}><span class="sr-only">Posted</span></label></td>
          </tr>`)}</tbody></table>` : html`<div class="empty-state">No postal members this month.</div>`}</div>
        ${postal.some((r) => !r.posted_at) ? html`<p style="margin-top:10px"><button class="btn small" data-action="all-posted">Mark all as posted</button></p>` : ''}
      </section>

      <section class="section">
        <div class="section-head"><h2>Collecting</h2><span class="muted">${local.filter((r) => r.collected_at).length} of ${local.length} collected</span></div>
        <div class="panel">${local.length ? html`<ul class="list">${local.map((r) => html`
          <li><label class="check" style="flex:1"><input type="checkbox" data-action="collected" data-id="${r.subscription_id}" ${raw(r.collected_at ? 'checked' : '')}>
            <span><b>${r.name}</b> ${r.kind === 'gift' ? html`<span class="tag gift">Gift</span>` : ''} ${r.overdue ? html`<span class="tag bad">Overdue</span>` : ''} ${r.status === 'pending-cancel' ? html`<span class="tag warn">Last book</span>` : ''}</span></label>
            <span class="small muted">${r.collected_at ? 'Collected ' + fmtShort(r.collected_at) : ''}</span></li>`)}</ul>` : html`<div class="empty-state">Nobody is collecting this month.</div>`}</div>
      </section>
      ${flagged.length ? html`<p class="small muted" style="margin-top:14px">"Overdue" members are still on the list because their subscription is active. Hold their book back if you'd rather wait for payment.</p>` : ''}
      ${isPast ? html`<p class="small muted">Past months are kept as a record of who got the book.</p>` : ''}
    `);

    // book form
    document.getElementById('book-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      if (!form.cover_url.value.trim() && (form.isbn.value.trim() || form.title.value.trim())) {
        const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Finding cover…';
        try { await fillFromLookup(form, true); } catch (err) { /* save anyway */ }
      }
      const f = new FormData(form);
      const num = (k) => (f.get(k) === '' || f.get(k) == null ? null : Number(f.get(k)));
      await guard(() => api.saveBook({ month, title: f.get('title').trim(), author: f.get('author').trim() || null, isbn: f.get('isbn').trim() || null,
        cost_per_copy: num('cost_per_copy'), copies_ordered: num('copies_ordered'), supplier: f.get('supplier').trim() || null,
        rrp: num('rrp'), notes: f.get('notes').trim() || null, cover_url: f.get('cover_url').trim() || null }), 'Book saved');
      viewMonth(month);
    });
    const bookForm = document.getElementById('book-form');
    bookForm.cover_url.addEventListener('input', () => setCoverPreview(bookForm.cover_url.value.trim()));
    bookForm.querySelector('[data-action="find-book"]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (!bookForm.isbn.value.trim() && !bookForm.title.value.trim()) { toast('Add the ISBN or the title first'); return; }
      btn.disabled = true; const label = btn.innerHTML; btn.textContent = 'Looking…';
      try {
        const found = await fillFromLookup(bookForm, false);
        toast(found ? 'Cover found' : 'No cover found. Paste an image link instead.');
      } finally { btn.disabled = false; btn.innerHTML = label; }
    });
    document.getElementById('cost-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      await guard(() => api.addCost(month, f.get('label').trim(), Number(f.get('amount'))), 'Cost added');
      viewMonth(month);
    });

    app.onclick = async (e) => {
      const t = e.target.closest('[data-action]'); if (!t) return;
      const a = t.dataset.action;
      if (a === 'del-cost') { await guard(() => api.deleteCost(t.dataset.id), 'Cost removed'); viewMonth(month); }
      if (a === 'labels') labelDialog(month, postal, book);
      if (a === 'clickdrop') {
        const csv = Labels.clickAndDrop(postal, { month, weight: setting('parcel_weight_g', 400), service: setting('click_drop_service', ''),
          value: book && book.rrp ? book.rrp : '', packageSize: setting('click_drop_package', 'Large letter') });
        download(`clemo-club-${month.slice(0, 7)}-click-and-drop.csv`, csv, 'text/csv');
        toast(postal.length + ' parcels in the Click & Drop file');
      }
      if (a === 'all-posted') {
        const now = new Date().toISOString();
        await guard(() => Promise.all(postal.filter((r) => !r.posted_at).map((r) => api.setFulfilment(month, r.subscription_id, { posted_at: now }))), 'All marked as posted');
        viewMonth(month);
      }
      if (a === 'signout' || a === 'alert-read' || a === 'all-read') commonAction(t);
    };
    app.onchange = async (e) => {
      const t = e.target.closest('[data-action="posted"], [data-action="collected"]'); if (!t) return;
      const field = t.dataset.action === 'posted' ? 'posted_at' : 'collected_at';
      await guard(() => api.setFulfilment(month, t.dataset.id, { [field]: t.checked ? new Date().toISOString() : null }),
        t.checked ? (field === 'posted_at' ? 'Marked as posted' : 'Marked as collected') : 'Unticked');
    };
  }

  function setCoverPreview(url) {
    const img = document.getElementById('cover-preview');
    if (!img) return;
    if (url) { img.src = url; img.hidden = false; img.onerror = () => { img.hidden = true; }; } else { img.hidden = true; img.removeAttribute('src'); }
  }

  /** Look the book up and fill in the cover plus any empty fields. Returns true if a cover was found. */
  async function fillFromLookup(form, quiet) {
    const r = await Covers.find({ isbn: form.isbn.value, title: form.title.value.trim(), author: form.author.value.trim() });
    if (!form.title.value.trim() && r.title) form.title.value = r.title;
    if (!form.author.value.trim() && r.author) form.author.value = r.author;
    if (!form.isbn.value.trim() && r.isbn) form.isbn.value = r.isbn;
    if (r.cover && (!quiet || !form.cover_url.value.trim())) { form.cover_url.value = r.cover; setCoverPreview(r.cover); }
    return !!r.cover;
  }

  function labelDialog(month, postal, book) {
    const layouts = Labels.LAYOUTS;
    const unl = postal.filter((r) => !r.label_run_id).length;
    const d = drawer(html`
      <div class="drawer-head"><h2>Print ${monthName(month, false)} labels</h2><button class="btn ghost" data-close aria-label="Close">${icons.close}</button></div>
      <form id="label-form" style="display:grid;gap:14px">
        <label class="field">Who
          <select name="which">
            <option value="all">Everyone posting this month (${postal.length})</option>
            <option value="unlabelled" ${raw(unl && unl < postal.length ? 'selected' : '')}>Not yet labelled (${unl})</option>
          </select></label>
        <label class="field">Label sheet
          <select name="layout">${Object.entries(layouts).map(([k, v]) => html`<option value="${k}" ${raw(k === setting('label_layout', 'L7160') ? 'selected' : '')}>${v.name}</option>`)}</select></label>
        <label class="field">Start at label number
          <input type="number" name="startAt" min="1" max="24" value="1">
          <span class="small muted">Use this to finish a part-used sheet. Labels are counted left to right, top to bottom.</span></label>
        <label class="check"><input type="checkbox" name="returnAddress" ${raw(setting('label_return_address', false) ? 'checked' : '')}> Add a small return address</label>
        <div><button class="btn primary" type="submit">${icons.download} Download PDF</button></div>
        <p class="small muted">Print at 100% (not "fit to page"). The people on this PDF are marked as labelled, so anyone who joins afterwards is flagged.</p>
      </form>`);
    d.querySelector('[data-close]').onclick = closeDrawer;
    d.querySelector('#label-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const rows = f.get('which') === 'unlabelled' ? postal.filter((r) => !r.label_run_id) : postal;
      if (!rows.length) { toast('Nobody to label'); return; }
      const doc = Labels.makePdf(rows, { layout: f.get('layout'), startAt: Number(f.get('startAt')) || 1,
        returnAddress: !!f.get('returnAddress'), sender: setting('sender_name', 'Clemo Books') + ', ' + setting('sender_address', '') });
      download(`clemo-club-${month.slice(0, 7)}-labels.pdf`, doc.output('blob'), 'application/pdf');
      await guard(() => api.recordLabelRun(month, rows.map((r) => r.subscription_id)));
      if (f.get('layout') !== setting('label_layout', 'L7160')) api.saveSettings({ label_layout: f.get('layout') }).then(() => { state.settings.label_layout = f.get('layout'); });
      closeDrawer(); toast(rows.length + ' labels downloaded'); viewMonth(month);
    });
  }

  // ---------- MEMBERS ----------
  let memberFilter = 'current', memberQuery = '', renderMembers = null;
  async function viewMembers(openId) {
    shell('members', html`<p class="muted">Loading…</p>`);
    const rows = await api.overview();
    const shown = (fn) => (r) => !r.hidden_at && fn(r);
    const filters = {
      current: ['Current', shown((r) => ['active', 'pending-cancel', 'on-hold', 'pending'].includes(r.status))],
      postal: ['Postal', shown((r) => r.plan === 'postal' && ['active', 'pending-cancel', 'on-hold'].includes(r.status))],
      local: ['Local', shown((r) => r.plan === 'local' && ['active', 'pending-cancel', 'on-hold'].includes(r.status))],
      gifts: ['Gifts', shown((r) => r.kind === 'gift')],
      attention: ['Needs attention', shown(needsAttention)],
      left: ['Left', shown((r) => ['cancelled', 'expired'].includes(r.status))],
      all: ['Everyone', shown(() => true)],
      hidden: ['Hidden', (r) => !!r.hidden_at],
    };
    const render = () => {
      const q = memberQuery.toLowerCase();
      const list = rows.filter(filters[memberFilter][1]).filter((r) => !q || [r.name, r.email, r.postcode, r.city].join(' ').toLowerCase().includes(q));
      document.getElementById('member-table').innerHTML = list.length ? html`<table class="data">
        <thead><tr><th>Name</th><th>Plan</th><th>Status</th><th class="hide-m">Member for</th><th class="hide-m">Last paid</th><th class="hide-m">Next payment</th><th class="r">Paid in total</th></tr></thead>
        <tbody>${list.map((r) => html`<tr class="clickable" data-open="${r.subscription_id}" tabindex="0">
          <td class="name">${r.name}</td><td>${planTag(r.plan, r.kind)}</td><td>${statusTag(r)}</td>
          <td class="hide-m">${r.kind === 'gift' ? (r.gift_start_month ? monthShort(r.gift_start_month) + '–' + monthShort(r.gift_end_month) + ' ' + r.gift_end_month.slice(0, 4) : 'Start month not set') : tenure(r.months_member)}</td>
          <td class="hide-m">${r.last_paid_at ? fmtShort(r.last_paid_at) : '–'}</td>
          <td class="hide-m">${r.kind === 'gift' ? '–' : r.next_payment_on && ['active', 'on-hold'].includes(r.status) ? fmtShort(r.next_payment_on) : '–'}</td>
          <td class="r">${gbp(r.total_paid)}</td></tr>`)}</tbody></table>`
        : html`<div class="empty-state">${q ? 'Nobody matches "' + memberQuery + '".' : 'Nobody here.'}</div>`;
      document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === memberFilter)));
      document.getElementById('member-count').textContent = list.length + (list.length === 1 ? ' person' : ' people');
    };
    shell('members', html`
      <div class="page-head"><div><h1>Members</h1><div class="sub" id="member-count"></div></div></div>
      <div class="filters">
        <div class="seg" role="group" aria-label="Show">${Object.entries(filters).map(([k, [label]]) => html`<button type="button" data-filter="${k}" aria-pressed="false">${label}${k === 'attention' || k === 'hidden' ? ' (' + rows.filter(filters[k][1]).length + ')' : ''}</button>`)}</div>
      </div>
      <div class="panel table-wrap" id="member-table"></div>`);
    render();
    renderMembers = render;
    app.onclick = (e) => {
      const f = e.target.closest('[data-filter]'); if (f) { memberFilter = f.dataset.filter; render(); return; }
      const r = e.target.closest('[data-open]'); if (r) { location.hash = '#/members/' + r.dataset.open; return; }
      const t = e.target.closest('[data-action]'); if (t) commonAction(t);
    };
    app.onkeydown = (e) => { const r = e.target.closest('[data-open]'); if (r && e.key === 'Enter') location.hash = '#/members/' + r.dataset.open; };
    if (openId) memberDrawer(rows.find((r) => r.subscription_id === openId), () => viewMembers());
  }

  const paymentStuck = (r) => r.kind === 'subscription' && !['cancelled', 'expired'].includes(r.status)
    && (r.status === 'on-hold' || ['failed', 'pending'].includes(r.last_payment_status));
  const firstName = (r) => (r.name || '').split(' ')[0] || 'there';
  const retryDateLabel = (iso) => fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: undefined });
  const fillTemplate = (text, r, retryIso) => String(text || '')
    .replace(/\{first_name\}/g, firstName(r)).replace(/\{name\}/g, r.name || '')
    .replace(/\{amount\}/g, gbp(r.last_payment_amount || r.price))
    .replace(/\{retry_date\}/g, retryIso ? retryDateLabel(retryIso) : '');
  const emailPreview = (subject, body, r, retryIso) => html`<div class="email-preview">
      <div class="email-subject">${fillTemplate(subject, r, retryIso)}</div>
      ${fillTemplate(body, r, retryIso).split('{pay_link}').map((part, i, all) => html`<div class="email-text">${part.trim()}</div>${i < all.length - 1 ? html`<div class="email-button">Pay now</div>` : ''}`)}
    </div>`;
  const cmdLabel = (c) => {
    const when = c.status === 'queued' ? (c.kind === 'charge' ? 'Booked for ' + fmtDate(c.run_at, { weekday: 'short', day: 'numeric', month: 'short', year: undefined }) : 'Waiting to send') : ago(c.finished_at || c.created_at);
    const what = c.kind === 'charge' ? 'Payment retry' : (c.payload && c.payload.template === 'paylink' ? 'Payment link email' : 'Retry email');
    const tag = { queued: html`<span class="tag plain">Booked</span>`, claimed: html`<span class="tag warn">Running</span>`, done: html`<span class="tag ok">${c.kind === 'charge' ? 'Done' : 'Sent'}</span>`,
      failed: html`<span class="tag bad">Failed</span>`, cancelled: html`<span class="tag plain">Cancelled</span>` }[c.status];
    return { when, what, tag };
  };

  async function memberDrawer(r, onChange) {
    if (!r) { toast('Member not found'); return; }
    const [pays, cmds] = await Promise.all([api.payments(r.subscription_id), api.commands(r.subscription_id)]);
    const stuck = paymentStuck(r);
    const queuedCharge = cmds.find((c) => c.kind === 'charge' && ['queued', 'claimed'].includes(c.status));
    const lastPoll = state.settings.connector_last_poll;
    const canDelete = r.kind === 'subscription' && ['cancelled', 'expired'].includes(r.status);
    const fromWoo = r.source === 'online' && r.kind === 'subscription';
    const d = drawer(html`
      <div class="drawer-head"><h2>${r.name}</h2><button class="btn ghost" data-close aria-label="Close">${icons.close}</button></div>
      <p>${planTag(r.plan, r.kind)} ${statusTag(r)}</p>
      <dl class="kv">
        ${r.kind === 'gift' ? html`
          <dt>Gift from</dt><dd>${r.gift_from || '–'}</dd>
          <dt>Runs</dt><dd>${r.gift_start_month ? monthName(r.gift_start_month) + ' to ' + monthName(r.gift_end_month) + ' (' + r.gift_months + ' months)' : 'Start month not set'}</dd>
          ${r.gift_message ? html`<dt>Message</dt><dd>${r.gift_message}</dd>` : ''}
          <dt>Bought</dt><dd>${r.source === 'in_store' ? 'In the shop' : 'Online'}, ${gbp(r.price)}</dd>`
        : html`
          <dt>Member since</dt><dd>${fmtDate(r.started_on)} (${tenure(r.months_member)})</dd>
          <dt>Price</dt><dd>${gbp(r.price)} a month</dd>
          <dt>Next payment</dt><dd>${['active', 'on-hold'].includes(r.status) && r.next_payment_on ? fmtDate(r.next_payment_on) : '–'}</dd>
          ${r.cancelled_at ? html`<dt>Cancelled</dt><dd>${fmtDate(r.cancelled_at)}${r.status === 'pending-cancel' && r.ended_at ? ', last paid period ends ' + fmtDate(r.ended_at) : ''}</dd>` : ''}
          <dt>WooCommerce</dt><dd>Subscription #${r.wp_subscription_id}</dd>`}
        <dt>Paid in total</dt><dd>${gbp(r.total_paid)} over ${r.payments_paid} ${r.payments_paid === 1 ? 'payment' : 'payments'}</dd>
        <dt>Email</dt><dd>${r.email ? html`<a href="mailto:${r.email}">${r.email}</a>` : '–'}</dd>
        <dt>Phone</dt><dd>${r.phone ? html`<a href="tel:${r.phone}">${r.phone}</a>` : '–'}</dd>
      </dl>

      ${r.kind === 'gift' ? html`<form id="gift-start" class="panel pad" style="margin-bottom:18px">
        <label class="field">Start month<input type="month" name="start" value="${r.gift_start_month ? r.gift_start_month.slice(0, 7) : ''}" required></label>
        <div style="margin-top:10px"><button class="btn primary" type="submit">Save start month</button></div></form>` : ''}

      <form id="member-form" style="display:grid;gap:12px">
        <h3>Address</h3>
        ${fromWoo ? html`<p class="small muted" style="margin:0">This comes from their WooCommerce subscription and is replaced on the next sync. Change it in WooCommerce to make it stick.</p>` : ''}
        <div class="form-grid">
          <label class="field wide">Address line 1<input type="text" name="address_1" value="${r.address_1 || ''}"></label>
          <label class="field wide">Address line 2<input type="text" name="address_2" value="${r.address_2 || ''}"></label>
          <label class="field">Town<input type="text" name="city" value="${r.city || ''}"></label>
          <label class="field">County<input type="text" name="county" value="${r.county || ''}"></label>
          <label class="field">Postcode<input type="text" name="postcode" value="${r.postcode || ''}"></label>
        </div>
        <label class="field">Notes (only you see these)<textarea name="notes">${r.member_notes || ''}</textarea></label>
        <div><button class="btn primary" type="submit">Save</button></div>
      </form>

      ${stuck || cmds.length ? html`<section class="pay-actions panel pad">
        <h3>Payment ${stuck ? html`<span class="tag bad">Not paid</span>` : ''}</h3>
        ${stuck ? html`<p class="small muted" style="margin:6px 0 12px">The last renewal of ${gbp(r.last_payment_amount || r.price)} didn't go through.
          ${lastPoll ? html`The website checks for retries every 5 minutes (last checked ${ago(lastPoll)}).` : html`<b>The website hasn't checked in yet.</b> Update the Clemo Club Connector plugin to version 1.1 first.`}</p>
          <div class="btn-row">
            <button class="btn primary" type="button" data-act="show-retry" ${raw(queuedCharge ? 'disabled' : '')}>Retry payment…</button>
            <button class="btn" type="button" data-act="show-link">Send payment link…</button>
          </div>
          <form id="retry-form" class="act-form" hidden>
            <label class="field">Try the card again on
              <input type="date" name="date" id="retry-date" required min="${todayISO()}" value="${addDays(todayISO(), 3)}"></label>
            <p class="small muted" style="margin:0">Choosing today retries within 5 minutes. Other days retry at 10am.</p>
            <label class="check"><input type="checkbox" name="email" id="retry-email" checked> Email ${firstName(r)} to say when we'll try again</label>
            <div id="retry-preview"></div>
            <div class="btn-row"><button class="btn primary" type="submit">Book retry</button><button class="btn ghost" type="button" data-act="hide-forms">Cancel</button></div>
          </form>
          <form id="link-form" class="act-form" hidden>
            <p class="small" style="margin:0">This emails ${r.email || 'the customer'} a link to pay for the failed renewal, using a new card if they need to.</p>
            ${emailPreview(setting('email_paylink_subject', ''), setting('email_paylink_body', ''), r, null)}
            <div class="btn-row"><button class="btn primary" type="submit">Send payment link</button><button class="btn ghost" type="button" data-act="hide-forms">Cancel</button></div>
          </form>` : ''}
        ${cmds.length ? html`<ul class="list cmd-list">${cmds.map((c) => { const l = cmdLabel(c); return html`<li>
          <div class="alert-main"><b>${l.what}</b> ${l.tag}<p>${l.when}${c.result ? html` · ${c.result}` : ''}</p></div>
          ${c.status === 'queued' ? html`<button class="btn small ghost" type="button" data-act="cancel-cmd" data-id="${c.id}">Cancel</button>` : ''}</li>`; })}</ul>` : ''}
      </section>` : ''}

      <h3 style="margin-top:26px">Payments</h3>
      ${pays.length ? html`<table class="data" style="margin-top:6px"><tbody>${pays.map((p) => html`<tr>
        <td>${fmtDate(p.paid_at || p.order_date || p.created_at)}</td>
        <td>${p.kind === 'signup' ? 'Joined' : p.kind === 'renewal' ? 'Renewal' : 'Gift'}</td>
        <td>${p.status === 'paid' ? html`<span class="tag ok">Paid</span>` : p.status === 'failed' ? html`<span class="tag bad">Failed</span>` : html`<span class="tag plain">${p.status}</span>`}</td>
        <td class="r">${gbp(p.amount)}</td></tr>`)}</tbody></table>` : html`<p class="muted">No payments recorded.</p>`}

      <section class="hide-zone">
        ${r.hidden_at ? html`<p class="small">Hidden from your lists since ${fmtDate(r.hidden_at)}. They'll come back on their own if a new payment comes through.</p>
          <button class="btn" type="button" data-act="unhide">Show in lists again</button>`
        : html`<div class="btn-row"><button class="btn" type="button" data-act="ask-hide">Hide from lists</button>
          ${canDelete ? html`<button class="btn danger" type="button" data-act="ask-delete">Delete…</button>` : ''}</div>
          <div class="confirm" id="confirm-hide" hidden>
            <p class="small">${['active', 'on-hold', 'pending-cancel'].includes(r.status) && !(r.kind === 'gift' && r.gift_end_month && r.gift_end_month < THIS_MONTH)
              ? html`<b>${firstName(r)} is still a current member.</b> Hiding only takes them out of your lists: they'll still get the book each month, and any new payment brings them back.`
              : html`They'll disappear from your lists and alerts. If a new payment or subscription comes through, they'll reappear.`}</p>
            <div class="btn-row"><button class="btn primary" type="button" data-act="hide">Hide</button><button class="btn ghost" type="button" data-act="hide-forms">Cancel</button></div>
          </div>
          <div class="confirm danger" id="confirm-delete" hidden>
            <p class="small"><b>This wipes ${firstName(r)}'s name, email, phone and address from the dashboard for good.</b> Their payments stay in your totals without a name, and nothing changes in WooCommerce. If they subscribe again they'll appear as a new member.</p>
            <div class="btn-row"><button class="btn primary danger-fill" type="button" data-act="delete">Delete for good</button><button class="btn ghost" type="button" data-act="hide-forms">Cancel</button></div>
          </div>`}
      </section>
    `);
    const refresh = () => { closeDrawer(); onChange && onChange(); };
    const hideForms = () => d.querySelectorAll('.act-form, .confirm').forEach((el) => { el.hidden = true; });
    const showRetryPreview = () => {
      const date = d.querySelector('#retry-date').value;
      d.querySelector('#retry-preview').innerHTML = d.querySelector('#retry-email').checked
        ? emailPreview(setting('email_retry_subject', ''), setting('email_retry_body', ''), r, date) : '';
    };
    d.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-act]'); if (!t) return;
      const act = t.dataset.act;
      if (act === 'hide-forms') hideForms();
      if (act === 'show-retry') { hideForms(); d.querySelector('#retry-form').hidden = false; showRetryPreview(); }
      if (act === 'show-link') { hideForms(); d.querySelector('#link-form').hidden = false; }
      if (act === 'ask-hide') { hideForms(); d.querySelector('#confirm-hide').hidden = false; }
      if (act === 'ask-delete') { hideForms(); d.querySelector('#confirm-delete').hidden = false; }
      if (act === 'hide') { await guard(() => api.setHidden(r.subscription_id, true), r.name + ' hidden'); refresh(); }
      if (act === 'unhide') { await guard(() => api.setHidden(r.subscription_id, false), r.name + ' is back in your lists'); refresh(); }
      if (act === 'delete') { t.disabled = true; await guard(() => api.deleteSubscription(r.subscription_id), 'Deleted'); refresh(); }
      if (act === 'cancel-cmd') { await guard(() => api.cancelCommand(t.dataset.id), 'Cancelled'); closeDrawer(); memberDrawer(r, onChange); }
    });
    const rf = d.querySelector('#retry-form');
    if (rf) {
      rf.addEventListener('input', showRetryPreview);
      rf.addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = rf.date.value;
        if (!date || date < todayISO()) { toast('Choose today or a later date'); return; }
        const runAt = date === todayISO() ? new Date().toISOString() : date + ' 10:00:00 Europe/London';
        const rows = [{ kind: 'charge', run_at: runAt, payload: { retry_date: retryDateLabel(date) } }];
        if (rf.email.checked) rows.unshift({ kind: 'email', run_at: new Date().toISOString(), payload: { template: 'retry',
          subject: setting('email_retry_subject', ''), body: setting('email_retry_body', ''), retry_date: retryDateLabel(date) } });
        await guard(() => api.bookCommands(r, rows), date === todayISO() ? 'Retrying within 5 minutes' : 'Retry booked for ' + retryDateLabel(date));
        closeDrawer(); memberDrawer(r, onChange);
      });
    }
    const lf = d.querySelector('#link-form');
    if (lf) lf.addEventListener('submit', async (e) => {
      e.preventDefault();
      await guard(() => api.bookCommands(r, [{ kind: 'email', run_at: new Date().toISOString(), payload: { template: 'paylink',
        subject: setting('email_paylink_subject', ''), body: setting('email_paylink_body', '') } }]), 'Payment link will be sent within 5 minutes');
      closeDrawer(); memberDrawer(r, onChange);
    });
    d.querySelector('[data-close]').onclick = () => { closeDrawer(); history.replaceState(null, '', '#/members'); };
    d.querySelector('#member-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const v = (k) => (f.get(k) || '').trim() || null;
      await guard(() => api.updateMember(r.member_id, { address_1: v('address_1'), address_2: v('address_2'), city: v('city'), county: v('county'),
        postcode: v('postcode') ? v('postcode').toUpperCase() : null, notes: v('notes') }), 'Saved');
      closeDrawer(); onChange && onChange();
    });
    const gs = d.querySelector('#gift-start');
    if (gs) gs.addEventListener('submit', async (e) => {
      e.preventDefault();
      const start = new FormData(e.target).get('start') + '-01';
      await guard(() => api.updateSubscription(r.subscription_id, { gift_start_month: start, started_on: start, needs_start_month: false }), 'Start month saved');
      closeDrawer(); onChange && onChange();
    });
  }

  // ---------- GIFTS ----------
  async function viewGifts() {
    shell('gifts', html`<p class="muted">Loading…</p>`);
    const rows = (await api.overview()).filter((r) => r.kind === 'gift' && !r.hidden_at);
    const soon = addMonths(THIS_MONTH, 1);
    const groups = [
      ['Start month needed', rows.filter((r) => !r.gift_start_month && r.status !== 'cancelled')],
      ['Running', rows.filter((r) => r.gift_start_month && r.status === 'active' && r.gift_start_month <= THIS_MONTH)],
      ['Starting later', rows.filter((r) => r.gift_start_month && r.status === 'active' && r.gift_start_month > THIS_MONTH)],
      ['Finished', rows.filter((r) => ['expired', 'cancelled'].includes(r.status))],
    ];
    shell('gifts', html`
      <div class="page-head"><div><h1>Gifts</h1><div class="sub">3, 6 and 12 month gift memberships, bought online or in the shop.</div></div>
        <div class="actions"><button class="btn primary" data-action="add-gift">${icons.plus} Add a shop gift</button></div></div>
      ${groups.map(([title, list]) => list.length ? html`<section class="section">
        <div class="section-head"><h2>${title}</h2><span class="muted">${list.length}</span></div>
        <div class="panel table-wrap"><table class="data"><thead><tr><th>For</th><th>Plan</th><th>Runs</th><th class="hide-m">From</th><th class="r">Paid</th><th></th></tr></thead>
        <tbody>${list.map((r) => html`<tr class="clickable" data-open="${r.subscription_id}" tabindex="0">
          <td class="name">${r.name}</td><td>${planTag(r.plan, 'subscription')} <span class="small muted">${r.gift_months} mo</span></td>
          <td>${r.gift_start_month ? monthShort(r.gift_start_month) + ' ' + r.gift_start_month.slice(0, 4) + ' – ' + monthShort(r.gift_end_month) + ' ' + r.gift_end_month.slice(0, 4) : html`<span class="tag warn">Set start month</span>`}
            ${r.status === 'active' && r.gift_end_month && r.gift_end_month <= soon && r.gift_end_month >= THIS_MONTH ? html` <span class="tag warn">Ending</span>` : ''}</td>
          <td class="hide-m">${r.gift_from || '–'}${r.source === 'in_store' ? html` <span class="tag plain">Shop</span>` : ''}</td>
          <td class="r">${gbp(r.price)}</td><td class="r"><span class="btn small ghost">Open</span></td></tr>`)}</tbody></table></div></section>` : '')}
      ${rows.length ? '' : html`<div class="panel empty-state">No gift memberships yet. Online gifts appear here automatically; add shop gifts with the button above.</div>`}`);
    app.onclick = (e) => {
      const o = e.target.closest('[data-open]'); if (o) { memberDrawer(rows.find((r) => r.subscription_id === o.dataset.open), viewGifts); return; }
      const t = e.target.closest('[data-action]'); if (!t) return;
      if (t.dataset.action === 'add-gift') addGiftDrawer(); else commonAction(t);
    };
  }

  function addGiftDrawer() {
    const d = drawer(html`
      <div class="drawer-head"><h2>Add a shop gift</h2><button class="btn ghost" data-close aria-label="Close">${icons.close}</button></div>
      <form id="gift-form" style="display:grid;gap:14px">
        <div class="form-grid">
          <label class="field">Recipient first name<input type="text" name="first_name" required></label>
          <label class="field">Last name<input type="text" name="last_name"></label>
          <label class="field">Plan<select name="plan"><option value="local">Local (collect)</option><option value="postal">Postal</option></select></label>
          <label class="field">Length<select name="months"><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option></select></label>
          <label class="field">Starts<input type="month" name="start" required value="${THIS_MONTH.slice(0, 7)}"></label>
          <label class="field">Price paid (£)<input type="number" name="price" step="0.01" min="0" required></label>
          <label class="field wide">From (who bought it)<input type="text" name="from"></label>
          <label class="field wide">Handwritten message<textarea name="message"></textarea></label>
        </div>
        <h3>Address <span class="small muted" style="font-family:var(--sans);font-weight:400">needed for postal</span></h3>
        <div class="form-grid">
          <label class="field wide">Address line 1<input type="text" name="address_1"></label>
          <label class="field wide">Address line 2<input type="text" name="address_2"></label>
          <label class="field">Town<input type="text" name="city"></label>
          <label class="field">Postcode<input type="text" name="postcode"></label>
          <label class="field">Email<input type="email" name="email"></label>
          <label class="field">Phone<input type="text" name="phone"></label>
        </div>
        <div><button class="btn primary" type="submit">Add gift</button></div>
      </form>`);
    d.querySelector('[data-close]').onclick = closeDrawer;
    const form = d.querySelector('#gift-form');
    const prices = { local: { 3: 51, 6: 102, 12: 204 }, postal: { 3: 60, 6: 120, 12: 240 } };
    const setPrice = () => { const p = form.plan.value, m = form.months.value; if (!form.price.dataset.touched) form.price.value = prices[p][m]; };
    form.price.addEventListener('input', () => { form.price.dataset.touched = '1'; });
    form.plan.addEventListener('change', setPrice); form.months.addEventListener('change', setPrice); setPrice();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form); const v = (k) => (f.get(k) || '').trim();
      if (v('plan') === 'postal' && (!v('address_1') || !v('postcode'))) { toast('Postal gifts need an address and postcode'); return; }
      await guard(() => api.addGift({ first_name: v('first_name'), last_name: v('last_name'), plan: v('plan'), months: Number(v('months')),
        start_month: v('start') + '-01', price: Number(v('price')), from: v('from'), message: v('message'),
        address_1: v('address_1'), address_2: v('address_2'), city: v('city'), postcode: v('postcode'), email: v('email'), phone: v('phone') }), 'Gift added');
      closeDrawer(); viewGifts();
    });
  }

  // ---------- MONEY ----------
  async function viewMoney() {
    shell('money', html`<p class="muted">Loading…</p>`);
    const hist = (await api.history(12)).slice().reverse();
    const max = Math.max(1, ...hist.map((h) => Math.abs(h.profit)));
    const tot = (k) => hist.reduce((a, h) => a + Number(h[k] || 0), 0);
    shell('money', html`
      <div class="page-head"><div><h1>Money</h1><div class="sub">The last 12 months of Clemo Club.</div></div></div>
      <div class="figures">
        <div class="figure"><b>${gbp(tot('revenue'), 0)}</b><span>income, 12 months</span></div>
        <div class="figure"><b>${gbp(tot('costs'), 0)}</b><span>costs</span></div>
        <div class="figure ${tot('profit') >= 0 ? 'good' : 'bad'}"><b>${gbp(tot('profit'), 0)}</b><span>profit</span></div>
        <div class="figure"><b>${gbp(tot('profit') / Math.max(1, hist.filter((h) => h.total_members).length), 0)}</b><span>average a month</span></div>
      </div>
      <section class="section">
        <div class="section-head"><h2>Profit by month</h2></div>
        <div class="panel pad" style="padding-bottom:34px"><div class="bars" role="img" aria-label="Profit by month">
          ${hist.map((h, i) => html`<div class="bar ${h.profit < 0 ? 'neg' : ''} ${i === hist.length - 1 ? 'now' : ''}"><em>${gbp(h.profit, 0)}</em><i style="height:${Math.max(2, Math.round(Math.abs(h.profit) / max * 100))}%"></i><span>${monthShort(h.month)}</span></div>`)}
        </div></div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Month by month</h2></div>
        <div class="panel table-wrap"><table class="data">
          <thead><tr><th>Month</th><th class="hide-m">Book</th><th class="r">Members</th><th class="r">Income</th><th class="r hide-m">Books</th><th class="r hide-m">Postage & packing</th><th class="r hide-m">Card fees</th><th class="r hide-m">Other</th><th class="r">Profit</th></tr></thead>
          <tbody>${hist.slice().reverse().map((h) => html`<tr class="clickable" data-month="${h.month}" tabindex="0">
            <td class="name">${monthName(h.month)}</td><td class="hide-m">${h.book ? h.book.title : html`<span class="muted">–</span>`}${h.missing_book_cost && h.book ? html` <span class="tag warn">No cost</span>` : ''}</td>
            <td class="r">${h.total_members}</td><td class="r">${gbp(h.revenue)}</td><td class="r hide-m">${gbp(h.book_cost)}</td>
            <td class="r hide-m">${gbp(h.postage + h.packaging)}</td><td class="r hide-m">${gbp(h.card_fees)}</td><td class="r hide-m">${gbp(h.extra_costs)}</td>
            <td class="r"><b>${gbp(h.profit)}</b></td></tr>`)}</tbody>
          <tfoot><tr><td>Total</td><td class="hide-m"></td><td></td><td class="r">${gbp(tot('revenue'))}</td><td class="r hide-m">${gbp(tot('book_cost'))}</td><td class="r hide-m">${gbp(tot('postage') + tot('packaging'))}</td><td class="r hide-m">${gbp(tot('card_fees'))}</td><td class="r hide-m">${gbp(tot('extra_costs'))}</td><td class="r">${gbp(tot('profit'))}</td></tr></tfoot>
        </table></div>
        <p class="small muted" style="margin-top:10px">Subscription income counts in the month the payment was taken. Gift memberships are spread evenly over the months they cover. Card fees use Stripe's real fee where WooCommerce has it, otherwise your rate in Settings.</p>
      </section>`);
    app.onclick = (e) => { const m = e.target.closest('[data-month]'); if (m) location.hash = '#/month/' + m.dataset.month; const t = e.target.closest('[data-action]'); if (t) commonAction(t); };
  }

  // ---------- PAST BOOKS ----------
  const spineColour = (s) => { const c = ['#16181D', '#2D5B8C', '#B3542E', '#3F6B4E', '#6B4E8C', '#A87A2A', '#8C3A4A', '#4A4F57']; let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return c[h % c.length]; };
  async function viewBooks() {
    shell('books', html`<p class="muted">Loading…</p>`);
    const books = await api.books();
    const sums = await Promise.all(books.map((b) => api.summary(b.month)));
    shell('books', html`
      <div class="page-head"><div><h1>Past books</h1><div class="sub">Every Clemo Club pick so far.</div></div></div>
      ${books.length ? html`
        <div class="shelf" aria-label="Bookshelf">${books.slice().reverse().map((b) => b.cover_url
          ? html`<button class="book has-cover" data-month="${b.month}" title="${b.title}, ${monthName(b.month)}"><img src="${b.cover_url}" alt="${b.title}" referrerpolicy="no-referrer" loading="lazy" onerror="this.parentNode.classList.remove('has-cover');this.parentNode.style.background='${spineColour(b.title)}';this.replaceWith(document.createTextNode(this.alt))"></button>`
          : html`<button class="book" data-month="${b.month}" style="background:${spineColour(b.title)};height:${130 + (b.title.length % 5) * 12}px" title="${b.title}, ${monthName(b.month)}">${b.title}</button>`)}</div>
        <div class="panel table-wrap" style="margin-top:22px"><table class="data">
          <thead><tr><th>Month</th><th>Book</th><th class="r">Members</th><th class="r hide-m">Copies</th><th class="r hide-m">Cost a copy</th><th class="r">Profit</th></tr></thead>
          <tbody>${books.map((b, i) => html`<tr class="clickable" data-month="${b.month}" tabindex="0">
            <td>${monthName(b.month)}</td><td><span class="name">${b.title}</span><br><span class="small muted">${b.author || ''}</span></td>
            <td class="r">${sums[i].total_members}</td><td class="r hide-m">${sums[i].copies}</td><td class="r hide-m">${gbp(b.cost_per_copy)}</td>
            <td class="r">${gbp(sums[i].profit)}</td></tr>`)}</tbody></table></div>`
      : html`<div class="panel empty-state">Books you add on This month are kept here.</div>`}`);
    app.onclick = (e) => { const m = e.target.closest('[data-month]'); if (m) location.hash = '#/month/' + m.dataset.month; const t = e.target.closest('[data-action]'); if (t) commonAction(t); };
  }

  // ---------- SETTINGS ----------
  async function viewSettings() {
    shell('settings', html`<p class="muted">Loading…</p>`);
    const [s, staff, log] = await Promise.all([api.settings(), api.staff(), api.eventLog()]);
    state.settings = s;
    const v = (k, d) => (s[k] == null ? d : s[k]);
    shell('settings', html`
      <div class="page-head"><div><h1>Settings</h1></div></div>
      <form id="settings-form">
        <section class="section" style="margin-top:0"><div class="section-head"><h2>Costs</h2></div>
          <div class="panel pad form-grid">
            <label class="field">Postage per parcel (£)<input type="number" step="0.01" min="0" name="postage_per_parcel" value="${v('postage_per_parcel', 2.7)}"></label>
            <label class="field">Packaging per parcel (£)<input type="number" step="0.01" min="0" name="packaging_per_parcel" value="${v('packaging_per_parcel', 0.5)}"></label>
            <label class="field">Stripe fee (%)<input type="number" step="0.01" min="0" name="stripe_percent" value="${v('stripe_percent', 1.5)}"></label>
            <label class="field">Stripe fee per payment (£)<input type="number" step="0.01" min="0" name="stripe_fixed" value="${v('stripe_fixed', 0.2)}"></label>
            <label class="field">Spare copies to order<input type="number" step="1" min="0" name="spare_copies" value="${v('spare_copies', 1)}"></label>
          </div></section>
        <section class="section"><div class="section-head"><h2>Alerts</h2></div>
          <div class="panel pad form-grid">
            <label class="field">Overdue after (days late)<input type="number" step="1" min="0" name="grace_days" value="${v('grace_days', 3)}"></label>
            <label class="field">"Labels ready" alert on day<input type="number" step="1" min="1" max="28" name="label_alert_day" value="${v('label_alert_day', 1)}"></label>
            <label class="field">Warn before a gift ends (days)<input type="number" step="1" min="0" name="gift_ending_alert_days" value="${v('gift_ending_alert_days', 14)}"></label>
          </div></section>
        <section class="section"><div class="section-head"><h2>Labels and Click & Drop</h2></div>
          <div class="panel pad form-grid">
            <label class="field">Label sheet<select name="label_layout">${Object.entries(Labels.LAYOUTS).map(([k, l]) => html`<option value="${k}" ${raw(k === v('label_layout', 'L7160') ? 'selected' : '')}>${l.name}</option>`)}</select></label>
            <label class="field">Parcel weight (g)<input type="number" step="1" min="1" name="parcel_weight_g" value="${v('parcel_weight_g', 400)}"></label>
            <label class="field">Package size<select name="click_drop_package">${['Large letter', 'Small parcel', 'Medium parcel'].map((p) => html`<option ${raw(p === v('click_drop_package', 'Large letter') ? 'selected' : '')}>${p}</option>`)}</select></label>
            <label class="field">Royal Mail service code<input type="text" name="click_drop_service" value="${v('click_drop_service', '')}" placeholder="e.g. CRL2 (optional)"></label>
            <label class="field wide">Return name<input type="text" name="sender_name" value="${v('sender_name', 'Clemo Books')}"></label>
            <label class="field wide">Return address<input type="text" name="sender_address" value="${v('sender_address', '')}"></label>
            <label class="check wide"><input type="checkbox" name="label_return_address" ${raw(v('label_return_address', false) ? 'checked' : '')}> Add a small return address to labels by default</label>
          </div></section>
        <section class="section"><div class="section-head"><h2>Payment emails</h2></div>
          <div class="panel pad" style="display:grid;gap:14px">
            <p class="small muted" style="margin:0">Sent from your shop's email address in WooCommerce's email style. You can use
              <code>{first_name}</code>, <code>{name}</code>, <code>{amount}</code>, <code>{retry_date}</code> and <code>{pay_link}</code>.
              <code>{pay_link}</code> becomes a "Pay now" button.</p>
            <label class="field">"We'll try again" email: subject<input type="text" name="email_retry_subject" value="${v('email_retry_subject', '')}"></label>
            <label class="field">"We'll try again" email: message<textarea name="email_retry_body" rows="9">${v('email_retry_body', '')}</textarea></label>
            <label class="field">Payment link email: subject<input type="text" name="email_paylink_subject" value="${v('email_paylink_subject', '')}"></label>
            <label class="field">Payment link email: message<textarea name="email_paylink_body" rows="8">${v('email_paylink_body', '')}</textarea></label>
          </div></section>
        <p style="margin-top:16px"><button class="btn primary" type="submit">Save settings</button></p>
      </form>

      <section class="section"><div class="section-head"><h2>Who can sign in</h2></div>
        <div class="panel">${html`<ul class="list">${staff.map((p) => html`<li><div class="alert-main"><b>${p.name || p.email}</b><p>${p.email}</p></div>
          ${staff.length > 1 && (!state.me || p.email !== state.me.email) ? html`<button class="btn small ghost danger" data-action="rm-staff" data-email="${p.email}">Remove</button>` : ''}</li>`)}</ul>`}</div>
        <form id="staff-form" class="form-grid" style="margin-top:12px">
          <label class="field">Name<input type="text" name="name"></label>
          <label class="field">Email<input type="email" name="email" required></label>
          <div style="align-self:end"><button class="btn" type="submit">${icons.plus} Add person</button></div>
        </form>
        <p class="small muted" style="margin-top:8px">They also need a login: invite the same email in Supabase under Authentication → Users.</p>
      </section>

      <section class="section"><div class="section-head"><h2>Your password</h2></div>
        <form id="pw-form" class="panel pad form-grid">
          <label class="field">New password<input type="password" id="pw-new" name="pw" minlength="10" autocomplete="new-password" required></label>
          <label class="field">Type it again<input type="password" id="pw-again" name="pw2" minlength="10" autocomplete="new-password" required></label>
          <div style="align-self:end"><button class="btn" type="submit">Change password</button></div>
          <p class="small muted wide" style="margin:0">At least 10 characters.</p>
        </form>
      </section>

      <section class="section"><div class="section-head"><h2>Connection to the website</h2>
        <div class="right"><button class="btn small" data-action="run-checks">${icons.refresh} Run checks now</button></div></div>
        <div class="panel table-wrap">${log.length ? html`<table class="data"><thead><tr><th>When</th><th>What</th><th>WooCommerce #</th><th>Result</th></tr></thead>
          <tbody>${log.map((l) => html`<tr><td>${ago(l.received_at)}</td><td>${l.event_type}</td><td>${l.wp_id || '–'}</td>
            <td>${/^error/.test(l.result) ? html`<span class="tag bad">${l.result}</span>` : l.result === 'ok' || l.result === 'pong' ? html`<span class="tag ok">OK</span>` : html`<span class="tag plain">${l.result}</span>`}</td></tr>`)}</tbody></table>`
          : html`<div class="empty-state">Nothing received from the website yet. Install the Clemo Club Connector plugin and press "Sync everything now".</div>`}</div>
      </section>`);

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const nums = ['postage_per_parcel', 'packaging_per_parcel', 'stripe_percent', 'stripe_fixed', 'spare_copies', 'grace_days', 'label_alert_day', 'gift_ending_alert_days', 'parcel_weight_g'];
      const out = {};
      nums.forEach((k) => { out[k] = Number(f.get(k)); });
      ['label_layout', 'click_drop_service', 'click_drop_package', 'sender_name', 'sender_address', 'email_retry_subject', 'email_paylink_subject'].forEach((k) => { out[k] = (f.get(k) || '').trim(); });
      ['email_retry_body', 'email_paylink_body'].forEach((k) => { out[k] = (f.get(k) || '').replace(/\r\n/g, '\n').trim(); });
      if (!out.email_retry_body.includes('{pay_link}') || !out.email_paylink_body.includes('{pay_link}')) { toast('Keep {pay_link} in both emails so customers can pay'); return; }
      out.label_return_address = !!f.get('label_return_address');
      await guard(() => api.saveSettings(out), 'Settings saved');
      Object.assign(state.settings, out);
    });
    document.getElementById('pw-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      if (f.get('pw') !== f.get('pw2')) { toast('The two passwords don’t match'); return; }
      await guard(() => api.changePassword(f.get('pw')), 'Password changed');
      e.target.reset();
    });
    document.getElementById('staff-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      await guard(() => api.addStaff(f.get('email'), f.get('name')), 'Added'); viewSettings();
    });
    app.onclick = async (e) => {
      const t = e.target.closest('[data-action]'); if (!t) return;
      if (t.dataset.action === 'rm-staff') { if (confirm('Remove ' + t.dataset.email + '?')) { await guard(() => api.removeStaff(t.dataset.email), 'Removed'); viewSettings(); } }
      else if (t.dataset.action === 'run-checks') { const r = await guard(() => api.runChecks()); toast('Checks done: ' + r.overdue + ' overdue'); refreshAlerts(); }
      else commonAction(t);
    };
  }

  // ---------- shared actions ----------
  async function commonAction(t) {
    const a = t.dataset.action;
    if (a === 'signout') { await api.signOut(); location.hash = ''; boot(); }
    if (a === 'alert-read') { await guard(() => api.markAlert(t.dataset.id)); const al = state.alerts.find((x) => x.id === t.dataset.id); if (al) al.read_at = new Date().toISOString(); route(); }
    if (a === 'all-read') { await guard(() => api.markAllAlerts(), 'All done'); state.alerts.forEach((x) => { x.read_at = x.read_at || new Date().toISOString(); }); route(); }
  }
  async function refreshAlerts() { state.alerts = await api.alerts(); }

  // ---------- routing ----------
  async function route() {
    closeDrawer();
    app.onclick = (e) => { const t = e.target.closest('[data-action]'); if (t) commonAction(t); };
    app.onchange = null; app.onkeydown = null;
    const [, page, arg] = (location.hash.replace(/^#\/?/, '') || 'overview').match(/^([^/]*)\/?(.*)$/) || [];
    try {
      if (page === 'month') await viewMonth(arg || THIS_MONTH);
      else if (page === 'members') await viewMembers(arg || null);
      else if (page === 'gifts') await viewGifts();
      else if (page === 'money') await viewMoney();
      else if (page === 'books') await viewBooks();
      else if (page === 'settings') await viewSettings();
      else await viewOverview();
      window.scrollTo(0, 0);
    } catch (e) {
      console.error(e);
      shell(page || 'overview', html`<div class="notice danger"><b>Couldn't load this page.</b> ${e.message}</div><p><button class="btn" onclick="location.reload()">Try again</button></p>`);
    }
  }
  window.addEventListener('hashchange', route);

  // ---------- sign in ----------
  function signIn(msg) {
    app.innerHTML = html`<div class="signin"><form id="signin">
      ${brand()}
      <h1>Sign in</h1>
      ${msg ? html`<div class="notice danger">${msg}</div>` : ''}
      <label class="field">Email<input type="email" name="email" autocomplete="username" required></label>
      <label class="field">Password<input type="password" name="password" autocomplete="current-password" required></label>
      <button class="btn primary" type="submit">Sign in</button>
    </form>
    <img class="ink-art signin-street" src="img/shopfront.webp" alt="" width="1600" height="417" decoding="async"></div>`;
    document.getElementById('signin').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      try { await api.signIn(f.get('email').trim(), f.get('password')); boot(); }
      catch (err) { signIn('That email and password didn’t work. Check them and try again.'); }
    });
  }

  async function boot() {
    const s = await api.session();
    if (!s) return signIn();
    state.me = await api.whoAmI();
    if (!state.me.isStaff) return signIn(state.me.email + ' isn’t on the staff list yet. Add it to the staff table in Supabase.');
    try { state.settings = await api.settings(); state.alerts = await api.alerts(); } catch (e) { console.error(e); }
    api.watchAlerts((a) => { state.alerts.unshift(a); toast(a.title); if (/^#?\/?(overview)?$/.test(location.hash.replace('#', ''))) route(); });
    route();
  }
  boot();
})();
