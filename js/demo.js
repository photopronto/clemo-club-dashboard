// Demo backend: sample members kept in memory, same calls as the live API.
(function () {
  window.DemoApi = function () {
    const { todayISO, monthStart, addMonths } = U;
    const today = todayISO();
    const thisMonth = monthStart(today);
    let seq = 1;
    const id = () => 'demo-' + (seq++);
    const daysAgo = (n) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
    const addMonthsDate = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10); };

    const settings = {
      grace_days: 3, postage_per_parcel: 2.70, packaging_per_parcel: 0.50, stripe_percent: 1.5, stripe_fixed: 0.20,
      spare_copies: 1, label_layout: 'L7160', label_alert_day: 1, gift_ending_alert_days: 14,
      parcel_weight_g: 400, click_drop_service: '', sender_name: 'Clemo Books', sender_address: '33b Bank St, Newquay, Cornwall, TR7 1DJ',
      connector_last_poll: new Date(Date.now() - 3 * 60000).toISOString(),
      email_retry_subject: 'Your Clemo Club payment didn\'t go through',
      email_retry_body: 'Hi {first_name},\n\nWe tried to take your Clemo Club payment of {amount}, but it didn\'t go through.\n\nWe\'ll try again on {retry_date}, so there\'s nothing you need to do if your card is fine. If your card has changed or expired, you can pay with a different one here:\n\n{pay_link}\n\nAny questions, just reply to this email.\n\nThanks,\nClemo Books',
      email_paylink_subject: 'Pay for your Clemo Club subscription',
      email_paylink_body: 'Hi {first_name},\n\nYour Clemo Club payment of {amount} didn\'t go through. You can pay securely here, using a new card if yours has changed:\n\n{pay_link}\n\nAny questions, just reply to this email.\n\nThanks,\nClemo Books',
    };
    const S = (k, d) => (settings[k] == null ? d : Number(settings[k]));

    const people = [
      ['Mollie', 'Treloar', 'postal', 540, 'active', '4 Fore Street', 'St Agnes', 'TR5 0RS'],
      ['Jen', 'Pascoe', 'local', 470, 'active'],
      ['Sam', 'Hocking', 'postal', 420, 'active', '12 Lemon Street', 'Truro', 'TR1 2LS'],
      ['Priya', 'Nair', 'postal', 365, 'active', 'Flat 2, 9 Clifton Road', 'Bristol', 'BS8 1AF'],
      ['Tom', 'Rowe', 'local', 330, 'active'],
      ['Ellie', 'Kernick', 'local', 300, 'active'],
      ['Ruth', 'Angove', 'postal', 250, 'active', '3 Chapel Row', 'Penzance', 'TR18 4AQ'],
      ['Dan', 'Couch', 'local', 210, 'failed'],
      ['Grace', 'Polglase', 'postal', 180, 'pending-cancel', '27 Harbour View', 'Falmouth', 'TR11 3AB'],
      ['Luke', 'Bennetts', 'local', 150, 'active'],
      ['Hannah', 'Jago', 'postal', 120, 'active', '8 Rosewarne Gardens', 'Camborne', 'TR14 8BN'],
      ['Ollie', 'Tremayne', 'local', 95, 'active'],
      ['Beth', 'Carne', 'postal', 64, 'active', '15 St Michael’s Road', 'Perranporth', 'TR6 0DR'],
      ['Kate', 'Rescorla', 'local', 33, 'active'],
      ['Will', 'Penrose', 'postal', 6, 'active', '1 Mill Lane', 'Exeter', 'EX2 4QQ'],
      ['Amy', 'Trewin', 'local', 400, 'cancelled'],
      ['Joe', 'Nance', 'postal', 300, 'cancelled', '6 Quay Street', 'Padstow', 'PL28 8AD'],
    ];

    const members = [], subs = [], payments = [], fulfilment = [], alerts = [], books = [], costs = [], labelRuns = [], commands = [];

    people.forEach((p, i) => {
      const [first, last, plan, startAgo, status, a1, city, pc] = p;
      const m = { id: id(), email: (first + '.' + last).toLowerCase() + '@example.com', first_name: first, last_name: last,
        phone: '07700 9000' + String(10 + i), address_1: a1 || null, address_2: null, city: city || null, county: null, postcode: pc || null, country: 'GB', notes: null };
      members.push(m);
      const started = daysAgo(startAgo);
      const price = plan === 'postal' ? 19.99 : 16.99;
      const s = { id: id(), member_id: m.id, kind: 'subscription', plan, source: 'online', status: status === 'failed' ? 'on-hold' : status,
        price, wp_subscription_id: 3000 + i, started_on: started, next_payment_on: null, cancelled_at: null, ended_at: null, notes: null };
      // monthly payments
      let due = started, n = 0;
      const stopAt = status === 'cancelled' ? daysAgo(Math.max(20, startAgo - 150)) : today;
      while (due <= stopAt) {
        const failed = status === 'failed' && addMonthsDate(due, 1) > today;
        payments.push({ id: id(), ref: 'order:' + (5000 + payments.length), wp_order_id: 5000 + payments.length, subscription_id: s.id, member_id: m.id,
          kind: n === 0 ? 'signup' : 'renewal', status: failed ? 'failed' : 'paid', amount: price,
          fee: Math.round((price * 0.015 + 0.2) * 100) / 100, fee_estimated: false,
          paid_at: failed ? null : due + 'T09:12:00Z', order_date: due + 'T09:10:00Z', created_at: due + 'T09:10:00Z' });
        n++; due = addMonthsDate(started, n);
      }
      s.next_payment_on = status === 'failed' ? payments[payments.length - 1].order_date.slice(0, 10) : due;
      if (status === 'cancelled') { s.cancelled_at = stopAt + 'T10:00:00Z'; s.ended_at = s.cancelled_at; s.next_payment_on = null; }
      if (status === 'pending-cancel') { s.cancelled_at = daysAgo(2) + 'T10:00:00Z'; s.ended_at = s.next_payment_on + 'T00:00:00Z'; }
      subs.push(s);
    });

    function addGiftRow(g) {
      const m = { id: id(), email: g.email || null, first_name: g.first_name, last_name: g.last_name, phone: g.phone || null,
        address_1: g.address_1 || null, address_2: g.address_2 || null, city: g.city || null, county: g.county || null,
        postcode: g.postcode ? g.postcode.toUpperCase() : null, country: 'GB', notes: null };
      members.push(m);
      const s = { id: id(), member_id: m.id, kind: 'gift', plan: g.plan, source: g.source || 'in_store', status: 'active', price: g.price,
        started_on: g.start_month || today, gift_months: g.months, gift_start_month: g.start_month || null, gift_from: g.from || null,
        gift_message: g.message || null, needs_start_month: !g.start_month, notes: null };
      subs.push(s);
      payments.push({ id: id(), ref: 'gift:' + s.id, subscription_id: s.id, member_id: m.id, kind: 'gift', status: 'paid', amount: g.price,
        fee: g.source === 'online' ? Math.round((g.price * 0.015 + 0.2) * 100) / 100 : 0, paid_at: (g.paid || today) + 'T11:00:00Z', order_date: (g.paid || today) + 'T11:00:00Z' });
      return s;
    }
    addGiftRow({ first_name: 'Nell', last_name: 'Chegwidden', plan: 'postal', months: 6, price: 120, start_month: addMonths(thisMonth, -2),
      from: 'Mark Chegwidden', message: 'Happy birthday Mum — enjoy the reading!', address_1: '2 Pentire Avenue', city: 'Newquay', postcode: 'TR7 1PB', source: 'online', paid: daysAgo(70) });
    addGiftRow({ first_name: 'Isla', last_name: 'Retallick', plan: 'local', months: 3, price: 51, start_month: addMonths(thisMonth, -2),
      from: 'Fran', source: 'in_store', paid: daysAgo(75) });
    addGiftRow({ first_name: 'Ben', last_name: 'Opie', plan: 'postal', months: 12, price: 240, start_month: null,
      from: 'Sarah Opie', address_1: '41 Marine Parade', city: 'Weymouth', postcode: 'DT4 7DX', source: 'online', paid: daysAgo(1) });

    const titles = [
      ['The Salt House', 'Morwenna Day', 8.10], ['Small Hours', 'Idris Vane', 7.40], ['Lantern Season', 'Clara Holt', 8.95],
      ['A Map of Tides', 'Jonah Reed', 9.20], ['Glasswork', 'Teodora Ilić (tr. M. Bray)', 8.60], ['Notes from the Harbour', 'Kit Marsh', 7.80],
      ['Paper Boats', 'Ana Ferreira', 8.30], ['The Quiet Year', 'Ruth Evenson', 9.00],
    ];
    const colours = ['#0D6A66', '#7A4E2D', '#3A5A78', '#8B3A4A', '#4E6B3A', '#5B4A7A', '#9A6B1F', '#2F5D62'];
    titles.forEach((t, i) => {
      const month = addMonths(thisMonth, -(titles.length - i));
      books.push({ month, title: t[0], author: t[1], isbn: null, publisher: null, cover_url: null, cost_per_copy: t[2], rrp: 16.99, copies_ordered: null, supplier: 'Gardners', notes: null, colour: colours[i] });
    });
    books.push({ month: thisMonth, title: 'Weather Report', author: 'Sela Morrow', cost_per_copy: 8.75, rrp: 16.99, copies_ordered: null, supplier: 'Gardners', notes: null });

    // history of fulfilment for past months (rough, for archive figures)
    books.forEach((b) => {
      if (b.month >= thisMonth) return;
      subs.forEach((s) => {
        const startM = monthStart(s.started_on);
        const endM = s.ended_at ? monthStart(s.ended_at) : '9999-12-01';
        const ok = s.kind === 'subscription' ? (startM <= b.month && endM >= b.month)
          : (s.gift_start_month && s.gift_start_month <= b.month && addMonths(s.gift_start_month, s.gift_months - 1) >= b.month);
        if (ok) fulfilment.push({ month: b.month, subscription_id: s.id, plan: s.plan, added_at: b.month + 'T08:00:00Z', collected_at: s.plan === 'local' ? b.month + 'T12:00:00Z' : null, posted_at: s.plan === 'postal' ? b.month + 'T12:00:00Z' : null, label_run_id: s.plan === 'postal' ? 'run-' + b.month : null });
      });
    });
    costs.push({ id: id(), month: thisMonth, label: 'Meet-up snacks', amount: 12.50, created_at: today });

    const memberName = (m) => [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || 'Unknown';
    const pushAlert = (a) => alerts.unshift(Object.assign({ id: id(), created_at: new Date().toISOString(), read_at: null }, a));
    const sub = (name) => { const m = members.find((x) => memberName(x) === name); return subs.find((s) => s.member_id === m.id); };
    const mins = (n) => new Date(Date.now() - n * 60000).toISOString();
    pushAlert({ kind: 'cancelled', severity: 'warning', title: 'Grace Polglase cancelled', body: 'Cancelled — still paid up until her next renewal date.', subscription_id: sub('Grace Polglase').id, member_id: sub('Grace Polglase').member_id, created_at: mins(60 * 49) });
    pushAlert({ kind: 'new_member', severity: 'success', title: 'New Postal member: Will Penrose', body: 'Joined Clemo Club Postal.', subscription_id: sub('Will Penrose').id, member_id: sub('Will Penrose').member_id, created_at: mins(60 * 30) });
    pushAlert({ kind: 'failed_payment', severity: 'danger', title: 'Payment failed: Dan Couch', body: '£16.99 renewal did not go through.', subscription_id: sub('Dan Couch').id, member_id: sub('Dan Couch').member_id, created_at: mins(60 * 26) });
    pushAlert({ kind: 'new_gift', severity: 'success', title: 'New gift: Ben Opie', body: '12 months Postal, from Sarah Opie. Set the start month.', subscription_id: sub('Ben Opie').id, member_id: sub('Ben Opie').member_id, created_at: mins(60 * 20) });
    pushAlert({ kind: 'labels_ready', severity: 'info', title: U.monthName(thisMonth, false) + ' postal labels are ready', body: 'Download the labels PDF or Click & Drop file from This Month.', month: thisMonth, created_at: mins(90) });

    // ---------- derived views (mirror the SQL) ----------
    function giftEnd(s) { return s.kind === 'gift' && s.gift_start_month ? addMonths(s.gift_start_month, s.gift_months - 1) : null; }
    function monthsBetween(a, b) { const [y1, m1, d1] = a.split('-').map(Number); const [y2, m2, d2] = b.split('-').map(Number); let n = (y2 - y1) * 12 + (m2 - m1); if (d2 < d1) n--; return Math.max(0, n); }
    function overviewRow(s) {
      const m = members.find((x) => x.id === s.member_id);
      const ps = payments.filter((p) => p.subscription_id === s.id);
      const paid = ps.filter((p) => p.status === 'paid');
      const last = ps.filter((p) => p.kind !== 'gift').sort((a, b) => (b.order_date || '').localeCompare(a.order_date || ''))[0];
      const grace = S('grace_days', 3);
      const graceDate = (() => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - grace); return d.toISOString().slice(0, 10); })();
      const overdue = s.kind === 'subscription' && s.status === 'active' && (
        (s.next_payment_on && s.next_payment_on < graceDate) || (last && ['failed', 'pending'].includes(last.status) && last.created_at.slice(0, 10) < graceDate));
      return Object.assign({}, m, {
        subscription_id: s.id, member_id: m.id, name: memberName(m), member_notes: m.notes,
        kind: s.kind, plan: s.plan, source: s.source, status: s.status, price: s.price, wp_subscription_id: s.wp_subscription_id || null,
        started_on: s.started_on, next_payment_on: s.next_payment_on || null, cancelled_at: s.cancelled_at || null, ended_at: s.ended_at || null,
        gift_months: s.gift_months || null, gift_start_month: s.gift_start_month || null, gift_end_month: giftEnd(s),
        gift_from: s.gift_from || null, gift_message: s.gift_message || null, needs_start_month: !!s.needs_start_month, notes: s.notes,
        total_paid: paid.reduce((a, p) => a + p.amount, 0), payments_paid: paid.length,
        last_paid_at: paid.map((p) => p.paid_at).sort().pop() || null,
        months_member: s.started_on ? monthsBetween(s.started_on, (s.ended_at || s.cancelled_at || today).slice(0, 10)) : 0,
        last_payment_failed: !!(last && last.status === 'failed'), overdue: !!overdue,
        hidden_at: s.hidden_at || null, last_payment_status: last ? last.status : null, last_payment_amount: last ? last.amount : null,
      });
    }
    function eligible(month) {
      return subs.filter((s) => (s.kind === 'subscription' && ['active', 'pending-cancel'].includes(s.status))
        || (s.kind === 'gift' && s.status === 'active' && s.gift_start_month && s.gift_start_month <= month && giftEnd(s) >= month));
    }
    function prepare(month) {
      if (month < thisMonth) return;
      const hasRun = labelRuns.some((r) => r.month === month);
      const el = eligible(month);
      el.forEach((s) => {
        if (!fulfilment.some((f) => f.month === month && f.subscription_id === s.id)) {
          fulfilment.push({ month, subscription_id: s.id, plan: s.plan, added_at: new Date().toISOString(), collected_at: null, posted_at: null, label_run_id: null });
          if (hasRun && s.plan === 'postal') {
            const m = members.find((x) => x.id === s.member_id);
            pushAlert({ kind: 'late_joiner', severity: 'warning', title: 'Joined after labels were printed: ' + memberName(m), body: 'Needs a label for ' + U.monthName(month, false) + '.', subscription_id: s.id, member_id: m.id, month });
          }
        }
      });
      for (let i = fulfilment.length - 1; i >= 0; i--) {
        const f = fulfilment[i];
        if (f.month === month && !f.label_run_id && !f.posted_at && !f.collected_at && !el.some((s) => s.id === f.subscription_id)) fulfilment.splice(i, 1);
      }
    }
    function summary(month) {
      const b = books.find((x) => x.month === month) || null;
      const rows = (month >= thisMonth && !fulfilment.some((f) => f.month === month)) ? eligible(month).map((s) => ({ plan: s.plan })) : fulfilment.filter((f) => f.month === month);
      const local = rows.filter((r) => r.plan === 'local').length, postal = rows.filter((r) => r.plan === 'postal').length;
      const next = addMonths(month, 1);
      const sp = payments.filter((p) => ['signup', 'renewal'].includes(p.kind) && p.status === 'paid' && p.paid_at && p.paid_at.slice(0, 10) >= month && p.paid_at.slice(0, 10) < next);
      const subRev = sp.reduce((a, p) => a + p.amount, 0), subFees = sp.reduce((a, p) => a + (p.fee || 0), 0);
      let giftRev = 0, giftFees = 0;
      subs.filter((s) => s.kind === 'gift' && ['active', 'expired'].includes(s.status) && s.gift_start_month && s.gift_start_month <= month && giftEnd(s) >= month).forEach((s) => {
        giftRev += s.price / s.gift_months;
        const p = payments.find((x) => x.subscription_id === s.id && x.kind === 'gift' && x.status === 'paid');
        giftFees += ((p && p.fee) || 0) / s.gift_months;
      });
      const extra = costs.filter((c) => c.month === month).reduce((a, c) => a + Number(c.amount), 0);
      const copies = (b && b.copies_ordered) || (local + postal + S('spare_copies', 1));
      const bookCost = ((b && b.cost_per_copy) || 0) * copies, postage = postal * S('postage_per_parcel', 2.7), packaging = postal * S('packaging_per_parcel', 0.5);
      const revenue = subRev + giftRev, totalCosts = bookCost + postage + packaging + subFees + giftFees + extra;
      const r2 = (n) => Math.round(n * 100) / 100;
      return { month, book: b, local, postal, total_members: local + postal, copies_needed: local + postal + S('spare_copies', 1), copies,
        subscription_revenue: r2(subRev), subscription_payments: sp.length, gift_revenue: r2(giftRev), revenue: r2(revenue),
        book_cost: r2(bookCost), postage: r2(postage), packaging: r2(packaging), card_fees: r2(subFees + giftFees), extra_costs: r2(extra),
        costs: r2(totalCosts), profit: r2(revenue - totalCosts), missing_book_cost: !b || b.cost_per_copy == null,
        ...expected(month, revenue, totalCosts, r2) };
    }
    function expected(month, revenue, totalCosts, r2) {
      const next = addMonths(month, 1);
      const due = month < thisMonth ? [] : subs.filter((s) => s.kind === 'subscription' && !s.deleted_at && ['active', 'on-hold'].includes(s.status)
        && s.next_payment_on && s.next_payment_on >= month && s.next_payment_on < next && s.price > 0);
      const rev = due.reduce((a, s) => a + s.price, 0);
      const fees = due.reduce((a, s) => a + Math.round((s.price * S('stripe_percent', 1.5) / 100 + S('stripe_fixed', 0.2)) * 100) / 100, 0);
      return { expected_revenue: r2(rev), expected_count: due.length, expected_fees: r2(fees),
        predicted_revenue: r2(revenue + rev), predicted_profit: r2(revenue + rev - totalCosts - fees) };
    }

    const wait = (v) => new Promise((r) => setTimeout(() => r(v), 60));
    const clone = (v) => JSON.parse(JSON.stringify(v));

    return {
      demo: true,
      async session() { return { user: { email: 'demo@clemobooks.co.uk' } }; },
      async signIn() {}, async signOut() { location.reload(); }, onAuth() {},
      async whoAmI() { return { email: 'demo@clemobooks.co.uk', isStaff: true }; },
      async alerts() { return wait(clone(alerts)); },
      async markAlert(aid, read = true) { const a = alerts.find((x) => x.id === aid); if (a) a.read_at = read ? new Date().toISOString() : null; },
      async markAllAlerts() { alerts.forEach((a) => { if (!a.read_at) a.read_at = new Date().toISOString(); }); },
      watchAlerts() { return null; },
      async overview() { return wait(subs.filter((s) => !s.deleted_at).map(overviewRow).sort((a, b) => a.name.localeCompare(b.name))); },
      async payments(subId) { return wait(clone(payments.filter((p) => p.subscription_id === subId).sort((a, b) => (b.order_date || '').localeCompare(a.order_date || '')))); },
      async updateMember(mid, f) { Object.assign(members.find((m) => m.id === mid), f); },
      async updateSubscription(sid, f) { Object.assign(subs.find((s) => s.id === sid), f); },
      async addGift(g) { return addGiftRow(Object.assign({}, g, { source: 'in_store' })).id; },
      async prepareMonth(month) { prepare(month); },
      async roster(month) {
        return wait(fulfilment.filter((f) => f.month === month).map((f) => {
          const o = overviewRow(subs.find((s) => s.id === f.subscription_id));
          return Object.assign({}, o, { plan: f.plan, added_at: f.added_at, collected_at: f.collected_at, posted_at: f.posted_at, label_run_id: f.label_run_id });
        }).sort((a, b) => a.plan.localeCompare(b.plan) || a.name.localeCompare(b.name)));
      },
      async summary(month) { return wait(summary(month)); },
      async history(n = 12) { const out = []; for (let i = 0; i < n; i++) out.push(summary(addMonths(thisMonth, -i))); return wait(out); },
      async setFulfilment(month, sid, f) { Object.assign(fulfilment.find((x) => x.month === month && x.subscription_id === sid), f); },
      async recordLabelRun(month, ids) {
        const r = { id: id(), month, created_at: new Date().toISOString(), created_by: 'demo', subscription_ids: ids }; labelRuns.push(r);
        fulfilment.forEach((f) => { if (f.month === month && ids.includes(f.subscription_id)) f.label_run_id = r.id; });
        alerts.forEach((a) => { if (a.month === month && !a.read_at && (a.kind === 'labels_ready' || (a.kind === 'late_joiner' && ids.includes(a.subscription_id)))) a.read_at = new Date().toISOString(); });
        return r.id;
      },
      async labelRuns(month) { return clone(labelRuns.filter((r) => r.month === month)); },
      async book(month) { return wait(clone(books.find((b) => b.month === month) || null)); },
      async books() { return wait(clone(books.slice().sort((a, b) => b.month.localeCompare(a.month)))); },
      async saveBook(b) { const i = books.findIndex((x) => x.month === b.month); if (i >= 0) books[i] = Object.assign(books[i], b); else books.push(b); },
      async costs(month) { return clone(costs.filter((c) => c.month === month)); },
      async addCost(month, label, amount) { costs.push({ id: id(), month, label, amount: Number(amount), created_at: new Date().toISOString() }); },
      async deleteCost(cid) { const i = costs.findIndex((c) => c.id === cid); if (i >= 0) costs.splice(i, 1); },
      async settings() { return clone(settings); },
      async saveSettings(o) { Object.assign(settings, o); },
      async staff() { return [{ email: 'matthew@clemobooks.co.uk', name: 'Matthew' }]; },
      async addStaff() { throw new Error('Adding staff is switched off in the demo'); },
      async removeStaff() { throw new Error('Removing staff is switched off in the demo'); },
      async eventLog() {
        return [{ id: 3, received_at: new Date(Date.now() - 3600e3).toISOString(), event_type: 'order', wp_id: 5123, result: 'ok' },
          { id: 2, received_at: new Date(Date.now() - 3700e3).toISOString(), event_type: 'subscription', wp_id: 3014, result: 'ok' },
          { id: 1, received_at: new Date(Date.now() - 86400e3).toISOString(), event_type: 'ping', wp_id: null, result: 'pong' }];
      },
      async changePassword() { throw new Error('Passwords can’t be changed in the demo'); },
      async setHidden(sid, hidden) {
        const s = subs.find((x) => x.id === sid); s.hidden_at = hidden ? new Date().toISOString() : null;
        if (hidden) alerts.forEach((a) => { if (a.subscription_id === sid && !a.read_at) a.read_at = new Date().toISOString(); });
      },
      async deleteSubscription(sid) {
        const s = subs.find((x) => x.id === sid);
        if (s.kind === 'gift') throw new Error('Gift memberships can be hidden but not deleted.');
        if (!['cancelled', 'expired'].includes(s.status)) throw new Error('Cancel this subscription in WooCommerce first. Only ended subscriptions can be deleted.');
        s.deleted_at = new Date().toISOString();
        const m = members.find((x) => x.id === s.member_id);
        Object.assign(m, { first_name: 'Deleted', last_name: 'member', email: null, phone: null, address_1: null, address_2: null, city: null, postcode: null, notes: null });
        return 'deleted';
      },
      async commands(sid) { return clone(commands.filter((c) => c.subscription_id === sid).sort((a, b) => b.created_at.localeCompare(a.created_at))); },
      async bookCommands(r, rows) {
        rows.forEach((c) => commands.push(Object.assign({ id: id(), subscription_id: r.subscription_id, status: 'queued', result: null,
          created_at: new Date().toISOString(), finished_at: null }, c, { run_at: /Europe/.test(c.run_at) ? c.run_at.slice(0, 10) + 'T09:00:00Z' : c.run_at })));
        // pretend the website picked the work up a moment later
        setTimeout(() => {
          commands.forEach((c) => {
            if (c.status !== 'queued' || c.run_at > new Date().toISOString()) return;
            c.finished_at = new Date().toISOString();
            if (c.kind === 'email') { c.status = 'done'; c.result = 'Emailed ' + (r.email || 'the customer') + ' (demo, nothing was sent)'; return; }
            const p = payments.find((x) => x.subscription_id === c.subscription_id && x.status === 'failed');
            const s = subs.find((x) => x.id === c.subscription_id);
            if (p) { p.status = 'paid'; p.paid_at = new Date().toISOString(); s.status = 'active'; s.next_payment_on = addMonthsDate(s.next_payment_on, 1); }
            c.status = 'done'; c.result = 'Paid £' + (p ? p.amount.toFixed(2) : '0.00') + ' (demo, nobody was charged)';
          });
        }, 1500);
      },
      async cancelCommand(cid) { const c = commands.find((x) => x.id === cid && x.status === 'queued'); if (c) { c.status = 'cancelled'; c.result = 'Cancelled in the dashboard'; c.finished_at = new Date().toISOString(); } },
      async runChecks() { prepare(thisMonth); return { overdue: subs.map(overviewRow).filter((o) => o.overdue).length }; },
    };
  };
})();
