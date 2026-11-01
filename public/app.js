/* قعدة تصوير — منطق القعدة (الريس صاحب الحالة) */
(function () {
'use strict';
const T = window.Taswir, G = T.GAMES;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1' || !!window.TSW_DEMO;
const COLORS = ['#FFD166', '#9AD1F5', '#B8E0B0', '#F5B5C8', '#C9B6F2', '#FFB38A', '#8EE3D6', '#F2E08A', '#B5C7FF', '#E8C1A0', '#A8E6A1', '#FFA8A8', '#D4E09B', '#9FD8FF', '#F7C6E0', '#CDE7B0'];
const TEAM_C = ['#FF8A5C', '#5B8DEF', '#3CB37A', '#B57BE0'];
const TEAM_N = ['فريق العدسة', 'فريق الفلاش', 'فريق الزوم', 'فريق الكادر'];
const MODE_N = { solo: 'فردي', team: 'الفريق كله', relay: 'كل عضو جولة' };
const ENC = { m: ['حظ أوفر', 'شدّ حيلك', 'المرة الجاية إلك', 'الكاميرا ظلمتك', 'بالدورة الجاية بتفرجيهن'], f: ['حظ أوفر', 'شدّي حيلك', 'المرة الجاية إلك', 'الكاميرا ظلمتك', 'بالدورة الجاية بتفرجيهن'] };

// ---------- الهوية المحلية ----------
const LS = { get(k, d) { try { const v = localStorage.getItem('tsw_' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem('tsw_' + k, JSON.stringify(v)); } catch (_) {} } };
let myPid = LS.get('pid', null);
if (!myPid) { myPid = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); LS.set('pid', myPid); }
const me = Object.assign({ name: '', g: null, photo: null }, LS.get('me', {}));
const saveMe = () => LS.set('me', { name: me.name, g: me.g, photo: me.photo });

// ---------- حالة ----------
let S = null, isHost = false, hostKey = null, code = null, offset = 0, ws = null, wsOk = false, retry = 0, joinedOnce = false;
let pendingRole = null, submitted = false; // 'host' | 'join'
let camReady = false, simMode = false;
let curRid = null, gameApi = null, myResult = null, album = [], lastShot = null;
let spinShown = null, partyShown = null;
const srvNow = () => Date.now() + offset;

// ---------- أدوات واجهة ----------
function show(id) { $$('.screen').forEach(s => s.classList.toggle('on', s.id === 's-' + id)); window.scrollTo(0, 0); cur = id; }
let cur = 'cover';
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 2400); }
function sheet(id, on) { $('#' + id).classList.toggle('on', on !== false); }
$$('.sheet').forEach(s => s.addEventListener('click', e => { if (e.target === s || e.target.closest('[data-close]')) s.classList.remove('on'); }));
function confirmBox(t, p, yes, cb) { $('#confT').textContent = t; $('#confP').textContent = p || ''; $('#confY').textContent = yes || 'أكيد'; $('#confY').onclick = () => { sheet('shConf', false); cb(); }; sheet('shConf'); }
function av(p, s) { const ini = (p && p.name ? p.name.trim()[0] : '؟') || '؟'; return `<span class="av" style="--s:${s || 32}px;--pc:${p && p.color || '#ccc'}">${p && p.photo ? `<img src="${p.photo}" alt="">` : esc(ini)}</span>`; }
const nameOf = p => p ? (p.name || (p.g === 'f' ? 'لاعبة' : 'لاعب') + ' ' + (p.num || '')) : '';
const fem = p => p && p.g === 'f';
const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
};
$$('[data-back]').forEach(b => { b.innerHTML = ICONS.back; b.onclick = () => show(b.dataset.back); });
function gicon(id) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${G[id].icon}</svg>`; }
const LENS = `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="var(--surface)" stroke="var(--ink)" stroke-width="3"/><circle cx="100" cy="100" r="74" fill="#1A1C24"/>
<g class="blades" stroke="#3A3E4A" stroke-width="2"><line x1="100" y1="26" x2="132" y2="82"/><line x1="164" y1="63" x2="132" y2="118"/><line x1="164" y1="137" x2="100" y2="137"/><line x1="100" y1="174" x2="68" y2="118"/><line x1="36" y1="137" x2="68" y2="82"/><line x1="36" y1="63" x2="100" y2="63"/></g>
<polygon class="iris" points="100,58 136,79 136,121 100,142 64,121 64,79" fill="var(--acc)" stroke="#1A1C24" stroke-width="2"/><circle cx="122" cy="74" r="7" fill="#fff" opacity=".85"/></svg><div class="flash"></div>`;
$('#lens').innerHTML = LENS + '<span class="count">10 تحديات</span>';

// الثيم
function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; $('#themeB').innerHTML = dark ? ICONS.sun : ICONS.moon; document.querySelector('meta[name=theme-color]').content = dark ? '#14161C' : '#F4F1EA'; }
applyTheme(LS.get('theme', null));
$('#themeB').onclick = () => { const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; const t = dark ? 'light' : 'dark'; LS.set('theme', t); applyTheme(t); };
$('#helpB').onclick = () => { $('#leaveB').classList.toggle('hide', !S || isHost || DEMO); sheet('shHelp'); };

// ---------- الشبكة ----------
function wsUrl() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host; }
function connect() {
  if (DEMO) return;
  try { ws = new WebSocket(wsUrl()); } catch (_) { return scheduleRetry(); }
  ws.onopen = () => { wsOk = true; retry = 0; net(false); const c0 = Date.now(); ws.send(JSON.stringify({ t: 'ping', c: c0 })); if (joinedOnce && code) sendJoin(); else if (pendingRole && submitted) doPending(); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } onMsg(m); };
  ws.onclose = () => { wsOk = false; if (joinedOnce) net(true); scheduleRetry(); };
  ws.onerror = () => {};
}
function scheduleRetry() { clearTimeout(scheduleRetry.t); scheduleRetry.t = setTimeout(connect, Math.min(8000, 600 * Math.pow(1.6, retry++))); }
function net(off) { const b = $('#netbar'); b.textContent = 'انقطع الاتصال… عم نرجع نوصل'; b.classList.toggle('on', off); }
function wsend(o) { if (DEMO) return; if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
setInterval(() => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'ping', c: Date.now() })); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !DEMO && (!ws || ws.readyState > 1)) connect(); });

function profile() { return { name: me.name, g: me.g, photo: me.photo }; }
function sendJoin() { wsend({ t: 'join', code, pid: myPid, profile: profile(), hostKey: isHost ? hostKey : (LS.get('hk_' + code, null) || undefined) }); }
function doPending() {
  if (pendingRole === 'host') wsend({ t: 'create', pid: myPid });
  else if (pendingRole === 'join') { sendJoin(); }
}

function onMsg(m) {
  if (m.now) { /* تقدير فرق الساعة */ }
  switch (m.t) {
    case 'hello': offset = m.now - Date.now(); break;
    case 'pong': { const rtt = Date.now() - m.c; offset = m.now + rtt / 2 - Date.now(); break; }
    case 'created':
      code = m.code; hostKey = m.hostKey; isHost = true; joinedOnce = true; pendingRole = null;
      LS.set('sess', { code, at: Date.now() }); LS.set('hk_' + code, hostKey);
      S = newState(); addPlayer(myPid, profile()); pushState(); render(); break;
    case 'joined':
      joinedOnce = true; pendingRole = null; code = m.code;
      LS.set('sess', { code, at: Date.now() });
      if (m.host) { isHost = true; hostKey = m.hostKey; if (m.state) S = m.state; if (!S) S = newState(); ensureSelf(); pushState(); resumeTimers(); }
      else { isHost = false; if (m.state) S = m.state; if (m.hostGone) $('#claim').classList.add('on'); }
      if (!S) { waitScreen('عم نوصّلك بالقعدة…'); } else render();
      break;
    case 'err':
      if (m.e === 'nocode') { toast('الكود غلط أو القعدة خلصت'); joinedOnce = false; code = null; LS.set('sess', null); show('code'); }
      if (m.e === 'kicked') kickedScreen();
      if (m.e === 'offline') toast('هالشخص مو متصل هلّق');
      break;
    case 'state': if (!isHost) { S = m.state; render(); } break;
    case 'joinReq': if (isHost) { addPlayer(m.pid, m.profile); pushState(); render(); } break;
    case 'presence': if (isHost && S) { const p = pl(m.pid); if (p) { p.on = false; pushState(); render(); maybeCloseRound(); } } break;
    case 'act': if (isHost) hostAct(m.pid, m.a); break;
    case 'kicked': kickedScreen(); break;
    case 'hostGone': if (!isHost) $('#claim').classList.add('on'); break;
    case 'hostBack': case 'newHost': $('#claim').classList.remove('on'); if (m.t === 'newHost' && S) { const p = pl(m.pid); toast(p ? `${nameOf(p)} صار الريس` : 'في ريس جديد'); } break;
    case 'youHost':
      isHost = true; hostKey = m.hostKey; LS.set('hk_' + code, hostKey); $('#claim').classList.remove('on');
      if (m.state) S = m.state; if (!S) S = newState(); ensureSelf(); S.hostPid = myPid; pushState(); render(); toast('صرت الريس 👑');
      resumeTimers();
      break;
  }
}
function kickedScreen() { LS.set('sess', null); joinedOnce = false; code = null; S = null; stopGame(); waitScreen('طلّعك الريس من القعدة', true); }
function waitScreen(t, back) {
  $('#waitBody').innerHTML = `<div class="scene">${LENS}</div><h3 style="margin-top:18px">${esc(t)}</h3>${back ? '<button class="btn ghost" style="margin-top:20px" onclick="location.href=location.pathname">رجوع للبداية</button>' : ''}`;
  show('wait');
}
$('#claimB').onclick = () => { wsend({ t: 'claim', code, pid: myPid }); $('#claim').classList.remove('on'); };

// ---------- الحالة (عند الريس) ----------
function newState() {
  return { v: 1, phase: 'lobby', hostPid: myPid, players: [], settings: { mode: 'solo', teams: 2, count: 7 }, teams: [], played: [], history: [], totals: {}, round: null, group: { type: '', name: '', photo: null }, reveal: null, cycle: 1 };
}
const pl = pid => S && S.players.find(p => p.pid === pid);
function addPlayer(pid, prof) {
  let p = pl(pid);
  if (!p) {
    const used = S.players.map(x => x.color);
    p = { pid, name: '', g: 'm', photo: null, color: COLORS.find(c => !used.includes(c)) || COLORS[S.players.length % COLORS.length], on: true, ready: false, team: null, num: S.players.length + 1 };
    S.players.push(p);
    if (S.settings.mode !== 'solo') autoTeam(p);
  }
  p.on = true;
  if (prof) { if (prof.name != null) p.name = String(prof.name).slice(0, 16); if (prof.g) p.g = prof.g; if (prof.photo !== undefined) p.photo = prof.photo; }
  return p;
}
function ensureSelf() { if (!pl(myPid)) addPlayer(myPid, profile()); }
let statQ = null;
function pushState(stat) {
  if (!isHost || !S) return;
  S.hostPid = myPid; S.v++;
  if (DEMO) return;
  wsend({ t: 'state', code, hostKey, state: S, stat: stat || undefined });
}
function teamsInit() {
  const n = S.settings.teams;
  while (S.teams.length < n) { const i = S.teams.length; S.teams.push({ name: TEAM_N[i], color: TEAM_C[i], cap: null }); }
  S.teams.length = n;
  S.players.forEach(p => { if (p.team != null && p.team >= n) p.team = null; });
  S.players.forEach(p => { if (p.team == null) autoTeam(p); });
  fixCaps();
}
function autoTeam(p) {
  if (!S.teams.length) return;
  const cnt = S.teams.map((_, i) => S.players.filter(x => x.team === i && x.on).length);
  p.team = cnt.indexOf(Math.min(...cnt)); fixCaps();
}
function fixCaps() { S.teams.forEach((t, i) => { const mem = S.players.filter(p => p.team === i && p.on); if (!t.cap || !mem.some(m => m.pid === t.cap)) t.cap = mem[0] ? mem[0].pid : null; }); }
function shuffleTeams() { const ps = T.shuffle(S.players.filter(p => p.on), Math.random); ps.forEach((p, i) => (p.team = i % S.settings.teams)); S.teams.forEach(t => (t.cap = null)); fixCaps(); }
const teamMode = () => S.settings.mode !== 'solo';
function members(i) { return S.players.filter(p => p.team === i && p.on); }

function participants() {
  const on = S.players.filter(p => p.on);
  if (S.settings.mode === 'solo') return on.map(p => p.pid);
  if (S.settings.mode === 'team') return on.filter(p => p.team != null).map(p => p.pid);
  const n = S.history.length; // كل عضو جولة: بالدور
  return S.teams.map((t, i) => { const m = members(i); return m.length ? m[n % m.length].pid : null; }).filter(Boolean);
}

function spin(keepSkip) {
  const skip = keepSkip && S.round ? S.round.skip || [] : [];
  let avail = T.ORDER.filter(g => !S.played.includes(g) && !skip.includes(g));
  if (!avail.length) avail = T.ORDER.filter(g => !S.played.includes(g));
  if (!avail.length) { S.played = []; avail = T.ORDER.slice(); }
  const target = avail[Math.floor(Math.random() * avail.length)];
  S.phase = 'wheel';
  S.round = { n: S.history.length + 1, skip, spin: { id: Math.random().toString(36).slice(2, 8), avail, target, at: srvNow() }, game: target, bet: null, rid: null };
  pushState(); render();
}
function startRound() {
  const r = S.round; if (!r) return;
  r.seed = Math.floor(Math.random() * 1e9); r.rid = Math.random().toString(36).slice(2, 9);
  r.startAt = srvNow() + 4600; r.parts = participants(); r.res = {};
  S.phase = 'play';
  pushState({ round: r.game }); render();
  scheduleAutoClose();
  if (DEMO) botsPlay();
}
let closeT = null;
function scheduleAutoClose() {
  clearTimeout(closeT); const r = S.round; if (!r || !r.startAt) return;
  const ms = r.startAt - srvNow() + (T.duration(r.game, r.seed) + 12) * 1000;
  closeT = setTimeout(() => { if (S.phase === 'play' && S.round && S.round.rid === r.rid) closeRound(); }, Math.max(1000, ms));
}
function resumeTimers() { if (S && S.phase === 'play') scheduleAutoClose(); }
function maybeCloseRound() {
  if (!isHost || !S || S.phase !== 'play') return;
  const r = S.round; const need = r.parts.filter(pid => { const p = pl(pid); return p && p.on; });
  if (need.every(pid => r.res[pid])) setTimeout(() => { if (S.phase === 'play' && S.round.rid === r.rid) closeRound(); }, 900);
}
function closeRound() {
  clearTimeout(closeT);
  const r = S.round; if (!r || S.phase !== 'play') return;
  const ent = entities(r);
  ent.sort((a, b) => b.s - a.s);
  ent.forEach(e => { e.rank = 1 + ent.filter(x => x.s > e.s).length; e.pts = ({ 1: 3, 2: 2, 3: 1 }[e.rank] || 0) * (r.bet && r.bet.on ? 2 : 1); if (!e.has || e.s <= 0) e.pts = 0; });
  ent.forEach(e => (S.totals[e.key] = (S.totals[e.key] || 0) + e.pts));
  const rec = { n: r.n, game: r.game, ent, res: r.res, bet: r.bet && r.bet.on ? r.bet.by : null, rid: r.rid };
  S.history.push(rec); S.played.push(r.game);
  S.phase = 'results';
  pushState(); render();
}
function entities(r) {
  const res = r.res;
  if (S.settings.mode === 'solo') return r.parts.map(pid => ({ key: pid, s: res[pid] ? res[pid].s : 0, has: !!res[pid], l: res[pid] ? res[pid].l : 'ما لعب', pids: [pid] }));
  return S.teams.map((t, i) => {
    const pids = r.parts.filter(pid => { const p = pl(pid); return p && p.team === i; });
    const got = pids.filter(pid => res[pid]);
    const s = got.length ? got.reduce((a, pid) => a + res[pid].s, 0) / (S.settings.mode === 'team' ? Math.max(1, pids.length) : got.length) : 0;
    return { key: 't' + i, team: i, s: Math.round(s * 10) / 10, has: got.length > 0, pids, l: '' };
  }).filter(e => e.pids.length);
}
function replay() {
  if (!S.round) return;
  if (S.phase === 'results') { // ألغِ آخر نتيجة
    const h = S.history.pop(); if (h) { h.ent.forEach(e => (S.totals[e.key] -= e.pts)); const i = S.played.lastIndexOf(h.game); if (i >= 0) S.played.splice(i, 1); }
  }
  startRound(); toast('عدنا اللعبة، والنتيجة السابقة انلغت');
}
function nextRound() { if (S.history.length >= S.settings.count) { S.phase = 'wrap'; pushState(); render(); } else spin(false); }

function hostAct(pid, a) {
  if (!S || !a) return;
  const p = pl(pid);
  switch (a.type) {
    case 'ready': if (p) { p.ready = !!a.v; pushState(); render(); } break;
    case 'profile': if (p && S.phase === 'lobby') { addPlayer(pid, a.p); pushState(); render(); } break;
    case 'res': {
      const r = S.round; if (!r || S.phase !== 'play' || a.rid !== r.rid || !r.parts.includes(pid) || r.res[pid]) return;
      r.res[pid] = { s: +a.s || 0, l: String(a.l || '').slice(0, 40) }; pushState(); render(); maybeCloseRound(); break;
    }
    case 'bet': betAct(pid, a.v); break;
    case 'leave': if (p) { S.players = S.players.filter(x => x.pid !== pid); if (teamMode()) fixCaps(); pushState(); render(); maybeCloseRound(); } break;
  }
}
function myTeam(pid) { const p = pl(pid); return p ? p.team : null; }
function isCap(pid) { const t = myTeam(pid); return t != null && S.teams[t] && S.teams[t].cap === pid; }
function betAct(pid, v) {
  const r = S.round; if (!r || S.phase !== 'wheel' || !teamMode() || !isCap(pid)) return;
  const t = myTeam(pid);
  if (v === 'ask') { if (r.bet) return; r.bet = { by: t, acc: {}, on: false, off: false }; }
  else if (r.bet && !r.bet.on && !r.bet.off && t !== r.bet.by) {
    if (v === 'ref') { r.bet.off = true; r.bet.refBy = t; }
    if (v === 'acc') { r.bet.acc[t] = true; const others = S.teams.map((_, i) => i).filter(i => i !== r.bet.by && members(i).length); if (others.every(i => r.bet.acc[i])) r.bet.on = true; }
  } else return;
  pushState(); render();
}
function act(a) { if (isHost) hostAct(myPid, a); else wsend({ t: 'act', code, pid: myPid, a }); }

// ---------- البداية ----------
$('#hostB').onclick = () => { pendingRole = 'host'; openMe(); };
$('#codeB').onclick = () => { show('code'); setTimeout(() => $('#codeIn').focus(), 100); };
$('#codeIn').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); $('#codeGo').disabled = e.target.value.length !== 5; };
$('#codeGo').onclick = () => { code = $('#codeIn').value; pendingRole = 'join'; openMe(); };
function openMe() {
  me.name = ''; me.photo = null; me.g = null;
  $('#nm').value = ''; setPP($('#pp'), null, 'صورتك<br>(اختياري)'); $$('#gen button').forEach(b => b.classList.remove('on')); $('#meGo').disabled = true;
  show('me');
}
function setPP(el, src, ph) { el.innerHTML = src ? `<img src="${src}" alt="">` : ph; }
$$('#gen button').forEach(b => b.onclick = () => { me.g = b.dataset.g; $$('#gen button').forEach(x => x.classList.toggle('on', x === b)); $('#meGo').disabled = false; });
$('#meGo').onclick = () => {
  me.name = $('#nm').value.trim(); saveMe();
  if (DEMO) return startDemo();
  submitted = true;
  waitScreen(pendingRole === 'host' ? 'عم نفتح القعدة…' : 'عم نفوّتك…');
  if (ws && ws.readyState === 1) doPending(); else connect();
};

// ---------- اللوبي ----------
function renderLobby() {
  show('lobby');
  $('#ticket').classList.toggle('hide', DEMO);
  $('#code').textContent = code || '';
  const link = location.origin + location.pathname + '?c=' + (code || '');
  if (code && renderLobby.qr !== code && window.qrcode) {
    const q = qrcode(0, 'M'); q.addData(link); q.make(); $('#qr').innerHTML = q.createImgTag(4, 0); renderLobby.qr = code;
  }
  $('#copyB').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(link).then(() => toast('انسخ الرابط ✓')).catch(() => toast(link)); };
  $('#shareB').onclick = () => { if (navigator.share) navigator.share({ title: 'قعدة تصوير', text: 'فوت عالقعدة: ' + code, url: link }).catch(() => {}); else $('#copyB').onclick(); };
  // اللاعبين
  const meP = pl(myPid);
  let h = `<span class="label">مين فات (<span class="n">${S.players.filter(p => p.on).length}</span>)</span>`;
  const chip = p => `<span class="pl ${p.on ? '' : 'off'}" data-pid="${p.pid}">${av(p, 28)}${esc(nameOf(p))}${p.pid === S.hostPid ? ' <span class="b">الريس</span>' : ''}${teamMode() && p.team != null && S.teams[p.team] && S.teams[p.team].cap === p.pid ? ' <span class="b">القائد</span>' : ''}<span class="rd">${p.ready ? '📷✓' : '⌛'}</span></span>`;
  if (teamMode()) {
    h += '<div class="teams">' + S.teams.map((t, i) => `<div class="team"><h4><i style="background:${t.color}"></i>${esc(t.name)} <span class="mut" style="font-size:13px;font-family:var(--fb);font-weight:400">(${members(i).length})</span>${isHost ? `<button class="chip" data-rn="${i}" style="margin-inline-start:auto;padding:1px 10px;font-size:12px">غيّر الاسم</button>` : ''}</h4><div class="plist">${S.players.filter(p => p.team === i).map(chip).join('') || '<span class="mut" style="font-size:13px">فاضي</span>'}</div></div>`).join('') + '</div>';
    const un = S.players.filter(p => p.team == null); if (un.length) h += `<div class="plist" style="margin-top:8px">${un.map(chip).join('')}</div>`;
  } else h += `<div class="plist">${S.players.map(chip).join('')}</div>`;
  h += `<div class="edit-hint">${isHost ? 'اكبس على أي اسم لتعدّله أو تنقله أو تطلّعه، أو على اسمك لتعدّل صورتك.' : 'اكبس على اسمك لتعدّل اسمك وصورتك.'}</div>`;
  $('#lobbyPlayers').innerHTML = h;
  $$('#lobbyPlayers .pl').forEach(e => e.onclick = () => { const pid = e.dataset.pid; if (pid === myPid) openEdit(); else if (isHost) openPl(pid); });
  $$('[data-rn]').forEach(b => b.onclick = e => { e.stopPropagation(); const i = +b.dataset.rn; const v = prompt('اسم الفريق', S.teams[i].name); if (v && v.trim()) { S.teams[i].name = v.trim().slice(0, 18); pushState(); render(); } });
  // الإعدادات
  const st = S.settings;
  if (isHost) {
    $('#setBox').innerHTML = `<span class="label">طريقة اللعب</span>
      <div class="seg" id="mSeg">${Object.keys(MODE_N).map(k => `<button data-m="${k}" class="${st.mode === k ? 'on' : ''}">${MODE_N[k]}</button>`).join('')}</div>
      ${teamMode() ? `<span class="label">كم فريق؟</span><div class="seg" id="tSeg">${[2, 3, 4].map(n => `<button data-t="${n}" class="${st.teams === n ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div style="margin-top:8px"><button class="btn sm ghost" id="shufB">وزّع الفرق عشوائي 🎲</button></div>` : ''}
      <span class="label">كم لعبة؟</span>
      <div class="chips" id="cSeg">${[3, 5, 7, 10].map(n => `<button class="chip ${st.count === n ? 'on' : ''}" data-c="${n}">${n} ألعاب</button>`).join('')}</div>
      <p class="mut" style="font-size:13px;margin:8px 0 0">عجلة الحظ بتختار الألعاب، وما في لعبة بتتكرر بنفس الدورة.</p>`;
    $$('#mSeg button').forEach(b => b.onclick = () => { st.mode = b.dataset.m; if (teamMode()) teamsInit(); else S.players.forEach(p => (p.team = null)); pushState(); render(); });
    $$('#tSeg button').forEach(b => b.onclick = () => { st.teams = +b.dataset.t; teamsInit(); pushState(); render(); });
    $$('#cSeg button').forEach(b => b.onclick = () => { st.count = +b.dataset.c; pushState(); render(); });
    const sh = $('#shufB'); if (sh) sh.onclick = () => { shuffleTeams(); pushState(); render(); };
    const nOn = S.players.filter(p => p.on).length, nReady = S.players.filter(p => p.on && p.ready).length;
    const teamsOk = !teamMode() || S.teams.filter((_, i) => members(i).length).length >= 2;
    $('#startBox').innerHTML = `<button class="btn" id="goB" ${nOn < 2 || !teamsOk ? 'disabled' : ''}>يلا نبلّش 🎡</button>
      <p class="mut" style="font-size:13px;text-align:center;margin:8px 0 0">${nOn < 2 ? 'لازم يكون في لاعبين اتنين عالأقل' : !teamsOk ? 'لازم فريقين فيهن لاعبين عالأقل' : `${nReady} من ${nOn} جهّزوا الكاميرا`}</p>`;
    $('#goB').onclick = () => {
      const go = () => { if (teamMode()) { teamsInit(); } S.played = []; S.history = []; S.totals = {}; pushState({ mode: st.mode }); spin(false); };
      if (nReady < nOn) confirmBox('في حدا ما جهّز الكاميرا', 'اللي ما جهّزها رح تنفتحلو الكاميرا أول لعبة. نبلّش؟', 'إي، يلا', go); else go();
    };
  } else {
    $('#setBox').innerHTML = `<span class="label">الإعدادات</span><div class="sumrow"><span>${MODE_N[st.mode]}</span><span>${st.count} ألعاب</span>${teamMode() ? `<span>${st.teams} فرق</span>` : ''}</div>`;
    $('#startBox').innerHTML = `<p class="mut" style="text-align:center;margin:0">الريس رح يبلّش اللعبة…</p>`;
  }
  updPrep();
}

// تجهيز الكاميرا
function updPrep() {
  const p = pl(myPid);
  if (camReady) { $('#prepT').textContent = simMode ? 'بلا كاميرا (تجربة)' : 'الكاميرا جاهزة ✓'; if (simMode) $('#prepP').textContent = 'رح تنحسبلك نتايج تجريبية.'; $('#prepB').classList.add('hide'); if (!simMode && T.Cam.stream && !$('#prepV').srcObject) T.Cam.attach($('#prepV')); }
}
$('#prepB').onclick = async () => {
  const b = $('#prepB'); b.disabled = true; b.textContent = 'عم نجهّز…';
  try {
    await T.Cam.open('user'); T.Cam.attach($('#prepV'));
    $('#prepP').textContent = 'عم نحمّل كاشف الوجه…';
    await T.Cam.ensureModel();
    camReady = true; act({ type: 'ready', v: true }); updPrep();
    const loop = () => {
      if (cur !== 'lobby') return;
      const f = T.Cam.detect($('#prepV'));
      $('#prepP').textContent = f ? 'شايفينك ✓ خلّي الموبايل قدّام وجّك.' : 'قرّب وجّك من الكاميرا لتتأكد إنها شايفتك.';
      setTimeout(() => requestAnimationFrame(loop), 250);
    };
    loop();
  } catch (e) {
    b.disabled = false; b.textContent = 'جرّب مرة تانية';
    if (DEMO) { simMode = true; camReady = true; act({ type: 'ready', v: true }); updPrep(); toast('الكاميرا مو متاحة هون، رح نكمّل بنتايج تجريبية'); }
    else $('#prepP').textContent = 'ما قدرنا نفتح الكاميرا. اسمح للكاميرا من إعدادات المتصفح وجرّب.';
  }
};

// إدارة لاعب (الريس)
let plTarget = null;
function openPl(pid) {
  const p = pl(pid); if (!p) return; plTarget = pid;
  $('#plHead').innerHTML = `${av(p, 52)}<div><b style="font-size:18px">${esc(nameOf(p))}</b><div class="mut" style="font-size:13px">${p.on ? 'متصل' : 'مو متصل'} · ${p.ready ? 'الكاميرا جاهزة' : 'ما جهّز الكاميرا'}</div></div>`;
  $('#plName').value = p.name || '';
  $('#plTeam').innerHTML = teamMode() && S.phase === 'lobby' ? `<span class="label">الفريق</span><div class="chips">${S.teams.map((t, i) => `<button class="chip ${p.team === i ? 'on' : ''}" data-mt="${i}">${esc(t.name)}</button>`).join('')}</div>
    ${p.team != null ? `<button class="btn sm ghost" id="capB" style="margin-top:10px">${S.teams[p.team].cap === pid ? 'هو القائد ✓' : 'خلّيه قائد الفريق'}</button>` : ''}` : '';
  $$('[data-mt]').forEach(b => b.onclick = () => { p.team = +b.dataset.mt; fixCaps(); pushState(); render(); openPl(pid); });
  const cb = $('#capB'); if (cb) cb.onclick = () => { S.teams[p.team].cap = pid; pushState(); render(); openPl(pid); };
  $('#hoB').classList.toggle('hide', DEMO || !p.on);
  sheet('shPl');
}
$('#plNameB').onclick = () => { const p = pl(plTarget); if (!p) return; p.name = $('#plName').value.trim().slice(0, 16); pushState(); render(); toast('انعدّل الاسم ✓'); openPl(plTarget); };
$('#kkB').onclick = () => { const p = pl(plTarget); if (!p) return; confirmBox(`تطلّع ${nameOf(p)}؟`, 'ما رح يقدر يرجع لهالقعدة.', 'طلّعه', () => { wsend({ t: 'kick', code, hostKey, target: p.pid }); S.players = S.players.filter(x => x.pid !== p.pid); if (teamMode()) fixCaps(); if (S.round && S.round.parts) S.round.parts = S.round.parts.filter(x => x !== p.pid); sheet('shPl', false); pushState(); render(); maybeCloseRound(); }); };
$('#hoB').onclick = () => { const p = pl(plTarget); if (!p) return; confirmBox(`تسلّم الريس لـ${nameOf(p)}؟`, 'رح يصير هو اللي ماسك اللعبة، وإنت بتكمّل كلاعب.', 'سلّمه', () => { S.hostPid = p.pid; S.v++; wsend({ t: 'handover', code, hostKey, target: p.pid, state: S }); isHost = false; hostKey = null; LS.set('hk_' + code, null); sheet('shPl', false); render(); }); };

// تعديل ملفي
let editPhoto;
function openEdit() {
  const p = pl(myPid) || me; editPhoto = p.photo || null;
  setPP($('#epp'), editPhoto, 'صورتك'); $('#enm').value = p.name || ''; $$('#egen button').forEach(b => b.classList.toggle('on', b.dataset.g === (p.g || me.g)));
  $('#eppDel').classList.toggle('hide', !editPhoto); sheet('shEdit');
}
$$('#egen button').forEach(b => b.onclick = () => $$('#egen button').forEach(x => x.classList.toggle('on', x === b)));
$('#eppDel').onclick = () => { editPhoto = null; setPP($('#epp'), null, 'صورتك'); $('#eppDel').classList.add('hide'); };
$('#eSave').onclick = () => {
  const g = ($$('#egen button').find(b => b.classList.contains('on')) || {}).dataset; me.name = $('#enm').value.trim().slice(0, 16); me.photo = editPhoto; if (g && g.g) me.g = g.g;
  sheet('shEdit', false); saveMe();
  if (isHost) { addPlayer(myPid, profile()); pushState(); render(); } else act({ type: 'profile', p: profile() });
};

// ---------- العجلة ----------
const WEMO = { blink: '👁️', color: '🎨', blind: '🙈', frame: '🔲', wink: '😉', smile: '😐', emoji: '😮', statue: '🗿', brows: '🤨', head: '🕹️' };
const WCOL = ['#FF8A5C', '#FFD166', '#9AD1F5', '#B8E0B0', '#F5B5C8', '#C9B6F2', '#FFB38A', '#8EE3D6', '#F2E08A', '#B5C7FF'];
function renderWheel() {
  show('wheel');
  const r = S.round; const n = S.settings.count;
  $('#wn').textContent = r.n; $('#wt').textContent = n; $('#wmode').textContent = MODE_N[S.settings.mode]; $('#wpg').style.width = ((r.n - 1) / n * 100) + '%';
  const sp = r.spin;
  if (spinShown !== sp.id) {
    spinShown = sp.id;
    const av_ = sp.avail, k = av_.length, a = 360 / k;
    let svg = `<svg viewBox="-100 -100 200 200" id="wsvg">`;
    av_.forEach((g, i) => {
      const a0 = (i * a - 90) * Math.PI / 180, a1 = ((i + 1) * a - 90) * Math.PI / 180;
      const large = a > 180 ? 1 : 0;
      svg += k === 1 ? `<circle r="100" fill="${WCOL[T.ORDER.indexOf(g)]}"/>` : `<path d="M0 0 L${100 * Math.cos(a0)} ${100 * Math.sin(a0)} A100 100 0 ${large} 1 ${100 * Math.cos(a1)} ${100 * Math.sin(a1)}Z" fill="${WCOL[T.ORDER.indexOf(g)]}" stroke="#1A1C24" stroke-width="1.2"/>`;
      const mid = (i + .5) * a - 90;
      svg += `<text transform="rotate(${mid}) translate(64 0) rotate(${-mid})" text-anchor="middle" dominant-baseline="central" class="we">${WEMO[g]}</text>`;
    });
    svg += '</svg>';
    $('#wheel').innerHTML = svg;
    const ti = av_.indexOf(sp.target);
    const final = 360 * 6 + (360 - (ti + .5) * a);
    const el = $('#wsvg');
    const elapsed = srvNow() - sp.at;
    if (elapsed > 3300) { el.style.transition = 'none'; el.style.transform = `rotate(${final}deg)`; renderWheelBody(true); }
    else {
      el.style.transform = 'rotate(0deg)';
      $('#wbody').innerHTML = '';
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = `rotate(${final}deg)`; }));
      setTimeout(() => { if (spinShown === sp.id && S.phase === 'wheel') { renderWheelBody(true); tick(); } }, Math.max(200, 3500 - elapsed));
      return;
    }
  } else if (srvNow() - sp.at > 3300) renderWheelBody(false);
}
function tick() { try { const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.value = .06; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .08); } catch (_) {} }
function renderWheelBody(anim) {
  const r = S.round, g = G[r.game];
  const parts = participants();
  const meIn = parts.includes(myPid);
  let who = '';
  if (S.settings.mode === 'relay') who = `<div class="whoplays">بيلعبوا هالجولة: ${parts.map(pid => `<b>${esc(nameOf(pl(pid)))}</b>`).join('، ')}</div>`;
  let bet = '';
  if (teamMode()) {
    const b = r.bet, myT = myTeam(myPid), cap = isCap(myPid);
    if (!b && cap) bet = `<div class="bet"><b>إنت قائد ${esc(S.teams[myT].name)}</b>بدك تراهن وتضاعف نقاط هاللعبة؟ <button class="btn sm red" id="betAsk" style="margin-top:8px">ضاعف هاللعبة ×2</button></div>`;
    else if (b) {
      const by = S.teams[b.by] ? S.teams[b.by].name : '';
      if (b.on) bet = `<div class="bet"><b>رهان مقبول <span class="x2">×2</span></b>نقاط هاللعبة مضاعفة.</div>`;
      else if (b.off) bet = `<div class="bet"><b>انرفض الرهان</b>${esc(S.teams[b.refBy] ? S.teams[b.refBy].name : '')} ما وافق. اللعبة بنقاطها العادية.</div>`;
      else if (cap && myT !== b.by && !b.acc[myT]) bet = `<div class="bet"><b>${esc(by)} بدو يضاعف النقاط ×2</b>بتقبلوا؟<div class="row" style="margin-top:8px"><button class="btn sm green" id="betAcc">قبلنا</button><button class="btn sm ghost" id="betRef">لأ</button></div></div>`;
      else bet = `<div class="bet"><b>${esc(by)} طلب رهان ×2</b>عم نستنى قادة الفرق التانية…</div>`;
    }
  }
  $('#wbody').innerHTML = `<div class="card gcard"><div class="gname"><span class="gico">${gicon(r.game)}</span><div><h3>${g.name}${r.bet && r.bet.on ? '<span class="x2">×2</span>' : ''}</h3><p>${g.short}</p></div></div>
    <p class="how">${g.how}</p>${who}${!meIn ? `<p class="whoplays">${S.settings.mode === 'relay' ? 'مو دورك هالمرة، رح تتفرّج.' : ''}</p>` : ''}</div>${bet}
    ${isHost ? `<div class="col" style="margin-top:14px"><button class="btn big" id="startG">ابدأ 📸</button><button class="btn sm ghost" id="skipG">ما حبيناها، مرّر</button></div>` : `<p class="mut" style="text-align:center;margin-top:14px">${fem(pl(S.hostPid)) ? 'الريسة' : 'الريس'} رح ${fem(pl(S.hostPid)) ? 'تبلّش' : 'يبلّش'}… جهّز وجّك</p>`}`;
  const sa = $('#startG'); if (sa) sa.onclick = startRound;
  const sk = $('#skipG'); if (sk) sk.onclick = () => { S.round.skip = (S.round.skip || []).concat(S.round.game); spin(true); };
  const ba = $('#betAsk'); if (ba) ba.onclick = () => act({ type: 'bet', v: 'ask' });
  const bc = $('#betAcc'); if (bc) bc.onclick = () => act({ type: 'bet', v: 'acc' });
  const br = $('#betRef'); if (br) br.onclick = () => act({ type: 'bet', v: 'ref' });
  if (!camReady && !DEMO && T.Cam.landmarker == null) T.Cam.ensureModel().catch(() => {});
}

// ---------- اللعب ----------
function stopGame() { if (gameApi) { gameApi.stop(); gameApi = null; } }
function renderPlay() {
  const r = S.round, n = S.settings.count;
  if (cur !== 'play') show('play');
  $('#pn').textContent = r.n; $('#pt').textContent = n; $('#pmode').textContent = MODE_N[S.settings.mode]; $('#ppg').style.width = ((r.n - 1) / n * 100) + '%';
  $('#pgame').innerHTML = `<span class="gico">${gicon(r.game)}</span><div><h3>${G[r.game].name}${r.bet && r.bet.on ? '<span class="x2">×2</span>' : ''}</h3><p>${G[r.game].short}</p></div>`;
  if (curRid !== r.rid) {
    curRid = r.rid; stopGame(); myResult = null;
    if (r.parts.includes(myPid)) {
      const meP = pl(myPid);
      const local = r.startAt - offset;
      gameApi = T.play({ id: r.game, seed: r.seed, startAt: local, g: meP ? meP.g : me.g, stage: $('#stage'), sim: simMode || (DEMO && !T.Cam.stream && !camReady),
        onDone(s, l, snap) {
          myResult = { s, l };
          if (snap) { album = album.filter(a => a.n !== r.n); album.push({ n: r.n, game: r.game, l, img: snap }); lastShot = { rid: r.rid, img: snap, l }; }
          act({ type: 'res', rid: r.rid, s, l });
        } });
    } else {
      const ps = r.parts.map(pl).filter(Boolean);
      $('#stage').innerHTML = `<div class="card watch" style="margin-top:12px"><div class="scene" style="width:120px;height:120px;margin:0 auto">${LENS}</div><h3 style="margin-top:10px">مو دورك هالمرة</h3><p class="mut" style="margin:4px 0 0">عم ${ps.length > 1 ? 'يلعبوا' : 'يلعب'}: ${ps.map(p => esc(nameOf(p))).join('، ')}</p></div>`;
    }
  }
  // حالة اللاعبين
  $('#pplist').innerHTML = r.parts.map(pid => { const p = pl(pid); if (!p) return ''; const d = r.res[pid]; return `<span class="pl ${d ? 'done' : ''} ${p.on ? '' : 'off'}">${av(p, 24)}${esc(nameOf(p))} ${d ? '✓' : '⏳'}</span>`; }).join('');
  $('#pboss').classList.toggle('hide', !isHost);
}
$('#replayB').onclick = () => confirmBox('نعيد اللعبة؟', 'رح تبلّش من أول وجديد عند الكل.', 'عيدها', replay);
$('#closeB').onclick = () => confirmBox('نسكّر الجولة هلّق؟', 'اللي ما خلّص رح تنحسبلو صفر.', 'سكّر', closeRound);

// ---------- نتيجة اللعبة ----------
function entName(e) { return e.team != null ? S.teams[e.team].name : nameOf(pl(e.key)); }
function renderResults() {
  show('res'); stopGame();
  const h = S.history[S.history.length - 1]; if (!h) return;
  const g = G[h.game];
  const top = h.ent[0];
  $('#rsub').textContent = `نتيجة «${g.name}»${h.bet != null ? ' · ×2' : ''}`;
  $('#rtitle').textContent = top && top.has ? (top.team != null ? `${S.teams[top.team].name} ربح هالجولة!` : `${nameOf(pl(top.key))} ${fem(pl(top.key)) ? 'ربحت' : 'ربح'} هالجولة!`) : 'ما حدا خلّص 😅';
  $('#rshot').innerHTML = lastShot && lastShot.rid === h.rid ? `<div class="shot"><span class="tape"></span><img src="${lastShot.img}" alt=""><p>لقطتك: ${esc(lastShot.l)}</p></div><p class="mut" style="text-align:center;font-size:12px;margin:8px 0 0">اللقطة عموبايلك بس، ورح تطلع بألبومك بالآخر.</p>` : '';
  $('#rlist').innerHTML = h.ent.map(e => {
    const mine = e.pids.includes(myPid);
    if (e.team != null) {
      const sub = e.pids.map(pid => { const p = pl(pid), r = h.res[pid]; return `${esc(nameOf(p))}: ${r ? esc(r.l) : 'ما لعب'}`; }).join(' · ');
      return `<div class="rk ${mine ? 'me' : ''}"><span class="p">${e.rank}</span><span class="tdot" style="background:${S.teams[e.team].color}"></span><span class="nm">${esc(S.teams[e.team].name)}<small>${sub}</small></span><span class="v n">${e.s}</span><span class="pt ${e.pts ? '' : 'z'}">${e.pts ? '+' + e.pts : 0}</span></div>`;
    }
    const p = pl(e.key);
    return `<div class="rk ${mine ? 'me' : ''}"><span class="p">${e.rank}</span>${av(p, 30)}<span class="nm">${esc(nameOf(p))}<small>${esc(e.l)}</small></span><span class="pt ${e.pts ? '' : 'z'}">${e.pts ? '+' + e.pts : 0}</span></div>`;
  }).join('');
  // المجموع
  const tot = totalsSorted();
  $('#rtot').innerHTML = `<details class="card" style="padding:10px 14px"><summary style="cursor:pointer;font-weight:700">المجموع لهلّق</summary>${tot.map((e, i) => `<div class="rk"><span class="p">${i + 1}</span>${e.team != null ? `<span class="tdot" style="background:${S.teams[e.team].color}"></span>` : av(pl(e.key), 26)}<span class="nm">${esc(e.name)}</span><span class="v n">${e.pts}</span></div>`).join('')}</details>`;
  const last = S.history.length >= S.settings.count;
  $('#rbtns').innerHTML = isHost ? `<button class="btn big" id="nextB">${last ? 'خلصت الألعاب، عالكشف 🎉' : 'دوّر العجلة للعبة الجاية 🎡'}</button><button class="btn sm ghost" id="replay2">ما فهموها؟ عيد اللعبة</button>` : `<p class="mut" style="text-align:center;margin:0">${last ? 'خلصت الألعاب! الريس عم يحضّر الكشف…' : 'الريس رح يدوّر العجلة…'}</p>`;
  const nb = $('#nextB'); if (nb) nb.onclick = nextRound;
  const rb = $('#replay2'); if (rb) rb.onclick = () => confirmBox('نعيد اللعبة؟', 'نتيجة هاللعبة رح تنلغى وتنلعب من جديد.', 'عيدها', replay);
}
function totalsSorted() {
  let arr;
  if (S.settings.mode === 'solo') arr = S.players.filter(p => S.totals[p.pid] != null || p.on).map(p => ({ key: p.pid, name: nameOf(p), pts: S.totals[p.pid] || 0, p }));
  else arr = S.teams.map((t, i) => ({ key: 't' + i, team: i, name: t.name, pts: S.totals['t' + i] || 0 })).filter(e => members(e.team).length || e.pts);
  arr.sort((a, b) => b.pts - a.pts);
  arr.forEach(e => (e.rank = 1 + arr.filter(x => x.pts > e.pts).length));
  return arr;
}
function titleFor(rank, g, team, i) {
  if (rank === 1) return team ? 'المعلّمين' : g === 'f' ? 'المعلّمة' : 'المعلّم';
  if (rank === 2) return team ? 'نواب المعلّم' : g === 'f' ? 'نائبة المعلّم' : 'نائب المعلّم';
  if (rank === 3) return 'بالكادر';
  const L = ENC[g === 'f' ? 'f' : 'm']; return L[(i || 0) % L.length];
}

// ---------- قبل الكشف ----------
const GTYPES = ['شلة', 'رفقة', 'عيلة', 'زملاء', 'غير شي'];
function renderWrap() {
  if (!isHost) { waitScreen('الريس عم يحضّر الكشف… 🎉'); return; }
  if (cur !== 'wrap') {
    show('wrap');
    $('#gn').value = S.group.name || ''; setPP($('#gp'), S.group.photo, 'خدوا سيلفي سوا<br>أو اختاروا صورة');
  }
  const custom = S.group.type && !GTYPES.slice(0, 4).includes(S.group.type);
  $('#gt').innerHTML = GTYPES.map(t => `<button class="chip ${S.group.type === t || (t === 'غير شي' && custom) ? 'on' : ''}" data-gt="${t}">${t === 'غير شي' && custom ? esc(S.group.type) : t}</button>`).join('');
  $$('[data-gt]').forEach(b => b.onclick = () => { if (b.dataset.gt === 'غير شي') { $('#gtIn').classList.remove('hide'); $('#gtc').focus(); return; } S.group.type = S.group.type === b.dataset.gt ? '' : b.dataset.gt; $('#gtIn').classList.add('hide'); pushState(); renderWrap(); });
}
$('#gtcB').onclick = () => { const v = $('#gtc').value.trim(); if (v) { S.group.type = v.slice(0, 16); $('#gtIn').classList.add('hide'); pushState(); renderWrap(); } };
$('#gn').oninput = e => { S.group.name = e.target.value.slice(0, 22); clearTimeout($('#gn').t); $('#gn').t = setTimeout(() => pushState(), 500); };
$('#partyB').onclick = () => { S.reveal = 'party'; S.partyAt = srvNow() + 400; S.phase = 'party'; pushState({ finished: true }); render(); setTimeout(() => { if (S.phase === 'party') { S.phase = 'final'; pushState(); render(); } }, partyLen() + 600); };
$('#allB').onclick = () => { S.reveal = 'all'; S.phase = 'final'; pushState({ finished: true }); render(); confetti(); };
$('#editG').onclick = () => { S.phase = 'wrap'; pushState(); render(); };
$('#againB').onclick = () => confirmBox('دورة جديدة؟', 'رح تنصفّر النقاط وتبلّش دورة جديدة بنفس اللاعبين.', 'يلا', () => { S.phase = 'lobby'; S.played = []; S.history = []; S.totals = {}; S.round = null; S.cycle++; pushState(); render(); });

// ---------- حفلة الكشف ----------
function partyLen() { const n = Math.min(3, totalsSorted().length); return 3000 + n * 2600 + 600; }
function renderParty() {
  show('party');
  if (partyShown === S.partyAt) return; partyShown = S.partyAt;
  const tot = totalsSorted(), team = teamMode();
  const steps = tot.slice(0, 3).reverse();
  const t0 = S.partyAt - offset;
  const run = () => {
    const el = Date.now() - t0;
    if (S.phase !== 'party') return;
    if (el < 3000) { const c = 3 - Math.floor(el / 1000); if ($('#pb').dataset.k !== 'c' + c) { $('#pb').dataset.k = 'c' + c; $('#pb').innerHTML = `<p class="mut">والمعلّم ${team ? 'بين الفرق' : 'بهالقعدة'} هو…</p><div class="cnt">${c}</div>`; } }
    else {
      const k = Math.min(steps.length - 1, Math.floor((el - 3000) / 2600)); const e = steps[k];
      if ($('#pb').dataset.k !== String(k)) {
        $('#pb').dataset.k = k;
        const p = e.p;
        $('#pb').innerHTML = `<div class="pod"><p class="mut" style="margin:0">المركز ${e.rank}</p>${team ? `<div style="width:110px;height:110px;margin:14px auto 0;border-radius:30%;border:3px solid var(--press);box-shadow:4px 4px 0 var(--press);background:${S.teams[e.team].color}"></div>` : av(p, 120)}<h2 style="margin-top:14px;font-size:30px">${esc(e.name)}</h2><span class="ttl">${titleFor(e.rank, p ? p.g : 'm', team)}</span><p class="mut">${e.pts} نقطة</p></div>`;
        if (e.rank === 1) confetti();
      }
    }
    requestAnimationFrame(run);
  };
  $('#pb').dataset.k = ''; run();
}

// ---------- النتيجة النهائية ----------
let story = { kind: 'rank', lay: 'cover', th: 'light' };
function renderFinal() {
  if (cur !== 'final') { show('final'); if (S.reveal === 'all' && renderFinal.c !== S.v) confetti(); }
  renderFinal.c = S.v; stopGame();
  const tot = totalsSorted(), team = teamMode();
  const meP = pl(myPid);
  $('#fh').textContent = S.group.name || 'النتيجة';
  const w = tot[0];
  $('#starBox').innerHTML = w ? `<div class="star">${team ? `<span class="av" style="--s:56px;--pc:${S.teams[w.team].color}">🏆</span>` : av(w.p, 56)}<div><small>${team ? 'الفريق المعلّم' : titleFor(1, w.p && w.p.g)}</small><b>${esc(w.name)}</b></div><span style="margin-inline-start:auto;font-weight:700;font-size:20px" class="n">${w.pts}</span></div>` : '';
  $('#resP').innerHTML = tot.map((e, i) => {
    const mine = team ? meP && meP.team === e.team : e.key === myPid;
    const t = titleFor(e.rank, e.p ? e.p.g : 'm', team, i);
    const sub = team ? members(e.team).map(p => esc(nameOf(p))).join('، ') : '';
    return `<div class="pr ${mine ? 'me' : ''}"><span class="r">${e.rank}</span>${team ? `<span class="av" style="--s:38px;--pc:${S.teams[e.team].color}">${e.rank === 1 ? '🏆' : ''}</span>` : av(e.p, 38)}<div><div class="nm">${esc(e.name)}</div><div class="t">${e.rank <= 3 ? `<span>${t}</span>` : `<i>${t}</i>`}${sub ? ` <i>· ${sub}</i>` : ''}</div></div><div class="pts n">${e.pts}<small>نقطة</small></div></div>`;
  }).join('');
  $('#resQ').innerHTML = S.history.map(h => `<details class="qd"><summary><span class="gico" style="width:30px;height:30px;border-radius:8px">${gicon(h.game)}</span>${G[h.game].name}${h.bet != null ? '<span class="x2">×2</span>' : ''}</summary><div class="gl">${h.ent.map(e => `<span class="${e.rank === 1 ? 'w' : ''}">${e.rank}. ${esc(entName(e))}${e.team == null ? ' · ' + esc(e.l) : ' · ' + e.s}${e.pts ? ` (+${e.pts})` : ''}</span>`).join('')}</div></details>`).join('');
  $('#hostEnd').classList.toggle('hide', !isHost);
  drawStory();
}
$$('#ftab button').forEach(b => b.onclick = () => { $$('#ftab button').forEach(x => x.classList.toggle('on', x === b)); $('#resP').classList.toggle('hide', b.dataset.t !== 'p'); $('#resQ').classList.toggle('hide', b.dataset.t !== 'q'); });
[['kind', 'kind'], ['lay', 'lay'], ['ith', 'th']].forEach(([id, k]) => $$('#' + id + ' button').forEach(b => b.onclick = () => { story[k] = b.dataset.v; $$('#' + id + ' button').forEach(x => x.classList.toggle('on', x === b)); drawStory(); }));
let storyURL = null;
async function drawStory() {
  const tot = totalsSorted(), team = teamMode(), meP = pl(myPid) || { name: me.name, g: me.g, photo: me.photo, color: '#FFD166' };
  const myE = team ? tot.find(e => e.team === meP.team) : tot.find(e => e.key === myPid);
  const idx = myE ? tot.indexOf(myE) : tot.length;
  const data = {
    me: { name: nameOf(meP), photo: meP.photo, color: meP.color, g: meP.g },
    team: team && myE ? { name: myE.name, color: S.teams[myE.team].color, members: members(myE.team).map(p => ({ name: nameOf(p), photo: p.photo, color: p.color })) } : null,
    rank: myE ? myE.rank : '-', pts: myE ? myE.pts : 0, title: myE ? titleFor(myE.rank, meP.g, team, idx) : '',
    top: tot.slice(0, 5).map(e => ({ name: e.name, pts: e.pts, rank: e.rank, color: team ? S.teams[e.team].color : e.p && e.p.color, photo: team ? null : e.p && e.p.photo, mine: e === myE })),
    group: S.group, count: S.history.length, total: tot.length,
    album: album.slice().sort((a, b) => a.n - b.n).map(a => ({ img: a.img, game: G[a.game].name, l: a.l }))
  };
  try {
    storyURL = await window.Story.render(story.kind, story.lay, story.th, data);
    $('#story').innerHTML = `<img src="${storyURL}" alt="صورة الستوري">`;
  } catch (e) { console.error(e); $('#story').innerHTML = '<p class="mut" style="padding:20px;text-align:center">ما قدرنا نرسم الصورة</p>'; }
}
$('#dlB').onclick = async () => {
  if (!storyURL) return;
  const name = `qa3da-taswir-${story.kind}.png`;
  try {
    const blob = await (await fetch(storyURL)).blob(); const f = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ files: [f], title: 'قعدة تصوير' }); return; }
  } catch (_) {}
  const a = document.createElement('a'); a.href = storyURL; a.download = name; a.click();
};

// تنزيل كتطبيق
let bip = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); bip = e; $('#instB').classList.remove('hide'); });
$('#instB').onclick = () => { if (bip) { bip.prompt(); bip = null; $('#instB').classList.add('hide'); } };
if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- الرسم الرئيسي ----------
function render() {
  if (!S) return;
  $('#hcode').textContent = DEMO ? '' : code || '';
  if (!pl(myPid) && !isHost && S.phase !== 'lobby' && joinedOnce) { /* لاعب جديد وصل بنص اللعب */ }
  switch (S.phase) {
    case 'lobby': stopGame(); curRid = null; renderLobby(); break;
    case 'wheel': stopGame(); renderWheel(); break;
    case 'play': renderPlay(); break;
    case 'results': renderResults(); break;
    case 'wrap': renderWrap(); break;
    case 'party': renderParty(); break;
    case 'final': renderFinal(); break;
  }
}
$('#leaveB').onclick = () => confirmBox('تطلع من القعدة؟', '', 'اطلع', () => { wsend({ t: 'leave', code, pid: myPid }); LS.set('sess', null); location.href = location.pathname; });

// ---------- الصور: اختيار + سيلفي + قص ----------
let pickTarget = null;
$$('[data-pick]').forEach(b => b.onclick = () => { pickTarget = b.dataset.pick; $('#file').value = ''; $('#file').click(); });
$('#pp').onclick = () => { pickTarget = 'me'; $('#file').value = ''; $('#file').click(); };
$('#epp').onclick = () => { pickTarget = 'edit'; $('#file').value = ''; $('#file').click(); };
$('#gp').onclick = () => { pickTarget = 'group'; $('#file').value = ''; $('#file').click(); };
$('#file').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => openCrop(r.result, pickTarget); r.readAsDataURL(f); };
let selfieTarget = null, selfieT = null;
$$('[data-selfie]').forEach(b => b.onclick = async () => {
  selfieTarget = b.dataset.selfie;
  try { await T.Cam.open('user'); T.Cam.attach($('#sv')); $('#selfie').classList.add('on'); $('#scd').textContent = ''; }
  catch (_) { toast('ما قدرنا نفتح الكاميرا'); }
});
$('#sX').onclick = () => { clearInterval(selfieT); $('#selfie').classList.remove('on'); };
$('#sShot').onclick = () => {
  const take = () => { const img = T.Cam.snapshot($('#sv'), 900); $('#selfie').classList.remove('on'); if (img) openCrop(img, selfieTarget); };
  if (selfieTarget !== 'group') return take();
  let c = 3; $('#scd').textContent = c; clearInterval(selfieT);
  selfieT = setInterval(() => { c--; if (c <= 0) { clearInterval(selfieT); $('#scd').textContent = ''; take(); } else $('#scd').textContent = c; }, 1000);
};
const crop = { img: null, s: 1, min: 1, x: 0, y: 0, target: null, ar: 1 };
function openCrop(src, target) {
  crop.target = target; crop.ar = target === 'group' ? 4 / 3 : 1;
  $('#frame').style.setProperty('--ar', crop.ar);
  const im = $('#cimg'); im.onload = () => {
    const F = $('#frame').getBoundingClientRect();
    crop.min = Math.max(F.width / im.naturalWidth, F.height / im.naturalHeight); crop.s = crop.min; crop.x = 0; crop.y = 0; $('#zm').value = 0; place();
  };
  im.src = src; $('#crop').classList.add('on');
}
function place() {
  const im = $('#cimg'), F = $('#frame').getBoundingClientRect();
  const w = im.naturalWidth * crop.s, h = im.naturalHeight * crop.s;
  const mx = Math.max(0, (w - F.width) / 2), my = Math.max(0, (h - F.height) / 2);
  crop.x = Math.max(-mx, Math.min(mx, crop.x)); crop.y = Math.max(-my, Math.min(my, crop.y));
  im.style.width = w + 'px'; im.style.height = h + 'px'; im.style.transform = `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px))`;
}
$('#zm').oninput = e => { crop.s = crop.min * (1 + e.target.value * 3); place(); };
(() => {
  const f = $('#frame'); let pts = new Map(), last = null, lastD = 0;
  f.addEventListener('pointerdown', e => { f.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; lastD = 0; });
  f.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (lastD) { crop.s = Math.max(crop.min, Math.min(crop.min * 4, crop.s * d / lastD)); $('#zm').value = (crop.s / crop.min - 1) / 3; } lastD = d; place(); return; }
    crop.x += e.clientX - last[0]; crop.y += e.clientY - last[1]; last = [e.clientX, e.clientY]; place();
  });
  const up = e => { pts.delete(e.pointerId); lastD = 0; if (pts.size === 1) last = [...pts.values()][0]; };
  f.addEventListener('pointerup', up); f.addEventListener('pointercancel', up);
  f.addEventListener('wheel', e => { e.preventDefault(); crop.s = Math.max(crop.min, Math.min(crop.min * 4, crop.s * (e.deltaY < 0 ? 1.08 : .92))); $('#zm').value = (crop.s / crop.min - 1) / 3; place(); }, { passive: false });
})();
$('#cropX').onclick = () => $('#crop').classList.remove('on');
$('#cropOk').onclick = () => {
  const im = $('#cimg'), F = $('#frame').getBoundingClientRect();
  const out = crop.target === 'group' ? [800, 600] : [220, 220];
  const c = document.createElement('canvas'); c.width = out[0]; c.height = out[1]; const x = c.getContext('2d');
  const sx = (im.naturalWidth * crop.s - F.width) / 2 - crop.x, sy = (im.naturalHeight * crop.s - F.height) / 2 - crop.y;
  x.drawImage(im, sx / crop.s, sy / crop.s, F.width / crop.s, F.height / crop.s, 0, 0, out[0], out[1]);
  const url = c.toDataURL('image/jpeg', crop.target === 'group' ? .8 : .78);
  $('#crop').classList.remove('on');
  if (crop.target === 'me') { me.photo = url; setPP($('#pp'), url); }
  else if (crop.target === 'edit') { editPhoto = url; setPP($('#epp'), url); $('#eppDel').classList.remove('hide'); }
  else if (crop.target === 'group') { S.group.photo = url; setPP($('#gp'), url); pushState(); }
};

// ---------- كونفيتي ----------
function confetti() {
  const c = $('#cf'), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
  const cols = ['#FF8A5C', '#FFD166', '#9AD1F5', '#B8E0B0', '#F5B5C8', '#1A1C24'];
  const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .4, vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * 6.28, vr: (Math.random() - .5) * .3, w: 6 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = performance.now();
  (function f(t) { x.clearRect(0, 0, c.width, c.height); ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .05; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); x.restore(); }); if (t - t0 < 4200) requestAnimationFrame(f); else x.clearRect(0, 0, c.width, c.height); })(t0);
}

// ---------- الوضع التجريبي ----------
const BOTS = [['سارة', 'f'], ['رنيم', 'f'], ['عمر', 'm'], ['محمد', 'm']];
function startDemo() {
  isHost = true; code = 'DEMO1'; joinedOnce = true;
  S = newState(); addPlayer(myPid, profile());
  BOTS.forEach(([n, g], i) => { const p = addPlayer('bot' + i, { name: n, g }); p.ready = true; p.bot = true; });
  render();
}
function botsPlay() {
  const r = S.round;
  r.parts.filter(pid => pid.startsWith('bot')).forEach(pid => {
    const p = pl(pid); const d = T.duration(r.game, r.seed);
    const s = T.simScore(r.game, Math.random);
    const at = r.startAt - offset + Math.min(d, 4 + Math.random() * Math.min(d, 16)) * 1000 - Date.now();
    setTimeout(() => { if (S.phase === 'play' && S.round.rid === r.rid) hostAct(pid, { type: 'res', rid: r.rid, s: Math.round(s * 10) / 10, l: T.labelFor(r.game, s, p.g === 'f') }); }, Math.max(300, at));
  });
}

// ---------- الدخول من رابط ----------
if (DEMO) { $('#demoTag').classList.remove('hide'); }
const urlCode = (params.get('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const sess = LS.get('sess', null);
if (!DEMO && urlCode.length === 5) {
  code = urlCode;
  if (sess && sess.code === urlCode && Date.now() - sess.at < 6 * 3600e3) { joinedOnce = true; waitScreen('عم نرجّعك عالقعدة…'); connect(); }
  else { pendingRole = 'join'; openMe(); connect(); }
} else if (!DEMO && sess && sess.code && Date.now() - sess.at < 3 * 3600e3) {
  code = sess.code; joinedOnce = true; if (LS.get('hk_' + code, null)) { isHost = true; hostKey = LS.get('hk_' + code); }
  waitScreen('عم نرجّعك عالقعدة…'); connect();
  setTimeout(() => { if (!S && cur === 'wait') { LS.set('sess', null); joinedOnce = false; show('cover'); } }, 8000);
} else if (!DEMO) connect();

window.__tsw = { get S() { return S; }, act, render };
})();
