/* FareWise front end: talks to the Express API in /server. */
(() => {
  'use strict';

  // ---------- tiny helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const daysLabel = (w) => (w.max_days >= 365 ? `${w.min_days}+ days` : `${w.min_days}–${w.max_days} days`);
  const DAY_LABEL = { any: 'Any day', weekday: 'Weekday', weekend: 'Weekend', holiday: 'Holiday' };
  const STOP_LABEL = { any: 'Any', nonstop: 'Nonstop', connecting: 'Connecting' };
  const PLANE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';

  const normDay = (v) => { const s = String(v || '').toLowerCase(); return ['weekday', 'weekend', 'holiday'].find((k) => s.includes(k)) || 'any'; };
  const normStops = (v) => {
    const s = String(v || '').toLowerCase().replace(/[\s_-]/g, '');
    if (!s || s === 'any' || s === 'all') return 'any';
    if (s.includes('nonstop') || s.includes('direct') || s === '0') return 'nonstop';
    if (s.includes('connect') || s.includes('stop') || /^[1-9]/.test(s)) return 'connecting';
    return 'any';
  };

  const readLS = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

  async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' } };
    if (opts.body) init.body = JSON.stringify(opts.body);
    const res = await fetch('/api' + path, init);
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || `Request failed (${res.status})`), { status: res.status });
    return data;
  }

  function toast(message, type = 'ok', action) {
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' error' : '');
    t.textContent = message;
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.addEventListener('click', () => { action.run(); dismiss(); });
      t.appendChild(b);
    }
    $('#toasts').appendChild(t);
    const dismiss = () => { t.classList.add('out'); setTimeout(() => t.remove(), 300); };
    setTimeout(dismiss, action ? 6000 : 3800);
  }

  // ---------- state ----------
  const state = {
    meta: null,
    user: null,
    filters: { origin: '', destination: '', airline: '', day: 'any', stops: 'any' },
    compare: { on: false, airline: '', day: 'weekend', stops: 'any' },
    places: {},
    popular: [],
    result: null,
    resultB: null,
    archived: 0,
    routes: [],
    editing: null,
  };

  // ---------- split-flap board ----------
  const FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function setFlaps(el, text) {
    const t = String(text || '---').toUpperCase().slice(0, 4).padEnd(3, ' ');
    while (el.children.length < t.length) { const c = document.createElement('span'); c.className = 'flap'; el.appendChild(c); }
    while (el.children.length > t.length) el.lastChild.remove();
    [...el.children].forEach((cell, i) => {
      const target = t[i];
      if (cell.dataset.v === target) return;
      cell.dataset.v = target;
      clearInterval(cell._timer);
      if (reduceMotion) { cell.textContent = target; return; }
      let steps = 7 + i * 4 + Math.floor(Math.random() * 3);
      cell._timer = setInterval(() => {
        cell.classList.remove('flip'); void cell.offsetWidth; cell.classList.add('flip');
        if (--steps <= 0) { clearInterval(cell._timer); cell.textContent = target; return; }
        cell.textContent = FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)];
      }, 52);
    });
  }

  // Keep the plane's motion path in step with the arc as the board resizes.
  function fitFlightPath() {
    const box = $('.flight-path');
    const plane = $('.plane');
    if (!box || !plane || !('ResizeObserver' in window)) return;
    const fit = () => {
      const w = box.clientWidth; const h = box.clientHeight;
      if (!w) return;
      const d = `M6 ${h - 10} Q${w / 2} ${-h * 0.25} ${w - 6} ${h - 10}`;
      plane.style.offsetPath = `path("${d}")`;
      plane.style.left = '-13px'; plane.style.top = '-13px';
    };
    new ResizeObserver(fit).observe(box);
    fit();
  }

  function startClock() {
    const tick = () => {
      const d = new Date();
      $('#clock').textContent = 'LOCAL ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    };
    tick(); setInterval(tick, 15000);
  }

  async function placeFor(code) {
    if (!code) return null;
    if (state.places[code]?.city) return state.places[code];
    try {
      const rows = await api('/airports?q=' + encodeURIComponent(code));
      const hit = rows.find((r) => r.code === code);
      if (hit) state.places[code] = hit;
      return hit || null;
    } catch { return null; }
  }

  async function updateBoard() {
    const { origin, destination } = state.filters;
    setFlaps($('#flapOrigin'), origin || '---');
    setFlaps($('#flapDest'), destination || '---');
    const [o, d] = await Promise.all([placeFor(origin), placeFor(destination)]);
    $('#originCity').textContent = o ? [o.city, o.country].filter(Boolean).join(', ') : '—';
    $('#destCity').textContent = d ? [d.city, d.country].filter(Boolean).join(', ') : '—';
  }

  // ---------- connection status ----------
  async function checkHealth() {
    const strip = $('#statusStrip');
    const text = $('#statusText');
    try {
      const h = await api('/health');
      strip.classList.remove('bad'); strip.classList.add('ok');
      const sep = '<span class="sep">·</span>';
      text.innerHTML = [
        '<b>DB connected</b>',
        `MySQL ${esc(String(h.version).split('-')[0])}`,
        `${esc(h.db)} @ ${esc(h.host)}`,
        `${num(h.fares)} fares`,
        `${num(h.airports)} airports`,
        `${num(h.users)} users`,
        `${num(h.saved_routes)} saved routes`,
      ].join(` ${sep} `);
      $('#delayed').hidden = true;
      $('#results').hidden = false;
      return true;
    } catch (e) {
      strip.classList.remove('ok'); strip.classList.add('bad');
      text.innerHTML = `<b>DB offline</b> <span class="sep">·</span> ${esc(e.message)}`;
      $('#delayedText').textContent = e.message;
      $('#delayed').hidden = false;
      $('#results').hidden = true;
      return false;
    }
  }

  // ---------- user ----------
  function setUser(u) {
    state.user = u;
    writeLS('fw.user', u);
    $('#userAvatar').textContent = (u.username || '?').charAt(0);
    $('#userName').textContent = '@' + u.username;
    $('#userHome').textContent = 'home ' + (u.airport_home || '—');
    refreshRouteCount();
    if (currentView() === 'routes') loadRoutes();
  }

  async function loadUser() {
    const saved = readLS('fw.user');
    if (saved && saved.user_id != null) {
      try {
        const rows = await api('/users?q=' + encodeURIComponent(saved.username || ''));
        const hit = rows.find((r) => r.user_id === saved.user_id);
        if (hit) return setUser(hit);
      } catch { /* fall through to default */ }
    }
    try { setUser(await api('/users/default')); } catch (e) { toast(e.message, 'error'); }
  }

  function bindUserPicker() {
    const chip = $('#userChip');
    const pop = $('#userPop');
    const input = $('#userSearch');
    const list = $('#userList');
    let timer;
    const render = (rows) => {
      list.innerHTML = rows.length
        ? rows.map((u) => `<li><button type="button" data-id="${u.user_id}" class="${state.user && u.user_id === state.user.user_id ? 'current' : ''}"><span>@${esc(u.username)}</span><span class="home">${esc(u.airport_home || '')}</span></button></li>`).join('')
        : '<li class="pop-hint">No users match</li>';
      list._rows = rows;
    };
    const search = async () => { try { render(await api('/users?q=' + encodeURIComponent(input.value.trim()))); } catch (e) { list.innerHTML = `<li class="pop-hint">${esc(e.message)}</li>`; } };
    const close = () => { pop.hidden = true; chip.setAttribute('aria-expanded', 'false'); };
    chip.addEventListener('click', () => {
      const open = pop.hidden;
      pop.hidden = !open; chip.setAttribute('aria-expanded', String(open));
      if (open) { input.value = ''; search(); setTimeout(() => input.focus(), 30); }
    });
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 180); });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (!b) return;
      const u = list._rows.find((r) => String(r.user_id) === b.dataset.id);
      if (u) { setUser(u); toast(`Now acting as @${u.username}`); }
      close();
    });
    document.addEventListener('click', (e) => { if (!pop.hidden && !e.target.closest('.user-wrap')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  // ---------- airport autocomplete ----------
  function airportPicker(input, list, onPick) {
    let items = [];
    let active = -1;
    let timer;
    let seq = 0;
    const close = () => { list.hidden = true; active = -1; };
    const render = () => {
      list.innerHTML = items.length
        ? items.map((a, i) => `<li role="option" data-i="${i}" class="${i === active ? 'active' : ''}"><span class="code">${esc(a.code)}</span><span class="place">${esc(a.city || a.name || '')}<small>${esc(a.name || '')}${a.country ? ' · ' + esc(a.country) : ''}</small></span></li>`).join('')
        : '<li class="none">No airports match</li>';
      list.hidden = false;
    };
    const pick = (a) => { input.value = a.code; state.places[a.code] = a; close(); onPick(a.code); };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (!q) return close();
      timer = setTimeout(async () => {
        const mine = ++seq;
        try {
          const rows = await api('/airports?q=' + encodeURIComponent(q));
          if (mine !== seq) return;
          items = rows; active = rows.length ? 0 : -1; render();
        } catch { /* ignore typing errors */ }
      }, 150);
    });
    input.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && items[active]) { pick(items[active]); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); e.stopPropagation(); }
    });
    list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li[data-i]');
      if (li) { e.preventDefault(); pick(items[Number(li.dataset.i)]); }
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
    input.addEventListener('change', () => {
      const code = input.value.trim().toUpperCase();
      if (/^[A-Z0-9]{3,4}$/.test(code)) { input.value = code; onPick(code); }
    });
  }

  // ---------- explore ----------
  function fillSelects() {
    const airlineOpts = state.meta.airlines.map((a) => `<option value="${a.airline_id}">${esc(a.airline_name)}${a.airline_code ? ' (' + esc(a.airline_code) + ')' : ''}</option>`).join('');
    ['#airlineSelect', '#airlineSelectB', '#fAirline'].forEach((s) => { $(s).insertAdjacentHTML('beforeend', airlineOpts); });
    $('#fWindow').insertAdjacentHTML('beforeend', state.meta.windows.map((w) => `<option value="${w.window_id}">${esc(w.label)} · ${daysLabel(w)}</option>`).join(''));
  }

  function syncControls() {
    const f = state.filters;
    $('#originInput').value = f.origin;
    $('#destInput').value = f.destination;
    $('#airlineSelect').value = f.airline || '';
    $$('#controls .seg').forEach((seg) => {
      $$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.value === f[seg.dataset.key]));
    });
  }

  let exploreSeq = 0;
  async function runExplore() {
    const f = state.filters;
    updateBoard();
    renderPopularActive();
    if (!f.origin || !f.destination || f.origin === f.destination) return;
    writeLS('fw.filters', f);
    const mine = ++exploreSeq;
    const results = $('#results');
    results.classList.add('loading');
    const qs = (p) => new URLSearchParams({ origin: f.origin, destination: f.destination, airline: p.airline || '', day: p.day, stops: p.stops }).toString();
    try {
      const [a, b] = await Promise.all([
        api('/explore?' + qs(f)),
        state.compare.on ? api('/explore?' + qs(state.compare)) : Promise.resolve(null),
      ]);
      if (mine !== exploreSeq) return;
      state.result = a; state.resultB = b;
      renderChart(); renderInsight(); renderLeaderboard();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      if (mine === exploreSeq) results.classList.remove('loading');
    }
  }

  function niceScale(maxVal) {
    const raw = maxVal / 5;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
    return { step, top: Math.ceil(maxVal / step) * step };
  }

  function describeFilters(p) {
    const parts = [];
    if (p.airline) { const a = state.meta.airlines.find((x) => String(x.airline_id) === String(p.airline)); if (a) parts.push(a.airline_name); }
    if (p.day !== 'any') parts.push(DAY_LABEL[p.day]);
    if (p.stops !== 'any') parts.push(STOP_LABEL[p.stops]);
    return parts.length ? parts.join(' · ') : 'All fares';
  }

  function renderChart() {
    const a = state.result;
    const b = state.resultB;
    const el = $('#chart');
    const f = state.filters;
    const bMap = b ? new Map(b.windows.map((w) => [w.window_id, w])) : null;

    $('#legend').innerHTML = b
      ? `<span><i class="la"></i>A · ${esc(describeFilters(f))}</span><span><i class="lb"></i>B · ${esc(describeFilters(state.compare))}</span><span><i class="lbest"></i>Best (A)</span>`
      : `<span><i class="la"></i>${esc(describeFilters(f))}</span><span><i class="lbest"></i>Best window</span><span><i class="lavg"></i>Route avg</span>`;
    $('#chartSub').textContent = `${f.origin} → ${f.destination} · ${num(a.summary.observations)} fares, grouped by days before departure`;

    const vals = a.windows.flatMap((w) => [w.avg_fare, bMap?.get(w.window_id)?.avg_fare]).filter((v) => v != null);
    if (!vals.length) {
      el.innerHTML = `<div class="chart-body"><div class="chart-empty">No fares match these filters on ${esc(f.origin)} → ${esc(f.destination)}.<br>Try “Any” for departure day or stops.</div></div>`;
      return;
    }
    const { step, top } = niceScale(Math.max(...vals) * 1.15);
    const pct = (v) => Math.max(1.2, (v / top) * 100);
    const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

    const yAxis = ticks.map((t) => `<span style="bottom:${(t / top) * 100}%">${money(t)}</span>`).join('');
    const grid = ticks.slice(1).map((t) => `<div class="grid-line" style="bottom:${(t / top) * 100}%"></div>`).join('');
    const avg = a.summary.avg_fare;
    const avgLine = !b && avg ? `<div class="avg-line" style="bottom:${(avg / top) * 100}%"><span>AVG ${money(avg)}</span></div>` : '';

    const cols = a.windows.map((w, i) => {
      const isBest = w.window_id === a.bestWindowId;
      const tip = (x) => `${x.label}: ${x.observations} fares${x.min_fare != null ? ', lowest ' + money(x.min_fare) : ''}`;
      const barA = w.avg_fare != null
        ? `<div class="bar ${isBest ? 'best' : ''}" style="height:${pct(w.avg_fare)}%;animation-delay:${i * 80}ms" title="${esc(tip(w))}">${isBest ? '<span class="best-tag">Best</span>' : ''}<span class="val">${money(w.avg_fare)}</span></div>`
        : `<div class="bar empty" style="height:12%" title="No fares in this window"><span class="val">n/a</span></div>`;
      let barB = '';
      if (bMap) {
        const wb = bMap.get(w.window_id);
        barB = wb && wb.avg_fare != null
          ? `<div class="bar b" style="height:${pct(wb.avg_fare)}%;animation-delay:${i * 80 + 40}ms" title="B · ${esc(tip(wb))}"><span class="val">${money(wb.avg_fare)}</span></div>`
          : `<div class="bar empty" style="height:12%" title="No fares for B in this window"></div>`;
      }
      return `<div class="col">${barA}${barB}</div>`;
    }).join('');

    const labels = a.windows.map((w) => `<div class="x-label ${w.window_id === a.bestWindowId ? 'best' : ''}"><b>${esc(w.label)}</b><small>${daysLabel(w)}</small></div>`).join('');

    el.innerHTML = `
      <div class="chart-body">
        <div class="y-axis">${yAxis}</div>
        <div class="plot">${grid}${avgLine}<div class="cols">${cols}</div></div>
      </div>
      <div class="x-labels">${labels}</div>`;
    el.setAttribute('aria-label', 'Average fare per booking window: ' + a.windows.map((w) => `${w.label} ${w.avg_fare != null ? money(w.avg_fare) : 'no data'}`).join(', '));
  }

  function renderInsight() {
    const r = state.result;
    const s = r.summary;
    const best = r.windows.find((w) => w.window_id === r.bestWindowId);
    const stamp = $('#stamp');
    stamp.classList.toggle('none', !best);
    $('.stamp-kicker', stamp).textContent = best ? 'Book in' : 'No data';
    $('#stampWindow').textContent = best ? best.label : '—';
    $('#stampDays').textContent = best ? `${daysLabel(best)} before departure` : 'Try wider filters';
    stamp.classList.remove('pulse'); void stamp.offsetWidth; stamp.classList.add('pulse');

    let line = '';
    if (best && s.avg_fare) {
      const diff = s.avg_fare - best.avg_fare;
      line = diff > 1
        ? `Fares seen in this window averaged <b>${money(diff)} less</b> (${Math.round((diff / s.avg_fare) * 100)}%) than the route average.`
        : 'Prices stay flat across booking windows on this route.';
    }
    if (state.resultB) {
      const rb = state.resultB;
      const bb = rb.windows.find((w) => w.window_id === rb.bestWindowId);
      line += `<br><span class="series-key b" style="width:18px;height:18px;font-size:10px">B</span> ${bb ? `best window is <b style="color:var(--sky)">${esc(bb.label)}</b> at ${money(bb.avg_fare)}` : 'has no matching fares'}.`;
    }
    $('#savingLine').innerHTML = line || '&nbsp;';

    const hours = s.avg_duration ? `${Math.floor(s.avg_duration / 60)}h ${String(Math.round(s.avg_duration % 60)).padStart(2, '0')}m` : '—';
    const nonstop = s.observations ? Math.round((s.nonstop_count / s.observations) * 100) + '%' : '—';
    $('#stats').innerHTML = [
      ['Avg fare', money(s.avg_fare)],
      ['Lowest seen', money(s.min_fare)],
      ['Highest seen', money(s.max_fare)],
      ['Observations', num(s.observations)],
      ['Avg flight time', hours],
      ['Nonstop share', nonstop],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('#saveRouteBtn').disabled = !state.user;
  }

  function renderLeaderboard() {
    const rows = state.result.airlines;
    const el = $('#leaderboard');
    if (!rows.length) { el.innerHTML = '<li class="lb-empty">No airline has fares for these filters.</li>'; return; }
    const max = Math.max(...rows.map((r) => r.avg_fare));
    const min = Math.min(...rows.map((r) => r.avg_fare));
    const width = (v) => (max === min ? 100 : 18 + ((v - min) / (max - min)) * 82);
    el.innerHTML = rows.map((r, i) => `
      <li class="lb-row ${String(r.airline_id) === String(state.filters.airline) ? 'selected' : ''}" style="--i:${i}" data-id="${r.airline_id}" tabindex="0" role="button" aria-label="Filter by ${esc(r.airline_name)}">
        <span class="lb-rank">${String(i + 1).padStart(2, '0')}</span>
        <span class="lb-name"><span>${esc(r.airline_name)}</span>${r.airline_code ? `<span class="code-tag">${esc(r.airline_code)}</span>` : ''}</span>
        <span class="lb-bar"><i style="width:${width(r.avg_fare)}%;animation-delay:${i * 50}ms"></i></span>
        <span class="lb-num">${money(r.avg_fare)}<small>avg</small></span>
        <span class="lb-num min">${money(r.min_fare)}<small>lowest</small></span>
        <span class="lb-num count">${num(r.observations)}<small>fares</small></span>
      </li>`).join('');
  }

  function renderPopular(rows) {
    state.popular = rows;
    $('#popularChips').innerHTML = rows.map((r) => `
      <button type="button" class="chip" data-o="${esc(r.origin)}" data-d="${esc(r.destination)}" title="${esc(r.origin_city)} to ${esc(r.destination_city)} · avg ${money(r.avg_fare)}">
        ${esc(r.origin)} <span class="arrow">→</span> ${esc(r.destination)} <span class="n">${num(r.observations)}</span>
      </button>`).join('');
    rows.forEach((r) => {
      state.places[r.origin] = state.places[r.origin] || { code: r.origin, city: r.origin_city };
      state.places[r.destination] = state.places[r.destination] || { code: r.destination, city: r.destination_city };
    });
  }
  function renderPopularActive() {
    $$('#popularChips .chip').forEach((c) => c.classList.toggle('current', c.dataset.o === state.filters.origin && c.dataset.d === state.filters.destination));
  }

  // ---------- my routes ----------
  async function refreshRouteCount() {
    if (!state.user) return;
    try {
      const c = await api(`/users/${state.user.user_id}/routes/count`);
      $('#routeCount').textContent = c.active;
    } catch { /* badge is cosmetic */ }
  }

  async function loadRoutes() {
    if (!state.user) return;
    const el = $('#passes');
    el.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    try {
      state.routes = await api(`/users/${state.user.user_id}/routes?archived=${state.archived}`);
      renderPasses();
      if (!state.archived) $('#routeCount').textContent = state.routes.length;
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><h3>Couldn't load routes</h3><p>${esc(e.message)}</p></div>`;
    }
  }

  function verdictFor(route) {
    const ins = route.insight || {};
    const t = Number(route.target_price);
    if (!ins.observations) return ['unknown', 'No fare data yet'];
    if (t < ins.min_fare) return ['stretch', 'Below every fare seen'];
    if (t <= ins.avg_fare) return ['good', 'Realistic target'];
    return ['easy', 'Above average · easy'];
  }

  function renderPasses() {
    const el = $('#passes');
    const archived = state.archived === 1;
    if (!state.routes.length) {
      el.innerHTML = archived
        ? '<div class="empty-state"><h3>No archived passes</h3><p>Routes you archive land here, and you can restore them any time.</p></div>'
        : '<div class="empty-state"><h3>No routes saved yet</h3><p>Explore a route, then save it with a target price.</p><a class="btn primary" href="#explore">Explore routes</a></div>';
      return;
    }
    el.innerHTML = state.routes.map((r, i) => {
      const ins = r.insight || {};
      const [vc, vt] = verdictFor(r);
      const saved = r.created_at ? new Date(r.created_at.replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const best = ins.best_window;
      return `
      <article class="pass ${archived ? 'archived' : ''}" style="--i:${i}" data-id="${r.route_id}">
        <div class="pass-main">
          <div class="pass-top"><span>FareWise${saved ? ' · saved ' + esc(saved) : ''}</span><span class="flight">FW ${String(r.route_id).padStart(4, '0')}</span></div>
          <div class="pass-route"><span class="pass-code">${esc(r.origin_airport)}</span><span class="pass-path">${PLANE}</span><span class="pass-code">${esc(r.destination_airport)}</span></div>
          <div class="pass-cities"><span>${esc(r.origin_city || '')}</span><span>${esc(r.destination_city || '')}</span></div>
          <dl class="pass-fields">
            <div><dt>Airline</dt><dd title="${esc(r.airline_name || 'Any airline')}">${esc(r.airline_name || 'Any')}</dd></div>
            <div><dt>Departs</dt><dd>${esc(DAY_LABEL[normDay(r.departure_day_filter)])}</dd></div>
            <div><dt>Stops</dt><dd>${esc(STOP_LABEL[normStops(r.stop_type)])}</dd></div>
            <div><dt>Book in</dt><dd title="${esc(r.window_label || '')}">${esc(r.window_label || '—')}</dd></div>
          </dl>
          ${r.note ? `<p class="pass-note">“${esc(r.note)}”</p>` : ''}
          <div class="pass-actions">
            ${archived
              ? '<button type="button" data-act="restore">Restore</button>'
              : '<button type="button" data-act="edit">Edit</button><button type="button" data-act="view">View fares</button><button type="button" data-act="archive" class="danger">Archive</button>'}
          </div>
        </div>
        <div class="pass-stub">
          <span class="stub-k">Target</span>
          <span class="stub-price">${money(r.target_price)}</span>
          <span class="stub-avg">hist. avg ${money(ins.avg_fare)}</span>
          <span class="verdict ${vc}">${vt}</span>
          ${best ? `<p class="stub-best">Best window <b>${esc(best.label)}</b> · ${money(best.avg_fare)}${ins.planned_window_avg != null && r.window_label ? `<br>Your window avg ${money(ins.planned_window_avg)}` : ''}</p>` : ''}
          <div class="barcode" aria-hidden="true"></div>
        </div>
      </article>`;
    }).join('');
  }

  async function onPassAction(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.pass');
    const id = Number(card.dataset.id);
    const route = state.routes.find((r) => r.route_id === id);
    const act = btn.dataset.act;
    if (act === 'edit') return openDialog(route);
    if (act === 'view') {
      Object.assign(state.filters, {
        origin: route.origin_airport, destination: route.destination_airport,
        airline: route.airline_id != null ? String(route.airline_id) : '',
        day: normDay(route.departure_day_filter), stops: normStops(route.stop_type),
      });
      syncControls();
      location.hash = '#explore';
      return runExplore();
    }
    if (act === 'archive') {
      btn.disabled = true;
      try {
        await api(`/routes/${id}?userId=${state.user.user_id}`, { method: 'DELETE' });
        card.classList.add('tearing');
        setTimeout(() => { state.routes = state.routes.filter((r) => r.route_id !== id); renderPasses(); }, 520);
        refreshRouteCount();
        toast(`Archived FW ${String(id).padStart(4, '0')}`, 'ok', { label: 'Undo', run: () => restoreRoute(id, true) });
      } catch (err) { btn.disabled = false; toast(err.message, 'error'); }
    }
    if (act === 'restore') restoreRoute(id, false);
  }

  async function restoreRoute(id, fromUndo) {
    try {
      await api(`/routes/${id}/restore`, { method: 'POST', body: { userId: state.user.user_id } });
      toast(`Restored FW ${String(id).padStart(4, '0')}`);
      refreshRouteCount();
      if (currentView() === 'routes' && (fromUndo ? state.archived === 0 : state.archived === 1)) loadRoutes();
    } catch (err) { toast(err.message, 'error'); }
  }

  // ---------- save / edit dialog ----------
  function openDialog(route) {
    const dlg = $('#routeDialog');
    state.editing = route || null;
    const f = state.filters;
    const r = state.result;
    const src = route
      ? { origin: route.origin_airport, destination: route.destination_airport, airline: route.airline_id ?? '', window: route.window_id ?? '', day: normDay(route.departure_day_filter), stops: normStops(route.stop_type), target: route.target_price, note: route.note || '' }
      : { origin: f.origin, destination: f.destination, airline: f.airline, window: r?.bestWindowId ?? '', day: f.day, stops: f.stops, target: '', note: '' };

    $('#dialogMode').textContent = route ? `Edit FW ${String(route.route_id).padStart(4, '0')}` : 'New route';
    $('#fOrigin').value = src.origin; $('#fDest').value = src.destination;
    $('#fAirline').value = String(src.airline ?? ''); $('#fWindow').value = String(src.window ?? '');
    $('#fDay').value = src.day; $('#fStops').value = src.stops;
    $('#fNote').value = src.note;
    $('#formError').textContent = '';
    $('#dialogSubmit').textContent = route ? 'Update pass' : 'Save pass';

    // Suggest a target from the best booking window.
    let best = null;
    if (route && route.insight?.best_window) best = route.insight.best_window;
    else if (!route && r) best = r.windows.find((w) => w.window_id === r.bestWindowId);
    const suggested = best && best.avg_fare ? Math.floor(best.avg_fare) : null;
    $('#fTarget').value = src.target !== '' && src.target != null ? Math.round(Number(src.target)) : (suggested || '');
    $('#targetHint').innerHTML = best
      ? `${esc(best.label)} averaged ${money(best.avg_fare)} on this route. <button type="button" id="useSuggestion">Use ${money(suggested)}</button>`
      : 'Set the price you would happily pay.';
    const use = $('#useSuggestion');
    if (use) use.addEventListener('click', () => { $('#fTarget').value = suggested; });
    updateDialogHead();
    dlg.showModal();
    setTimeout(() => $('#fTarget').focus(), 50);
  }

  function updateDialogHead() {
    $('#dlgOrigin').textContent = ($('#fOrigin').value || '---').toUpperCase();
    $('#dlgDest').textContent = ($('#fDest').value || '---').toUpperCase();
  }

  async function submitDialog(e) {
    e.preventDefault();
    const err = $('#formError');
    const body = {
      userId: state.user.user_id,
      origin: $('#fOrigin').value.trim().toUpperCase(),
      destination: $('#fDest').value.trim().toUpperCase(),
      airline: $('#fAirline').value || null,
      window: $('#fWindow').value || null,
      day: $('#fDay').value,
      stops: $('#fStops').value,
      target_price: Number($('#fTarget').value),
      note: $('#fNote').value.trim(),
    };
    if (!/^[A-Z0-9]{2,10}$/.test(body.origin) || !/^[A-Z0-9]{2,10}$/.test(body.destination)) { err.textContent = 'Pick an origin and destination airport.'; return; }
    if (body.origin === body.destination) { err.textContent = 'Origin and destination must be different.'; return; }
    if (!(body.target_price > 0)) { err.textContent = 'Enter a target price above $0.'; return; }
    const submit = $('#dialogSubmit');
    submit.disabled = true;
    try {
      const editing = state.editing;
      const saved = editing
        ? await api(`/routes/${editing.route_id}`, { method: 'PUT', body })
        : await api('/routes', { method: 'POST', body });
      $('#routeDialog').close();
      toast(`${editing ? 'Updated' : 'Saved'} FW ${String(saved.route_id).padStart(4, '0')} · ${saved.origin_airport} → ${saved.destination_airport}`, 'ok',
        editing || currentView() === 'routes' ? null : { label: 'View', run: () => { location.hash = '#routes'; } });
      refreshRouteCount();
      if (currentView() === 'routes') {
        if (editing) {
          state.routes = state.routes.map((r) => (r.route_id === saved.route_id ? saved : r));
          renderPasses();
        } else loadRoutes();
      }
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      submit.disabled = false;
    }
  }

  // ---------- views ----------
  function currentView() { return location.hash === '#routes' ? 'routes' : 'explore'; }
  function route() {
    const v = currentView();
    $('#view-explore').hidden = v !== 'explore';
    $('#view-routes').hidden = v !== 'routes';
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
    if (v === 'routes') loadRoutes();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  // ---------- wiring ----------
  function bindUI() {
    $('#controls').addEventListener('submit', (e) => e.preventDefault());
    airportPicker($('#originInput'), $('#originSuggest'), (code) => { if (code !== state.filters.origin) { state.filters.origin = code; runExplore(); } });
    airportPicker($('#destInput'), $('#destSuggest'), (code) => { if (code !== state.filters.destination) { state.filters.destination = code; runExplore(); } });
    airportPicker($('#fOrigin'), $('#fOriginSuggest'), updateDialogHead);
    airportPicker($('#fDest'), $('#fDestSuggest'), updateDialogHead);
    $('#fOrigin').addEventListener('input', updateDialogHead);
    $('#fDest').addEventListener('input', updateDialogHead);

    $('#swapBtn').addEventListener('click', () => {
      const f = state.filters;
      [f.origin, f.destination] = [f.destination, f.origin];
      syncControls(); runExplore();
    });
    $('#airlineSelect').addEventListener('change', (e) => { state.filters.airline = e.target.value; runExplore(); });
    $('#airlineSelectB').addEventListener('change', (e) => { state.compare.airline = e.target.value; runExplore(); });

    $$('.seg[data-key]').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-value]');
        if (!b) return;
        $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
        const target = seg.dataset.series === 'b' ? state.compare : state.filters;
        target[seg.dataset.key] = b.dataset.value;
        runExplore();
      });
    });

    $('#compareToggle').addEventListener('click', (e) => {
      state.compare.on = !state.compare.on;
      e.currentTarget.setAttribute('aria-expanded', String(state.compare.on));
      e.currentTarget.lastChild.textContent = state.compare.on ? ' Comparing against B' : ' Compare another set of filters';
      $('#compareControls').hidden = !state.compare.on;
      runExplore();
    });

    $('#popularChips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      state.filters.origin = c.dataset.o; state.filters.destination = c.dataset.d;
      syncControls(); runExplore();
    });

    $('#leaderboard').addEventListener('click', (e) => {
      const row = e.target.closest('.lb-row');
      if (!row) return;
      state.filters.airline = state.filters.airline === row.dataset.id ? '' : row.dataset.id;
      syncControls(); runExplore();
    });
    $('#leaderboard').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('lb-row')) e.target.click(); });

    $('#saveRouteBtn').addEventListener('click', () => openDialog(null));
    $('#routeForm').addEventListener('submit', submitDialog);
    $('#dialogCancel').addEventListener('click', () => $('#routeDialog').close());
    $('#routeDialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

    $('#archiveToggle').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-value]');
      if (!b) return;
      $$('#archiveToggle button').forEach((x) => x.classList.toggle('on', x === b));
      state.archived = Number(b.dataset.value);
      loadRoutes();
    });
    $('#passes').addEventListener('click', onPassAction);

    $('#retryBtn').addEventListener('click', async () => { if (await checkHealth()) bootData(); });
    window.addEventListener('hashchange', route);
    bindUserPicker();
  }

  async function bootData() {
    try {
      const [meta, popular] = await Promise.all([api('/meta'), api('/routes/popular')]);
      state.meta = meta;
      fillSelects();
      renderPopular(popular);
      await loadUser();
      const saved = readLS('fw.filters');
      const start = saved && saved.origin && saved.destination
        ? saved
        : popular[0] ? { origin: popular[0].origin, destination: popular[0].destination } : null;
      if (start) {
        Object.assign(state.filters, { airline: '', day: 'any', stops: 'any' }, start);
        syncControls();
        runExplore();
      }
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function init() {
    startClock();
    fitFlightPath();
    setFlaps($('#flapOrigin'), '---');
    setFlaps($('#flapDest'), '---');
    bindUI();
    route();
    if (await checkHealth()) bootData();
  }

  init();
})();
