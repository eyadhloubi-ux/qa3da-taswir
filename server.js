// قعدة تصوير — سيرفر التمرير (Express + WebSocket)
// موبايل الريس هو صاحب حالة اللعبة، والسيرفر بيمرّر الرسائل وبيحتفظ بآخر نسخة من الحالة.
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const STATS_KEY = process.env.STATS_KEY || 'qa3da';
const HOST_GRACE_MS = 45000;

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, p) {
    if (p.endsWith('sw.js') || p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));
app.get('/health', (_, res) => res.json({ ok: true }));

// مكتبة كشف الوجه والـQR من نفس السيرفر (بلا CDN خارجي)
app.use('/vendor/tasks-vision', express.static(path.join(__dirname, 'node_modules/@mediapipe/tasks-vision'), { maxAge: '30d' }));
app.use('/vendor/fonts', express.static(path.join(__dirname, 'node_modules/@fontsource'), { maxAge: '30d' }));
app.get('/vendor/qrcode.js', (_, res) => res.sendFile(path.join(__dirname, 'node_modules/qrcode-generator/qrcode.js')));

// موديل كشف الوجه: بينزل مرة وحدة من Google وبينحفظ، وبعدين بيطلع من السيرفر
const MODEL_SRC = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const MODEL_FILE = process.env.MODEL_CACHE || path.join(__dirname, '.cache', 'face_landmarker.task');
let modelDl = null;
function fetchModel() {
  if (modelDl) return modelDl;
  modelDl = new Promise((resolve, reject) => {
    const https = require('https');
    fs.mkdirSync(path.dirname(MODEL_FILE), { recursive: true });
    const get = (url, n) => https.get(url, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && n < 5) { r.resume(); return get(r.headers.location, n + 1); }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error('model ' + r.statusCode)); }
      const tmp = MODEL_FILE + '.tmp', out = fs.createWriteStream(tmp);
      r.pipe(out); out.on('finish', () => out.close(() => { fs.renameSync(tmp, MODEL_FILE); resolve(MODEL_FILE); })); out.on('error', reject);
    }).on('error', reject);
    get(MODEL_SRC, 0);
  }).catch(e => { modelDl = null; throw e; });
  return modelDl;
}
app.get('/model/face_landmarker.task', async (_, res) => {
  try {
    if (!fs.existsSync(MODEL_FILE)) await fetchModel();
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    res.sendFile(MODEL_FILE);
  } catch (e) { res.status(502).send('model unavailable'); }
});
if (!fs.existsSync(MODEL_FILE)) fetchModel().then(() => console.log('model cached')).catch(e => console.log('model later:', e.message));

// ---------- الإحصائيات ----------
const STATS_FILE = process.env.STATS_FILE || path.join(__dirname, 'stats.json');
let stats = { rooms: 0, players: 0, finished: 0, rounds: 0, games: {}, modes: {}, days: {} };
try { stats = Object.assign(stats, JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'))); } catch (_) {}
let pg = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    pg.query('CREATE TABLE IF NOT EXISTS taswir_stats (id INT PRIMARY KEY, data JSONB)')
      .then(() => pg.query('SELECT data FROM taswir_stats WHERE id=1'))
      .then(r => { if (r.rows[0]) stats = Object.assign(stats, r.rows[0].data); })
      .catch(e => console.error('pg', e.message));
  } catch (e) { console.error('pg module missing'); pg = null; }
}
let saveT = null;
function saveStats() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    if (pg) pg.query('INSERT INTO taswir_stats(id,data) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET data=$1', [stats]).catch(() => {});
    else fs.writeFile(STATS_FILE, JSON.stringify(stats), () => {});
  }, 1500);
}
function bump(key, sub, n = 1) {
  if (sub) { stats[key][sub] = (stats[key][sub] || 0) + n; } else stats[key] = (stats[key] || 0) + n;
  const d = new Date().toISOString().slice(0, 10);
  stats.days[d] = stats.days[d] || { rooms: 0, players: 0, finished: 0 };
  if (!sub && stats.days[d][key] !== undefined) stats.days[d][key] += n;
  saveStats();
}

const GAME_NAMES = {
  blink: 'لا ترمش', color: 'صيّاد الألوان', blind: 'التصوير الأعمى', frame: 'ثبّت الإطار', wink: 'غمزات',
  smile: 'لا تضحك', emoji: 'قلّد الإيموجي', statue: 'تمثال', brows: 'حواجب طايرة', head: 'راسك هو الجويستيك'
};
const MODE_NAMES = { solo: 'فردي', team: 'الفريق كله', relay: 'كل عضو جولة' };

app.get('/stats', (req, res) => {
  if (req.query.key !== STATS_KEY) return res.status(403).send('غير مصرّح');
  const rows = Object.entries(stats.games).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${GAME_NAMES[k] || k}</td><td>${v}</td></tr>`).join('');
  const modes = Object.entries(stats.modes).map(([k, v]) => `<tr><td>${MODE_NAMES[k] || k}</td><td>${v}</td></tr>`).join('');
  const days = Object.entries(stats.days).sort().slice(-14).reverse()
    .map(([d, v]) => `<tr><td>${d}</td><td>${v.rooms}</td><td>${v.players}</td><td>${v.finished}</td></tr>`).join('');
  res.send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>إحصائيات قعدة تصوير</title><style>body{font-family:system-ui;background:#F4F1EA;color:#1A1C24;max-width:640px;margin:0 auto;padding:20px}
h1{font-size:22px}.k{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.k div{background:#fff;border:2px solid #1A1C24;border-radius:12px;padding:12px;box-shadow:3px 3px 0 #1A1C24}
.k b{display:block;font-size:28px}table{width:100%;border-collapse:collapse;background:#fff;border:2px solid #1A1C24;margin-top:10px}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:right}h2{font-size:17px;margin-top:22px}</style>
<h1>إحصائيات «قعدة تصوير»</h1>
<div class="k"><div><b>${stats.rooms}</b>عدد الجلسات المفتوحة</div><div><b>${stats.players}</b>عدد المشاركين</div>
<div><b>${stats.finished}</b>الجلسات المكتملة</div><div><b>${stats.rounds}</b>الجولات الملعوبة</div></div>
<h2>الألعاب الأكثر لعباً</h2><table><tr><th>اللعبة</th><th>عدد الجولات</th></tr>${rows || '<tr><td colspan=2>لا توجد بيانات بعد</td></tr>'}</table>
<h2>أوضاع اللعب</h2><table><tr><th>الوضع</th><th>عدد الجلسات</th></tr>${modes || '<tr><td colspan=2>لا توجد بيانات بعد</td></tr>'}</table>
<h2>آخر أسبوعين</h2><table><tr><th>اليوم</th><th>الجلسات</th><th>المشاركون</th><th>المكتملة</th></tr>${days}</table>
<p style="font-size:13px;color:#666">لا تُحفظ أي أسماء أو صور، الأرقام فقط.</p></html>`);
});

// ---------- الغرف ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 2 * 1024 * 1024 });
const rooms = new Map(); // code -> room
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let c;
  do { c = Array.from({ length: 5 }, () => ALPH[crypto.randomInt(ALPH.length)]).join(''); } while (rooms.has(c));
  return c;
}
function send(ws, o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function broadcast(room, o, exceptPid) {
  const s = JSON.stringify(o);
  for (const [pid, ws] of room.socks) if (pid !== exceptPid && ws.readyState === 1) ws.send(s);
}

function hostCheck(room) {
  if (!room || room.hostSock && room.hostSock.readyState === 1) return;
  if (!room.hostGoneAt) room.hostGoneAt = Date.now();
}
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const hostAlive = room.hostSock && room.hostSock.readyState === 1;
    if (!hostAlive && room.hostGoneAt && now - room.hostGoneAt > HOST_GRACE_MS && !room.claimOpen) {
      room.claimOpen = true;
      broadcast(room, { t: 'hostGone' });
    }
    const anyAlive = [...room.socks.values()].some(w => w.readyState === 1);
    if (!anyAlive) { room.emptySince = room.emptySince || now; if (now - room.emptySince > 3 * 3600e3) rooms.delete(code); }
    else room.emptySince = 0;
  }
}, 3000);

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  send(ws, { t: 'hello', now: Date.now() });

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    const room = m.code ? rooms.get(String(m.code).toUpperCase()) : null;

    switch (m.t) {
      case 'ping': return send(ws, { t: 'pong', now: Date.now(), c: m.c });

      case 'create': {
        const code = newCode();
        const hostKey = crypto.randomBytes(12).toString('hex');
        const r = { code, hostKey, hostPid: m.pid, hostSock: ws, socks: new Map([[m.pid, ws]]), banned: new Set(), state: null, hostGoneAt: 0, claimOpen: false, counted: new Set([m.pid]) };
        rooms.set(code, r);
        ws.pid = m.pid; ws.code = code;
        bump('rooms'); bump('players');
        return send(ws, { t: 'created', code, hostKey, now: Date.now() });
      }

      case 'join': {
        if (!room) return send(ws, { t: 'err', e: 'nocode' });
        if (room.banned.has(m.pid)) return send(ws, { t: 'err', e: 'kicked' });
        ws.pid = m.pid; ws.code = room.code;
        const old = room.socks.get(m.pid);
        if (old && old !== ws) { try { old.close(); } catch (_) {} }
        room.socks.set(m.pid, ws);
        // الريس عم يرجع بمفتاحه
        if (m.hostKey && m.hostKey === room.hostKey) {
          room.hostSock = ws; room.hostPid = m.pid; room.hostGoneAt = 0; room.claimOpen = false;
          broadcast(room, { t: 'hostBack' }, m.pid);
          return send(ws, { t: 'joined', code: room.code, host: true, hostKey: room.hostKey, state: room.state, now: Date.now() });
        }
        if (!room.counted.has(m.pid)) { room.counted.add(m.pid); bump('players'); }
        send(ws, { t: 'joined', code: room.code, host: false, state: room.state, now: Date.now(), hostGone: room.claimOpen });
        send(room.hostSock, { t: 'joinReq', pid: m.pid, profile: m.profile || null });
        return;
      }

      case 'state': { // الريس بيبعت الحالة
        if (!room || m.hostKey !== room.hostKey) return;
        room.state = m.state;
        if (m.stat) {
          if (m.stat.round) { bump('rounds'); bump('games', m.stat.round); }
          if (m.stat.mode) bump('modes', m.stat.mode);
          if (m.stat.finished) bump('finished');
        }
        broadcast(room, { t: 'state', state: m.state, now: Date.now() }, room.hostPid);
        return;
      }

      case 'act': { // لاعب بيبعت حركة للريس
        if (!room || room.banned.has(m.pid)) return;
        if (m.pid === room.hostPid) return; // الريس ما بيبعت لحاله
        send(room.hostSock, { t: 'act', pid: m.pid, a: m.a });
        return;
      }

      case 'kick': {
        if (!room || m.hostKey !== room.hostKey) return;
        room.banned.add(m.target);
        const s = room.socks.get(m.target);
        send(s, { t: 'kicked' });
        room.socks.delete(m.target);
        return;
      }

      case 'handover': { // الريس بيسلّم لحدا تاني
        if (!room || m.hostKey !== room.hostKey) return;
        const s = room.socks.get(m.target);
        if (!s || s.readyState !== 1) return send(ws, { t: 'err', e: 'offline' });
        room.hostKey = crypto.randomBytes(12).toString('hex');
        room.hostPid = m.target; room.hostSock = s; room.hostGoneAt = 0; room.claimOpen = false;
        if (m.state) room.state = m.state;
        send(s, { t: 'youHost', hostKey: room.hostKey, state: room.state, now: Date.now() });
        broadcast(room, { t: 'newHost', pid: m.target }, m.target);
        return;
      }

      case 'claim': { // حدا بيستلم بعد غياب الريس
        if (!room || !room.claimOpen || room.banned.has(m.pid)) return;
        room.hostKey = crypto.randomBytes(12).toString('hex');
        room.hostPid = m.pid; room.hostSock = ws; room.hostGoneAt = 0; room.claimOpen = false;
        send(ws, { t: 'youHost', hostKey: room.hostKey, state: room.state, now: Date.now() });
        broadcast(room, { t: 'newHost', pid: m.pid }, m.pid);
        return;
      }

      case 'leave': {
        if (!room) return;
        room.socks.delete(m.pid);
        send(room.hostSock, { t: 'act', pid: m.pid, a: { type: 'leave' } });
        return;
      }
    }
  });

  ws.on('close', () => {
    const room = ws.code && rooms.get(ws.code);
    if (!room) return;
    if (room.hostSock === ws) hostCheck(room);
    else send(room.hostSock, { t: 'presence', pid: ws.pid, on: false });
  });
});

setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch (_) {} });
}, 25000);

server.listen(PORT, () => console.log('قعدة تصوير شغالة على ' + PORT));
