/* قعدة تصوير — رسم صورة الستوري (9:16) */
(function () {
'use strict';
const W = 1080, H = 1920;
const TH = {
  light: { bg: '#F4F1EA', dot: 'rgba(26,28,36,.09)', surf: '#FFFFFF', ink: '#1A1C24', ink2: '#6A6C75', line: '#DCD6C8', sh: '#1A1C24', cam: '#22252E' },
  dark: { bg: '#14161C', dot: 'rgba(255,255,255,.06)', surf: '#1E2129', ink: '#EEEBE3', ink2: '#9C9EA6', line: '#30343F', sh: '#05060A', cam: '#0C0D11' }
};
const ACC = '#FF8A5C', FD = '"Reem Kufi","Readex Pro",sans-serif', FB = '"Readex Pro",sans-serif';
const cache = {};
function img(src) { if (!src) return Promise.resolve(null); if (cache[src]) return cache[src]; return (cache[src] = new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; })); }
async function fonts() { try { await Promise.all([document.fonts.load(`700 60px "Reem Kufi"`, 'قعدة'), document.fonts.load(`500 40px "Readex Pro"`, 'قعدة'), document.fonts.load(`700 40px "Readex Pro"`, 'قعدة'), document.fonts.load(`400 40px "Readex Pro"`, 'قعدة')]); } catch (_) {} }

function rr(x, c, X, Y, w, h, r) { c.beginPath(); c.moveTo(X + r, Y); c.arcTo(X + w, Y, X + w, Y + h, r); c.arcTo(X + w, Y + h, X, Y + h, r); c.arcTo(X, Y + h, X, Y, r); c.arcTo(X, Y, X + w, Y, r); c.closePath(); }
function box(c, t, X, Y, w, h, r, fill, sh) {
  sh = sh == null ? 10 : sh;
  if (sh) { rr(0, c, X + sh, Y + sh, w, h, r); c.fillStyle = t.sh; c.fill(); }
  rr(0, c, X, Y, w, h, r); c.fillStyle = fill || t.surf; c.fill(); c.lineWidth = 6; c.strokeStyle = t.sh; c.stroke();
}
function cover(c, im, X, Y, w, h) {
  const s = Math.max(w / im.width, h / im.height), dw = im.width * s, dh = im.height * s;
  c.drawImage(im, X + (w - dw) / 2, Y + (h - dh) / 2, dw, dh);
}
function clipR(c, X, Y, w, h, r, fn) { c.save(); rr(0, c, X, Y, w, h, r); c.clip(); fn(); c.restore(); }
function txt(c, s, x, y, o) {
  o = o || {}; c.save(); c.direction = 'rtl'; c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'alphabetic';
  let size = o.size || 40; const font = sz => `${o.w || 500} ${sz}px ${o.f || FB}`; c.font = font(size);
  if (o.max) while (c.measureText(s).width > o.max && size > 18) { size -= 2; c.font = font(size); }
  c.fillStyle = o.c || '#000'; c.fillText(s, x, y); c.restore(); return size;
}
function bg(c, t) {
  c.fillStyle = t.bg; c.fillRect(0, 0, W, H); c.fillStyle = t.dot;
  for (let y = 18; y < H; y += 36) for (let x = 18; x < W; x += 36) { c.beginPath(); c.arc(x, y, 2.4, 0, 7); c.fill(); }
}
function lens(c, t, cx, cy, R) {
  c.save(); c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fillStyle = t.surf; c.fill(); c.lineWidth = R * .07; c.strokeStyle = t.sh; c.stroke();
  c.beginPath(); c.arc(cx, cy, R * .8, 0, 7); c.fillStyle = '#1A1C24'; c.fill();
  c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2; c.lineTo(cx + Math.cos(a) * R * .45, cy + Math.sin(a) * R * .45); } c.closePath(); c.fillStyle = ACC; c.fill(); c.lineWidth = R * .04; c.strokeStyle = '#1A1C24'; c.stroke();
  c.beginPath(); c.arc(cx + R * .24, cy - R * .28, R * .08, 0, 7); c.fillStyle = 'rgba(255,255,255,.85)'; c.fill(); c.restore();
}
function head(c, t, d, y) {
  lens(c, t, W - 120, y, 42);
  txt(c, 'قعدة تصوير', W - 185, y + 16, { align: 'right', f: FD, w: 700, size: 52, c: t.ink });
  const g = [d.group.type, d.group.name].filter(Boolean).join(' · ');
  if (g) txt(c, g, 80, y + 14, { align: 'left', size: 34, c: t.ink2, max: 440 });
}
function foot(c, t) {
  c.fillStyle = t.sh; c.fillRect(0, H - 120, W, 6);
  c.save(); c.font = `700 36px ${FB}`; const a = 'صار بدها قعدة.', b = '@eyad.hloubi  ·  ', wa = c.measureText(a).width, wb = c.measureText(b).width; c.restore();
  const x0 = W / 2 + (wa + wb) / 2;
  txt(c, a, x0, H - 50, { align: 'right', size: 36, w: 700, c: t.ink });
  c.save(); c.direction = 'ltr'; c.textAlign = 'right'; c.font = `700 36px ${FB}`; c.fillStyle = t.ink2; c.fillText(b, x0 - wa, H - 50); c.restore();
}
async function avatarImg(c, t, p, X, Y, s, r) {
  const im = await img(p && p.photo);
  clipR(c, X, Y, s, s, r, () => {
    c.fillStyle = (p && p.color) || '#FFD166'; c.fillRect(X, Y, s, s);
    if (im) cover(c, im, X, Y, s, s); else txt(c, (p && p.name ? p.name.trim()[0] : '؟') || '؟', X + s / 2, Y + s * .66, { f: FD, w: 700, size: s * .45, c: '#1A1C24' });
  });
  rr(0, c, X, Y, s, s, r); c.lineWidth = Math.max(4, s * .03); c.strokeStyle = t.sh; c.stroke();
}
// الصورة الكبيرة: صورة الشخص، أو للفريق صورة الشلة أو فسيفساء الأعضاء
async function hero(c, t, d, X, Y, w, h, r) {
  if (d.team) {
    const gp = await img(d.group.photo);
    if (gp) { clipR(c, X, Y, w, h, r, () => cover(c, gp, X, Y, w, h)); }
    else {
      clipR(c, X, Y, w, h, r, () => { c.fillStyle = d.team.color; c.fillRect(X, Y, w, h); });
      const m = d.team.members.slice(0, 9), n = m.length, cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
      const s = Math.min((w - 60) / cols, (h - 60) / rows) - 20;
      for (let i = 0; i < n; i++) { const cx = i % cols, cy = Math.floor(i / cols); const tw = cols * (s + 20) - 20, th = rows * (s + 20) - 20; await avatarImg(c, t, m[i], X + (w - tw) / 2 + cx * (s + 20), Y + (h - th) / 2 + cy * (s + 20), s, s * .3); }
    }
  } else {
    const im = await img(d.me.photo);
    clipR(c, X, Y, w, h, r, () => { c.fillStyle = d.me.color || '#FFD166'; c.fillRect(X, Y, w, h); if (im) cover(c, im, X, Y, w, h); else { lens(c, t, X + w / 2, Y + h / 2, Math.min(w, h) * .28); } });
  }
  rr(0, c, X, Y, w, h, r); c.lineWidth = 7; c.strokeStyle = t.sh; c.stroke();
}
// صورة الشلة: بولاريد صغيرة لازقة عالصورة
async function groupInset(c, t, d, x, y, w, rot) {
  if (d.team) return; const gp = await img(d.group.photo); if (!gp) return;
  const h = w * .75, cap = d.group.name || d.group.type || 'الشلة';
  c.save(); c.translate(x, y); c.rotate(rot);
  box(c, t, -w / 2 - 16, -h / 2 - 16, w + 32, h + 82, 8, '#FFFFFF', 8);
  clipR(c, -w / 2, -h / 2, w, h, 4, () => cover(c, gp, -w / 2, -h / 2, w, h));
  txt(c, cap, 0, h / 2 + 48, { f: FD, w: 700, size: 34, c: '#1A1C24', max: w });
  c.fillStyle = 'rgba(255,209,102,.9)'; c.fillRect(-60, -h / 2 - 36, 120, 40); c.lineWidth = 3; c.strokeStyle = t.sh; c.strokeRect(-60, -h / 2 - 36, 120, 40);
  c.restore();
}
function badge(c, t, s, x, y, size, fill, col) {
  c.save(); c.font = `700 ${size}px ${FB}`; c.direction = 'rtl'; const w = c.measureText(s).width + size * 1.1, h = size * 1.7;
  box(c, t, x - w / 2, y - h / 2, w, h, size * .45, fill || ACC, 6); c.restore();
  txt(c, s, x, y + size * .36, { w: 700, size, c: col || '#1A1C24' });
}
function topList(c, t, d, X, Y, w, rowH, n) {
  const list = d.top.slice(0, n);
  box(c, t, X, Y, w, list.length * rowH + 30, 26);
  list.forEach((e, i) => {
    const y = Y + 15 + i * rowH;
    if (e.mine) { rr(0, c, X + 14, y + 4, w - 28, rowH - 8, 16); c.fillStyle = 'rgba(255,138,92,.22)'; c.fill(); }
    if (i) { c.fillStyle = t.line; c.fillRect(X + 30, y, w - 60, 3); }
    txt(c, String(e.rank), X + w - 50, y + rowH * .64, { w: 700, size: 38, c: t.ink });
    c.fillStyle = e.color || '#ccc'; rr(0, c, X + w - 120, y + rowH / 2 - 20, 40, 40, 11); c.fill(); c.lineWidth = 4; c.strokeStyle = t.sh; c.stroke();
    txt(c, e.name, X + w - 145, y + rowH * .64, { align: 'right', w: 500, size: 36, c: t.ink, max: w - 330 });
    txt(c, e.pts + ' نقطة', X + 40, y + rowH * .64, { align: 'left', w: 700, size: 32, c: t.ink2 });
  });
}

// ---------- ستوري الترتيب ----------
async function rankStory(c, t, lay, d) {
  bg(c, t); head(c, t, d, 120);
  const who = d.team ? d.team.name : d.me.name;
  const rk = `المركز ${d.rank} من ${d.total} · ${d.pts} نقطة`;
  if (lay === 'cover') {
    box(c, t, 80, 220, W - 160, 940, 40, t.surf, 12);
    await hero(c, t, d, 110, 250, W - 220, 880, 30);
    await groupInset(c, t, d, 250, 930, 290, -.07);
    badge(c, t, d.title, W / 2, 1160, 48);
    txt(c, who, W / 2, 1318, { f: FD, w: 700, size: 92, c: t.ink, max: W - 160 });
    if (d.team) txt(c, 'أنا: ' + d.me.name, W / 2, 1380, { size: 34, c: t.ink2, max: W - 200 });
    txt(c, rk, W / 2, d.team ? 1440 : 1396, { size: 38, w: 500, c: t.ink2 });
    topList(c, t, d, 140, d.team ? 1480 : 1450, W - 280, 82, 3);
  } else if (lay === 'pola') {
    c.save(); c.translate(W / 2, 760); c.rotate(-.045);
    box(c, t, -400, -500, 800, 1000, 10, '#FFFFFF', 14);
    await hero(c, t, d, -360, -460, 720, 760, 6);
    txt(c, who, 0, 395, { f: FD, w: 700, size: 76, c: '#1A1C24', max: 700 });
    if (d.team) txt(c, 'أنا: ' + d.me.name, 0, 450, { size: 32, c: '#6A6C75', max: 640 });
    c.restore();
    await groupInset(c, t, d, 215, 360, 270, -.13);
    // شريط لاصق
    c.save(); c.translate(W / 2 + 20, 268); c.rotate(.06); c.fillStyle = 'rgba(255,138,92,.85)'; c.fillRect(-120, -30, 240, 60); c.lineWidth = 4; c.strokeStyle = t.sh; c.strokeRect(-120, -30, 240, 60); c.restore();
    // ختم المركز
    c.save(); c.translate(W - 210, 1240); c.rotate(.12);
    c.beginPath(); c.arc(0, 0, 118, 0, 7); c.fillStyle = ACC; c.fill(); c.lineWidth = 7; c.strokeStyle = t.sh; c.stroke();
    c.beginPath(); c.arc(0, 0, 98, 0, 7); c.setLineDash([10, 9]); c.lineWidth = 4; c.stroke(); c.setLineDash([]);
    txt(c, 'المركز', 0, -28, { size: 30, w: 700, c: '#1A1C24' }); txt(c, String(d.rank), 0, 62, { f: FD, size: 96, w: 700, c: '#1A1C24' });
    c.restore();
    badge(c, t, d.title, 360, 1290, 46);
    txt(c, `${d.pts} نقطة · من ${d.total}`, 360, 1395, { size: 36, w: 500, c: t.ink2 });
    topList(c, t, d, 140, 1450, W - 280, 82, 3);
  } else { // كرت
    box(c, t, 90, 230, W - 180, 1520, 44, t.surf, 14);
    c.fillStyle = ACC; rr(0, c, 90, 230, W - 180, 330, 44); c.fill(); c.fillRect(90, 460, W - 180, 100);
    c.lineWidth = 6; c.strokeStyle = t.sh; rr(0, c, 90, 230, W - 180, 1520, 44); c.stroke(); c.fillStyle = t.sh; c.fillRect(90, 557, W - 180, 6);
    txt(c, d.title, W / 2, 330, { f: FD, w: 700, size: 64, c: '#1A1C24', max: 760 });
    txt(c, d.team ? 'الفريق' : 'اللاعب', W / 2, 395, { size: 32, w: 500, c: '#1A1C24' });
    // صورة دائرية كبيرة
    const S_ = 520, X = (W - S_) / 2, Y = 430;
    c.save(); c.beginPath(); c.arc(W / 2, Y + S_ / 2, S_ / 2 + 10, 0, 7); c.fillStyle = t.sh; c.fill(); c.restore();
    c.save(); c.beginPath(); c.arc(W / 2, Y + S_ / 2, S_ / 2, 0, 7); c.clip(); await hero(c, t, d, X, Y, S_, S_, 0); c.restore();
    await groupInset(c, t, d, 870, 830, 230, .09);
    txt(c, who, W / 2, 1060, { f: FD, w: 700, size: 86, c: t.ink, max: W - 260 });
    if (d.team) txt(c, 'أنا: ' + d.me.name, W / 2, 1115, { size: 32, c: t.ink2, max: W - 300 });
    // أرقام
    const cy = 1150;
    [[String(d.rank), 'المركز'], [String(d.pts), 'نقطة'], [String(d.count), 'ألعاب']].forEach((v, i) => {
      const x = 200 + i * 340, w = 280; box(c, t, x - w / 2 + 0, cy, w, 170, 26, t.bg, 6);
      txt(c, v[0], x, cy + 100, { f: FD, w: 700, size: 76, c: t.ink }); txt(c, v[1], x, cy + 148, { size: 30, c: t.ink2 });
    });
    topList(c, t, d, 150, 1380, W - 300, 76, 4);
  }
  foot(c, t);
}

// ---------- ألبوم قعدتي ----------
async function albumStory(c, t, lay, d) {
  bg(c, t); head(c, t, d, 120);
  await avatarImg(c, t, d.me, W - 190, 205, 110, 32);
  txt(c, 'ألبوم ' + d.me.name, W - 220, 265, { align: 'right', f: FD, w: 700, size: 56, c: t.ink, max: 620 });
  txt(c, `${d.title} · ${d.pts} نقطة`, W - 220, 315, { align: 'right', size: 32, c: t.ink2, max: 620 });
  const A = d.group.photo ? [{ img: d.group.photo, game: d.group.name || 'صورة القعدة', l: d.group.type || '📸 سوا' }].concat(d.album) : d.album;
  if (!A.length) {
    box(c, t, 140, 600, W - 280, 600, 40);
    lens(c, t, W / 2, 820, 120);
    txt(c, 'ما في لقطات بهالدورة', W / 2, 1060, { f: FD, w: 700, size: 54, c: t.ink });
    txt(c, 'العب مع الكاميرا لتتعبّى الألبوم', W / 2, 1120, { size: 34, c: t.ink2 });
    return foot(c, t);
  }
  const ims = await Promise.all(A.map(a => img(a.img)));
  if (lay === 'cover') { // شبكة
    const n = Math.min(A.length, 10), cols = 2, rows = Math.ceil(n / cols), top = 380, bot = H - 160;
    const gap = 30, cw = (W - 160 - gap) / cols, ch = Math.min(cw * 1.2, (bot - top - gap * (rows - 1)) / rows);
    const lab = Math.min(70, ch * .22);
    for (let i = 0; i < n; i++) {
      const x = 80 + (cols - 1 - i % cols) * (cw + gap), y = top + Math.floor(i / cols) * (ch + gap);
      box(c, t, x, y, cw, ch, 24, t.surf, 7);
      clipR(c, x + 12, y + 12, cw - 24, ch - lab - 18, 16, () => { c.fillStyle = t.cam; c.fillRect(x, y, cw, ch); if (ims[i]) cover(c, ims[i], x + 12, y + 12, cw - 24, ch - lab - 18); });
      txt(c, A[i].game, x + cw - 24, y + ch - lab * .42, { align: 'right', w: 700, size: Math.min(30, lab * .5), c: t.ink, max: cw * .5 });
      txt(c, A[i].l, x + 24, y + ch - lab * .42, { align: 'left', size: Math.min(26, lab * .42), c: t.ink2, max: cw * .44 });
    }
  } else if (lay === 'pola') { // بولارويد مبعترة
    const n = Math.min(A.length, 6), spots = [[300, 640, -.08], [780, 600, .07], [290, 1080, .05], [790, 1060, -.06], [330, 1500, -.04], [770, 1490, .08]];
    for (let i = 0; i < n; i++) {
      const [x, y, rot] = spots[i]; c.save(); c.translate(x, y); c.rotate(rot);
      box(c, t, -210, -230, 420, 470, 8, '#FFFFFF', 9);
      clipR(c, -186, -206, 372, 352, 4, () => { c.fillStyle = '#22252E'; c.fillRect(-186, -206, 372, 352); if (ims[i]) cover(c, ims[i], -186, -206, 372, 352); });
      txt(c, A[i].game, 0, 190, { f: FD, w: 700, size: 34, c: '#1A1C24', max: 360 });
      txt(c, A[i].l, 0, 226, { size: 22, c: '#6A6C75', max: 360 });
      c.restore();
    }
    if (A.length > 6) badge(c, t, `+${A.length - 6} لقطات`, W / 2, H - 200, 34);
  } else { // شريط فيلم
    const n = Math.min(A.length, 5), top = 380, fw = 640, fx = (W - fw) / 2, fh = H - 170 - top;
    c.fillStyle = '#1A1C24'; rr(0, c, fx, top, fw, fh, 20); c.fill(); c.lineWidth = 6; c.strokeStyle = t.sh; c.stroke();
    for (let y = top + 24; y < top + fh - 30; y += 52) { c.fillStyle = t.bg; rr(0, c, fx + 18, y, 30, 26, 6); c.fill(); rr(0, c, fx + fw - 48, y, 30, 26, 6); c.fill(); }
    const fr = (fh - 40) / n;
    for (let i = 0; i < n; i++) {
      const y = top + 20 + i * fr, iw = fw - 140, ih = fr - 70;
      clipR(c, fx + 70, y + 8, iw, ih, 8, () => { c.fillStyle = '#22252E'; c.fillRect(fx + 70, y, iw, ih + 8); if (ims[i]) cover(c, ims[i], fx + 70, y + 8, iw, ih); });
      txt(c, `${A[i].game} · ${A[i].l}`, W / 2, y + ih + 50, { size: 28, w: 500, c: '#EEEBE3', max: iw });
    }
    if (A.length > 5) badge(c, t, `+${A.length - 5}`, fx + fw + 70, top + fh - 60, 32);
  }
  foot(c, t);
}

async function render(kind, lay, th, d) {
  await fonts();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const t = TH[th] || TH.light;
  if (kind === 'album') await albumStory(c, t, lay, d); else await rankStory(c, t, lay, d);
  return cv.toDataURL('image/png');
}
window.Story = { render };
})();
