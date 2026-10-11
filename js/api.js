// Data access. One interface, two backends: Supabase (live) and Demo (sample data).
(function () {
  function must(res) {
    if (res.error) throw new Error(res.error.message || String(res.error));
    return res.data;
  }

  function SupabaseApi(url, key) {
    const sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
    const api = {
      demo: false,
      async session() { const { data } = await sb.auth.getSession(); return data.session; },
      async signIn(email, password) { must(await sb.auth.signInWithPassword({ email, password })); },
      async signOut() { await sb.auth.signOut(); },
      onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s)); },
      async whoAmI() {
        const s = await api.session();
        const email = s && s.user && s.user.email;
        const staff = must(await sb.from('staff').select('email').limit(1));
        return { email, isStaff: staff.length > 0 };
      },

      // alerts
      async alerts() { return must(await sb.from('alerts').select('*').order('created_at', { ascending: false }).limit(150)); },
      async markAlert(id, read = true) { must(await sb.from('alerts').update({ read_at: read ? new Date().toISOString() : null }).eq('id', id)); },
      async markAllAlerts() { must(await sb.from('alerts').update({ read_at: new Date().toISOString() }).is('read_at', null)); },
      watchAlerts(cb) {
        return sb.channel('alerts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (p) => cb(p.new)).subscribe();
      },

      // members
      async overview() { return must(await sb.from('member_overview').select('*').order('name')); },
      async payments(subId) { return must(await sb.from('payments').select('*').eq('subscription_id', subId).order('order_date', { ascending: false, nullsFirst: false })); },
      async updateMember(id, fields) { must(await sb.from('members').update(fields).eq('id', id)); },
      async updateSubscription(id, fields) { must(await sb.from('subscriptions').update(fields).eq('id', id)); },

      // gifts
      async addGift(g) {
        const m = must(await sb.from('members').insert({
          first_name: g.first_name, last_name: g.last_name, email: g.email || null, phone: g.phone || null,
          address_1: g.address_1 || null, address_2: g.address_2 || null, city: g.city || null,
          county: g.county || null, postcode: g.postcode ? g.postcode.toUpperCase() : null, country: 'GB',
        }).select('id').single());
        const s = must(await sb.from('subscriptions').insert({
          member_id: m.id, kind: 'gift', plan: g.plan, source: 'in_store', status: 'active', price: g.price,
          started_on: g.start_month, gift_months: g.months, gift_start_month: g.start_month,
          gift_from: g.from || null, gift_message: g.message || null, needs_start_month: false,
        }).select('id').single());
        must(await sb.from('payments').insert({
          ref: 'manual:' + s.id, subscription_id: s.id, member_id: m.id, kind: 'gift', status: 'paid',
          amount: g.price, fee: g.fee || 0, paid_at: new Date().toISOString(), order_date: new Date().toISOString(),
        }));
        return s.id;
      },

      // month
      async prepareMonth(month) { must(await sb.rpc('prepare_month', { p_month: month })); },
      async roster(month) { return must(await sb.rpc('month_roster', { p_month: month })); },
      async summary(month) { return must(await sb.rpc('month_summary', { p_month: month })); },
      async history(n = 12) { return must(await sb.rpc('money_history', { p_months: n })); },
      async setFulfilment(month, subId, fields) { must(await sb.from('fulfilment').update(fields).eq('month', month).eq('subscription_id', subId)); },
      async recordLabelRun(month, ids) { return must(await sb.rpc('record_label_run', { p_month: month, p_subs: ids })); },
      async labelRuns(month) { return must(await sb.from('label_runs').select('*').eq('month', month).order('created_at')); },

      // books & costs
      async book(month) { return must(await sb.from('books').select('*').eq('month', month).maybeSingle()); },
      async books() { return must(await sb.from('books').select('*').order('month', { ascending: false })); },
      async saveBook(b) { must(await sb.from('books').upsert(b)); },
      async costs(month) { return must(await sb.from('month_costs').select('*').eq('month', month).order('created_at')); },
      async addCost(month, label, amount) { must(await sb.from('month_costs').insert({ month, label, amount })); },
      async deleteCost(id) { must(await sb.from('month_costs').delete().eq('id', id)); },

      // settings
      async settings() {
        const rows = must(await sb.from('settings').select('key,value'));
        const out = {}; rows.forEach((r) => { if (r.key !== 'ingest_secret_hash') out[r.key] = r.value; }); return out;
      },
      async saveSettings(obj) {
        must(await sb.from('settings').upsert(Object.entries(obj).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }))));
      },
      async staff() { return must(await sb.from('staff').select('*').order('email')); },
      async addStaff(email, name) { must(await sb.from('staff').insert({ email: email.toLowerCase().trim(), name })); },
      async removeStaff(email) { must(await sb.from('staff').delete().eq('email', email)); },
      async eventLog() { return must(await sb.from('event_log').select('id,received_at,event_type,wp_id,result').order('id', { ascending: false }).limit(40)); },
      async runChecks() { return must(await sb.rpc('run_daily_checks')); },
      async changePassword(pw) { must(await sb.auth.updateUser({ password: pw })); },
    };
    return api;
  }

  window.makeApi = function () {
    const c = window.CLEMO_CONFIG || {};
    const wantDemo = /[?&]demo(=1)?\b/.test(location.search) || !c.supabaseUrl || !c.supabaseAnonKey;
    return wantDemo ? window.DemoApi() : SupabaseApi(c.supabaseUrl, c.supabaseAnonKey);
  };
})();
