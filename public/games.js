/* قعدة تصوير — الكاميرا والألعاب العشرة
   كل اللاعبين بيلعبوا نفس التحدي بنفس الـseed، والكشف كله عالموبايل نفسه (ما في صور بتطلع لبرا). */
(function () {
'use strict';

// ---------- أدوات ----------
function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => (Math.round(n * 10) / 10).toString();

// ---------- الكاميرا والكشف ----------
const VISION_URL = new URL('vendor/tasks-vision', location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '')).href;
const MODEL_URLS = [new URL('model/face_landmarker.task', location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '')).href, 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'];

const Cam = {
  stream: null, facing: null, video: null, landmarker: null, loading: null, ok: false, err: null,
  async ensureModel() {
    if (this.landmarker) return this.landmarker;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const vision = await import(VISION_URL + '/vision_bundle.mjs');
      const fs = await vision.FilesetResolver.forVisionTasks(VISION_URL + '/wasm');
      let buf = null;
      for (const u of MODEL_URLS) { try { const r = await fetch(u); if (r.ok) { buf = new Uint8Array(await r.arrayBuffer()); break; } } catch (_) {} }
      if (!buf) throw new Error('nomodel');
      const opts = d => ({ baseOptions: { modelAssetBuffer: buf, delegate: d }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true });
      try { this.landmarker = await vision.FaceLandmarker.createFromOptions(fs, opts('GPU')); }
      catch (e) { this.landmarker = await vision.FaceLandmarker.createFromOptions(fs, opts('CPU')); }
      return this.landmarker;
    })();
    try { return await this.loading; } catch (e) { this.loading = null; throw e; }
  },
  async open(facing) {
    facing = facing || 'user';
    if (this.stream && this.facing === facing) return this.stream;
    this.close();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nocam');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } } });
    this.facing = facing;
    return this.stream;
  },
  close() { if (this.stream) this.stream.getTracks().forEach(t => t.stop()); this.stream = null; this.facing = null; },
  attach(video) {
    video.srcObject = this.stream; video.muted = true; video.playsInline = true; video.setAttribute('playsinline', '');
    video.classList.toggle('mirror', this.facing === 'user');
    return video.play().catch(() => {});
  },
  lastT: 0,
  detect(video) {
    if (!this.landmarker || !video.videoWidth) return null;
    let t = performance.now(); if (t <= this.lastT) t = this.lastT + 1; this.lastT = t;
    let res; try { res = this.landmarker.detectForVideo(video, t); } catch (e) { return null; }
    if (!res || !res.faceLandmarks || !res.faceLandmarks.length) return null;
    const bs = {};
    if (res.faceBlendshapes && res.faceBlendshapes[0]) res.faceBlendshapes[0].categories.forEach(c => (bs[c.categoryName] = c.score));
    const lm = res.faceLandmarks[0];
    let minx = 1, maxx = 0, miny = 1, maxy = 0;
    for (const p of lm) { if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y; }
    // بالإحداثيات المعكوسة (متل ما الشخص شايف حالو)
    const mx = x => 1 - x;
    const box = { x: mx(maxx), y: miny, w: maxx - minx, h: maxy - miny };
    const nose = { x: mx(lm[1].x), y: lm[1].y };
    const a = lm[33], b = lm[263];
    const roll = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; // ميلان الراس
    return { bs, lm, box, nose, roll };
  },
  snapshot(video, w) {
    w = w || 360;
    if (!video || !video.videoWidth) return null;
    const h = Math.round(w * video.videoHeight / video.videoWidth);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (this.facing === 'user') { x.translate(w, 0); x.scale(-1, 1); }
    x.drawImage(video, 0, 0, w, h);
    return c.toDataURL('image/jpeg', .82);
  }
};

// ---------- معايرة بسيطة ----------
function Base() { this.n = 0; this.sum = {}; }
Base.prototype.add = function (bs) { this.n++; for (const k in bs) this.sum[k] = (this.sum[k] || 0) + bs[k]; };
Base.prototype.get = function (k) { return this.n ? this.sum[k] / this.n : 0; };

// ---------- الإيموجيات ----------
const EMOJI = [
  { e: '😮', n: 'مستغرب', p: { jawOpen: .6, mouthFunnel: .25 } },
  { e: '😁', n: 'مبسوط', p: { mouthSmileLeft: .7, mouthSmileRight: .7 } },
  { e: '😠', n: 'معصّب', p: { browDownLeft: .5, browDownRight: .5 }, low: { mouthSmileLeft: .3, mouthSmileRight: .3 } },
  { e: '😗', n: 'بوسة', p: { mouthPucker: .75 } },
  { e: '😲', n: 'مصدوم', p: { jawOpen: .5, browInnerUp: .5 } },
  { e: '😑', n: 'زهقان', p: { eyeBlinkLeft: .7, eyeBlinkRight: .7 }, low: { jawOpen: .2 } },
  { e: '🙁', n: 'زعلان', p: { mouthFrownLeft: .4, mouthFrownRight: .4 }, low: { mouthSmileLeft: .2, mouthSmileRight: .2 } },
  { e: '😉', n: 'غمزة', wink: true },
  { e: '😏', n: 'شايف حالو', side: true },
  { e: '🤨', n: 'شاكك', brow1: true }
];
function emojiMatch(t, bs) {
  const g = k => bs[k] || 0;
  if (t.wink) { const l = g('eyeBlinkLeft'), r = g('eyeBlinkRight'); return clamp(Math.max(l - r, r - l) / .6, 0, 1); }
  if (t.side) { const l = g('mouthSmileLeft'), r = g('mouthSmileRight'); return clamp((Math.abs(l - r) - .05) / .35, 0, 1); }
  if (t.brow1) { const l = g('browOuterUpLeft'), r = g('browOuterUpRight'); const d = Math.max(g('browDownLeft'), g('browDownRight')); return clamp((Math.abs(l - r) + d * .5 - .05) / .4, 0, 1); }
  let s = 0, n = 0;
  for (const k in t.p) { s += clamp(g(k) / t.p[k], 0, 1); n++; }
  let v = s / n;
  if (t.low) for (const k in t.low) if (g(k) > t.low[k]) v *= .6;
  return v;
}

// ---------- النكت (لا تضحك) ----------
const JOKES = [
  'واحد حلبي اشترى ساعة ذكية… صارت تقلّو «قوم امشي» وهو عم ياكل كبة.',
  'سألوا الكسلان: شو هوايتك؟ قال: الصبر.',
  'مرة نملة دخلت بالعرس… صاروا يقولولها «نوّرتي» وهي ما بتنشاف.',
  'واحد نام بالمكتبة… صحي لقى حالو مترجم لـ3 لغات.',
  'الشاي قال للبسكوت: شو بك متضايق؟ قلّو: كل يوم حدا بيغطّسني.',
  'سألوا السمكة: ليش ما بتحكي؟ قالت: تمّي مليان مي.',
  'واحد اشترى سيارة كهربا… صار يتصل بشركة الكهربا ليعرف إمتى بيمشي.',
  'قال: بدي اعمل رجيم… بس من بكرا، بكرا الصبح، بعد الغدا يعني.',
  'البطيخة قالت للخيارة: بحبّك. قالتلها الخيارة: إنتِ قلبك أحمر، أنا قلبي بارد.',
  'الواي فاي فصل… والعيلة اكتشفت إنو عندهن جار من عشر سنين.',
  'سألوا الكهربا: وين كنتي؟ قالت: طالعة شوي.',
  'واحد حب يعمل مفاجأة لمرتو… سكّر الموبايل ساعة. اتصلت بالشرطة.',
  'مرة بندورة وقعت عن الطاولة… قالتلها رفيقتها: صرتي صلصة يا عمري.',
  'المعلم سأل: شو بيطلع من البقرة؟ قال الطالب: الواجب، لأنو أكلتو البقرة.',
  'الخسة لبست نضارة… صارت «سلطة» بتشوف.'
];
const FUNNY = ['🤡', '🙃', '🐸', '🦆', '🥸', '🤪', '🐔', '🙈', '🫠', '🥴'];

// ---------- الألوان (صيّاد الألوان) ----------
const COLORS = [
  { n: 'أحمر', c: [214, 48, 49] }, { n: 'أزرق', c: [41, 98, 201] }, { n: 'أخضر', c: [46, 158, 84] }, { n: 'أصفر', c: [240, 196, 40] },
  { n: 'برتقالي', c: [240, 128, 40] }, { n: 'بنفسجي', c: [125, 72, 180] }, { n: 'زهري', c: [232, 104, 160] }, { n: 'بني', c: [128, 82, 48] },
  { n: 'سماوي', c: [70, 180, 220] }, { n: 'أسود', c: [30, 30, 32] }, { n: 'أبيض', c: [236, 236, 232] }, { n: 'رمادي', c: [128, 128, 128] }
];
function toLab(rgb) {
  let [r, g, b] = rgb.map(v => { v /= 255; return v > .04045 ? Math.pow((v + .055) / 1.055, 2.4) : v / 12.92; });
  let x = (r * .4124 + g * .3576 + b * .1805) / .95047, y = r * .2126 + g * .7152 + b * .0722, z = (r * .0193 + g * .1192 + b * .9505) / 1.08883;
  const f = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function colorScore(a, b) { const A = toLab(a), B = toLab(b); const d = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); return clamp(100 - d * 1.5, 0, 100); }

// ---------- تعريف الألعاب ----------
const ic = {
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  blind: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 22 12s-1.2 2-3.4 3.8M6.2 7.3C3.6 9 2 12 2 12s3.5 6 10 6c1.4 0 2.7-.3 3.8-.7"/>',
  frame: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="2.5"/>',
  wink: '<path d="M4 10q3-3 6 0"/><circle cx="16" cy="9.5" r="2"/><path d="M7 15q5 4 10 0"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14q4 4 8 0M9 9h.01M15 9h.01"/>',
  emoji: '<circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01"/><ellipse cx="12" cy="15.5" rx="2.2" ry="1.6"/>',
  statue: '<circle cx="12" cy="6" r="3"/><path d="M8 21v-6l-2-4h12l-2 4v6M9 21h6"/>',
  brows: '<path d="M4 8q3-3 6-1M14 7q3-2 6 1"/><circle cx="8" cy="13" r="1.5"/><circle cx="16" cy="13" r="1.5"/>',
  head: '<circle cx="12" cy="9" r="5"/><path d="M5 20l3-4M19 20l-3-4M12 14v2"/><path d="M8 4l-2-2M16 4l2-2"/>'
};
const GAMES = {
  blink: { name: 'لا ترمش', icon: ic.eye, short: 'آخر واحد بيضل فاتح عيونه بيربح', unit: 'ثانية',
    how: 'حدّق بالكاميرا وما ترمش. أول رمشة أو إذا طلع وجّك من الكادر بتطلع. أطول وقت بيربح.', max: 60, facing: 'user' },
  color: { name: 'صيّاد الألوان', icon: ic.drop, short: 'لاقي اللون وصوّره بأسرع وقت', unit: '%',
    how: 'الكاميرا الخلفية بتنفتح. بيطلعلك 3 ألوان، دوّر عليهن حولك وحط الدائرة على اللون واكبس «صوّر». كل ما قرّبت أكتر نقاطك أعلى.', facing: 'environment' },
  blind: { name: 'التصوير الأعمى', icon: ic.blind, short: 'صوّر حالك بالمكان الصح… بلا ما تشوف', unit: '%',
    how: 'الشاشة بتسوَد. بيطلعلك رسم وين لازم يكون وجّك وقدّيش كبير. حرّك الموبايل بلا ما تشوف واكبس «صوّر». 3 لقطات.', facing: 'user' },
  frame: { name: 'ثبّت الإطار', icon: ic.frame, short: 'خلّي أنفك جوّا المربع اللي عم يتحرك', unit: '%',
    how: 'في مربع عم يتحرك عالشاشة. حرّك راسك لتضل نقطة أنفك جوّاه. كل ما ضليت جوّاه أكتر بتربح.', facing: 'user' },
  wink: { name: 'غمزات', icon: ic.wink, short: 'غمّز بالعين الصح… وبسرعة', unit: 'غمزة',
    how: 'بيطلعلك «يمين» أو «شمال». غمّز بعينك اليمين أو الشمال قبل ما يخلص الوقت. الأوامر بتسرع، وأول غلطة بتطلّعك.', facing: 'user' },
  smile: { name: 'لا تضحك', icon: ic.smile, short: 'نكت وصور مضحكة… وممنوع تبتسم', unit: 'ثانية',
    how: 'رح تطلعلك نكت وأشكال مضحكة. الكاميرا عم تراقب تمّك، أول ابتسامة بتطلّعك. اللي بيصمد أكتر بيربح.', max: 30, facing: 'user' },
  emoji: { name: 'قلّد الإيموجي', icon: ic.emoji, short: 'اعمل نفس تعبير الإيموجي', unit: '%',
    how: 'بيطلع إيموجي ورا إيموجي. قلّد تعبيره بوجّك قبل ما يتغيّر، والكاميرا بتعطيك نسبة تطابق.', facing: 'user' },
  statue: { name: 'تمثال', icon: ic.statue, short: 'تجمّد… أي حركة بتنحسب عليك', unit: '%',
    how: 'لما تبلّش، تجمّد قدّام الكاميرا. ولا حركة، ولا ضحكة، ولا رمشة كبيرة. أثبت واحد بيربح.', facing: 'user' },
  brows: { name: 'حواجب طايرة', icon: ic.brows, short: 'كم مرة بترفع حواجبك بالوقت؟', unit: 'مرة',
    how: 'ارفع حواجبك ونزّلهن بأسرع ما فيك. الكاميرا بتعدّ كل رفعة كاملة.', facing: 'user' },
  head: { name: 'راسك هو الجويستيك', icon: ic.head, short: 'ميّل راسك لتلم النجوم وتهرب من الحجار', unit: 'نجمة',
    how: 'ميّل راسك يمين وشمال لتحرّك الطابة. لمّ النجوم ⭐ وابعد عن الحجار، كل حجرة بتاكل نجمة.', facing: 'user' }
};
const ORDER = ['blink', 'color', 'blind', 'frame', 'wink', 'smile', 'emoji', 'statue', 'brows', 'head'];

// مدة كل لعبة حسب الـseed
function duration(id, seed) {
  const r = rng(seed);
  switch (id) {
    case 'blink': return 60; case 'smile': return 30; case 'color': return 33; case 'blind': return 36;
    case 'frame': return 18 + Math.floor(r() * 5); case 'wink': return 45; case 'emoji': return 6 * 3.6 + 1;
    case 'statue': return 12 + Math.floor(r() * 6); case 'brows': return 8 + Math.floor(r() * 5); case 'head': return 25;
  }
  return 30;
}

// ---------- مشغّل الجولة ----------
// opts: {id, seed, startAt(local ms), g (m/f), stage(element), sim(bool), onDone(score,label,snap)}
function play(opts) {
  const G = GAMES[opts.id], r = rng(opts.seed), fem = opts.g === 'f';
  const st = opts.stage;
  st.innerHTML = `
    <div class="cam" id="gcam"><video id="gv" autoplay muted playsinline></video><canvas id="gc"></canvas>
      <i class="c c1"></i><i class="c c2"></i><i class="c c3"></i><i class="c c4"></i>
      <span class="live"><i></i><b id="glive">عم يراقب</b></span>
      <div class="gfx" id="gfx"></div>
      <div class="cd" id="gcd"></div>
      <span class="status" id="gst"></span>
    </div>
    <div class="ghud" id="ghud"></div>
    <div class="tm"><b class="n" id="gtm">0</b><span id="gtl">ثانية</span><div class="tmbar"><b id="gbar"></b></div></div>
    <div id="gact"></div>`;
  const video = st.querySelector('#gv'), cv = st.querySelector('#gc'), ctx = cv.getContext('2d');
  const $ = s => st.querySelector(s);
  const status = (t, kind) => { const e = $('#gst'); e.textContent = t || ''; e.className = 'status' + (kind ? ' ' + kind : ''); e.style.display = t ? '' : 'none'; };
  const hud = h => ($('#ghud').innerHTML = h || '');
  const fx = (h, ms) => { const e = $('#gfx'); e.innerHTML = h; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); clearTimeout(fx.t); fx.t = setTimeout(() => e.classList.remove('on'), ms || 1400); };
  let done = false, raf = 0, base = new Base(), lastFace = 0, snap = null;
  const dur = duration(opts.id, opts.seed);
  const W = () => cv.width, H = () => cv.height;
  function sizeCanvas() { const b = $('#gcam').getBoundingClientRect(); const d = Math.min(2, window.devicePixelRatio || 1); cv.width = b.width * d; cv.height = b.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); cv.cw = b.width; cv.ch = b.height; }
  // تحويل إحداثيات الفيديو (مقصوص بـ cover) لإحداثيات الكانفس
  function v2c(x, y) {
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480, cw = cv.cw, ch = cv.ch;
    const s = Math.max(cw / vw, ch / vh), dw = vw * s, dh = vh * s;
    return [x * dw - (dw - cw) / 2, y * dh - (dh - ch) / 2];
  }
  function c2v(px, py) {
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480, cw = cv.cw, ch = cv.ch;
    const s = Math.max(cw / vw, ch / vh), dw = vw * s, dh = vh * s;
    return [(px + (dw - cw) / 2) / dw, (py + (dh - ch) / 2) / dh];
  }
  function finish(score, label) {
    if (done) return; done = true; cancelAnimationFrame(raf);
    if (!snap && !opts.sim) snap = Cam.snapshot(video);
    status(''); $('#gtm').textContent = '✓';
    $('#gact').innerHTML = '';
    hud(`<div class="gdone"><b>${label}</b><span>${fem ? 'استني' : 'استنى'} الباقي…</span></div>`);
    if (G.facing === 'environment' && !opts.sim) Cam.open('user').then(() => Cam.attach(video)).catch(() => {});
    opts.onDone(Math.round(score * 10) / 10, label, snap);
  }
  const api = { stop() { done = true; cancelAnimationFrame(raf); } };

  // ---- محاكاة (بلا كاميرا بالمعاينة) ----
  if (opts.sim) {
    $('#gcam').classList.add('nocam');
    status('ما في كاميرا هون — نتيجة تجريبية', 'warn');
    const tick = () => {
      if (done) return;
      const t = (Date.now() - opts.startAt) / 1000;
      if (t < 0) { $('#gcd').textContent = Math.ceil(-t); $('#gtm').textContent = '…'; raf = requestAnimationFrame(tick); return; }
      $('#gcd').textContent = '';
      const lim = Math.min(dur, 6), left = lim - t;
      $('#gtm').textContent = Math.max(0, Math.ceil(left)); $('#gbar').style.width = clamp(left / lim, 0, 1) * 100 + '%';
      if (left <= 0) { const s = simScore(opts.id, r); return finish(s, labelFor(opts.id, s, fem)); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return api;
  }

  const facing = G.facing;
  Cam.open(facing).then(() => Cam.attach(video)).then(() => { sizeCanvas(); start(); })
    .catch(() => { status('ما قدرنا نفتح الكاميرا', 'warn'); hud(`<div class="gdone"><b>الكاميرا مسكّرة</b><span>اسمح للكاميرا من إعدادات المتصفح</span></div>`); setTimeout(() => finish(0, 'بلا كاميرا'), 2500); });
  window.addEventListener('resize', sizeCanvas);

  // ---- منطق كل لعبة ----
  const S = {}; // حالة اللعبة
  function start() {
    const id = opts.id;
    if (id === 'blind') { $('#gcam').classList.add('dark'); }
    if (id === 'color') $('#glive').textContent = 'الكاميرا الخلفية';
    setup[id] && setup[id]();
    raf = requestAnimationFrame(loop);
  }
  let prevT = 0;
  function loop() {
    if (done) return;
    raf = requestAnimationFrame(loop);
    const now = Date.now(), t = (now - opts.startAt) / 1000, dt = prevT ? Math.min(.1, t - prevT) : 0; prevT = t;
    ctx.clearRect(0, 0, cv.cw, cv.ch);
    const face = facing === 'user' ? Cam.detect(video) : null;
    if (face) lastFace = now;
    if (t < 0) { // عد تنازلي + معايرة
      $('#gcd').textContent = Math.ceil(-t);
      $('#gtm').textContent = Math.ceil(dur); $('#gbar').style.width = '100%';
      if (face && -t < 2.2) base.add(face.bs);
      if (facing === 'user') status(face ? 'شايفك ✓' : 'قرّب وجّك من الكاميرا', face ? 'ok' : 'warn');
      pre[opts.id] && pre[opts.id](face, t);
      return;
    }
    if ($('#gcd').textContent) { $('#gcd').textContent = ''; flashBang(); }
    const left = dur - t;
    $('#gtm').textContent = Math.max(0, Math.ceil(left)); $('#gbar').style.width = clamp(left / dur, 0, 1) * 100 + '%';
    tick[opts.id](face, t, dt, now, left);
  }
  function flashBang() { const e = document.createElement('div'); e.className = 'bang'; $('#gcam').appendChild(e); setTimeout(() => e.remove(), 500); }
  const lost = now => now - lastFace > 1200;
  const thr = (k, add, min) => Math.max(min, base.get(k) + add);

  const pre = {
    blind(face) { status('جهّز حالك… الشاشة رح تسوَد', 'ok'); },
    color() { status('جهّز الكاميرا الخلفية', 'ok'); }
  };
  const setup = {
    blink() { S.events = Array.from({ length: 8 }, (_, i) => ({ at: 4 + i * 6 + r() * 4, e: FUNNY[Math.floor(r() * FUNNY.length)] })); S.closed = 0; },
    smile() { S.jokes = shuffle(JOKES, r); S.k = -1; S.on = 0; },
    brows() { S.n = 0; S.up = false; },
    wink() {
      S.seq = Array.from({ length: 40 }, () => r() < .5 ? 'R' : 'L'); S.i = 0; S.win = 2.4; S.cmdAt = 0; S.n = 0; S.hold = 0;
      $('#gact').innerHTML = '<div class="bigcmd" id="gcmd"></div>';
    },
    emoji() {
      S.list = shuffle(EMOJI, r).slice(0, 6); S.i = -1; S.best = []; S.per = 3.6;
      $('#gact').innerHTML = '<div class="emo"><span id="gemo"></span><div><b id="gemn"></b><div class="mbar"><b id="gemb"></b></div></div></div>';
    },
    statue() { S.motion = 0; S.prev = null; S.events = Array.from({ length: 4 }, (_, i) => ({ at: 2 + i * 3 + r() * 2, e: ['🦟 دبانة!', '📢 تحرّك!', '🤧 عطسة!', '😜 اضحك!', '🐝 نحلة!'][Math.floor(r() * 5)] })); },
    frame() {
      S.ph = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28]; S.sp = [.35 + r() * .25, .45 + r() * .3, .3 + r() * .2, .5 + r() * .3]; S.in = 0; S.tot = 0;
    },
    head() {
      S.x = .5; S.stars = 0; S.objs = []; S.next = 0; S.spawnR = rng(opts.seed + 7); S.hit = 0;
    },
    blind() {
      S.shots = []; S.k = 0;
      S.targets = Array.from({ length: 3 }, () => ({ x: .3 + r() * .4, y: .32 + r() * .36, w: .26 + r() * .2 }));
      $('#gact').innerHTML = '<button class="btn big shoot" id="gshoot">صوّر 📸</button>';
      $('#gshoot').onclick = () => { if (!S.reveal) S.want = true; };
    },
    color() {
      S.list = shuffle(COLORS, r).slice(0, 3); S.i = 0; S.best = [0, 0, 0]; S.per = 11; S.got = [null, null, null];
      $('#gact').innerHTML = '<div class="swatch"><span id="gsw"></span><div><small>دوّر على</small><b id="gswn"></b></div><span id="gmy" class="my"></span></div><button class="btn big shoot" id="gshoot">صوّر 📸</button>';
      $('#gshoot').onclick = () => (S.want = true);
    }
  };

  const tick = {
    blink(face, t, dt, now) {
      if (lost(now)) return lose('طلع وجّك من الكادر');
      const ev = S.events.find(e => !e.done && t >= e.at); if (ev) { ev.done = true; fx(`<span class="pop">${ev.e}</span>`, 1100); }
      if (face) {
        const th = thr('eyeBlinkLeft', .3, .5);
        const c = (face.bs.eyeBlinkLeft || 0) > th && (face.bs.eyeBlinkRight || 0) > thr('eyeBlinkRight', .3, .5);
        S.closed = c ? S.closed + 1 : 0;
        if (S.closed >= 2) return lose(fem ? 'رمشتي!' : 'رمشت!');
        status(fem ? 'عيونك فاتحة ✓' : 'عيونك فاتحة ✓', 'ok');
      }
      $('#gtl').textContent = 'ثانية باقية';
      hud(`<div class="score"><b class="n">${fmt(t)}</b><span>ثانية صامد${fem ? 'ة' : ''}</span></div>`);
      if (t >= G.max) finish(G.max, labelFor('blink', G.max, fem));
      function lose(why) { snap = Cam.snapshot(video); status(why, 'bad'); finish(t, labelFor('blink', t, fem)); }
    },
    smile(face, t, dt, now) {
      const k = Math.floor(t / 4.2);
      if (k !== S.k) { S.k = k; const j = S.jokes[k % S.jokes.length]; fx(`<div class="joke"><span>${FUNNY[k % FUNNY.length]}</span>${j}</div>`, 4100); }
      if (face) {
        const sm = ((face.bs.mouthSmileLeft || 0) + (face.bs.mouthSmileRight || 0)) / 2;
        const th = Math.max(.42, (base.get('mouthSmileLeft') + base.get('mouthSmileRight')) / 2 + .28);
        S.on = sm > th ? S.on + 1 : 0;
        if (S.on >= 3) { snap = Cam.snapshot(video); status(fem ? 'ضحكتي! 😂' : 'ضحكت! 😂', 'bad'); return finish(t, labelFor('smile', t, fem)); }
        status(sm > th * .7 ? 'انتبه… عم تبتسم!' : 'وجّك جامد ✓', sm > th * .7 ? 'warn' : 'ok');
      } else if (lost(now)) { status('رجّع وجّك', 'warn'); }
      if (now - lastFace > 3000) return finish(t * .5, 'هرب من الكاميرا 🙈');
      hud(`<div class="score"><b class="n">${fmt(t)}</b><span>ثانية بلا ضحك</span></div>`);
      if (t >= G.max) { snap = Cam.snapshot(video); finish(G.max, labelFor('smile', G.max, fem)); }
    },
    brows(face, t, dt, now, left) {
      if (face) {
        const v = Math.max(face.bs.browInnerUp || 0, ((face.bs.browOuterUpLeft || 0) + (face.bs.browOuterUpRight || 0)) / 2);
        const b0 = Math.max(base.get('browInnerUp'), (base.get('browOuterUpLeft') + base.get('browOuterUpRight')) / 2);
        const hi = Math.max(.4, b0 + .3), lo = Math.max(.22, b0 + .12);
        if (!S.up && v > hi) { S.up = true; S.n++; fx(`<span class="pop">+1</span>`, 500); if (S.n === 3) snap = Cam.snapshot(video); }
        else if (S.up && v < lo) S.up = false;
        status(S.up ? 'لفوق! ⬆' : 'ارفع!', 'ok');
      } else status('قرّب وجّك', 'warn');
      hud(`<div class="score"><b class="n">${S.n}</b><span>رفعة</span></div>`);
      if (left <= 0) finish(S.n, labelFor('brows', S.n, fem));
    },
    wink(face, t, dt, now) {
      if (!S.cmdAt) { S.cmdAt = t; showCmd(); }
      const el = t - S.cmdAt;
      if (face) {
        const L = face.bs.eyeBlinkLeft || 0, R = face.bs.eyeBlinkRight || 0;
        const hiL = thr('eyeBlinkLeft', .25, .45), hiR = thr('eyeBlinkRight', .25, .45);
        // مستخدم: «يمين» = عينه اليمين
        let w = null;
        if (R > hiR && L < hiL * .75 && R - L > .25) w = 'R'; else if (L > hiL && R < hiR * .75 && L - R > .25) w = 'L';
        S.hold = w ? (S.last === w ? S.hold + 1 : 1) : 0; S.last = w;
        if (S.hold >= 2 && !S.wait && el > .15) {
          if (w === S.seq[S.i]) { S.n++; S.i++; S.wait = true; fx(`<span class="pop">✓</span>`, 400); setTimeout(() => { S.wait = false; S.cmdAt = (Date.now() - opts.startAt) / 1000; S.win = Math.max(1.05, S.win * .93); showCmd(); }, 380); }
          else { snap = Cam.snapshot(video); status('العين الغلط! 🙈', 'bad'); return finish(S.n, labelFor('wink', S.n, fem)); }
        }
      }
      if (!S.wait && el > S.win) { snap = Cam.snapshot(video); status('خلص الوقت ⌛', 'bad'); return finish(S.n, labelFor('wink', S.n, fem)); }
      if (!S.wait) $('#gbar').style.width = clamp(1 - el / S.win, 0, 1) * 100 + '%';
      $('#gtm').textContent = S.n; $('#gtl').textContent = 'غمزة';
      if (S.n >= 30) finish(S.n, labelFor('wink', S.n, fem));
      function showCmd() { const c = S.seq[S.i]; const e = $('#gcmd'); if (e) e.innerHTML = c === 'R' ? 'يمين 👉' : '👈 شمال'; }
    },
    emoji(face, t) {
      const i = Math.floor(t / S.per);
      if (i >= S.list.length) { const s = S.best.reduce((a, b) => a + b, 0) / S.list.length * 100; return finish(s, labelFor('emoji', s, fem)); }
      if (i !== S.i) { S.i = i; S.best[i] = 0; $('#gemo').textContent = S.list[i].e; $('#gemn').textContent = S.list[i].n; fx(`<span class="pop">${S.list[i].e}</span>`, 900); }
      const inWin = t - i * S.per > .5;
      if (face && inWin) {
        const m = emojiMatch(S.list[i], face.bs);
        if (m > S.best[i]) { S.best[i] = m; if (m > .75 && !snap) snap = Cam.snapshot(video); }
        $('#gemb').style.width = Math.round(m * 100) + '%';
        status(`تطابق ${Math.round(S.best[i] * 100)}%`, S.best[i] > .7 ? 'ok' : '');
      } else if (!face) status('قرّب وجّك', 'warn');
      $('#gtm').textContent = `${i + 1}/${S.list.length}`; $('#gtl').textContent = 'إيموجي';
    },
    statue(face, t, dt, now, left) {
      const ev = S.events.find(e => !e.done && t >= e.at); if (ev) { ev.done = true; fx(`<span class="pop sm">${ev.e}</span>`, 1200); }
      if (face) {
        const cur = { x: face.nose.x, y: face.nose.y, w: face.box.w, s: (face.bs.mouthSmileLeft || 0) + (face.bs.jawOpen || 0) + (face.bs.browInnerUp || 0) };
        if (S.prev) { const d = Math.hypot(cur.x - S.prev.x, cur.y - S.prev.y) * 2.2 + Math.abs(cur.w - S.prev.w) * 3 + Math.abs(cur.s - S.prev.s) * .25; S.motion += Math.max(0, d - .0015); }
        S.prev = cur;
      } else if (lost(now)) S.motion += dt * .25;
      const sc = clamp(100 - S.motion * 220, 0, 100);
      status(sc > 85 ? 'ثابت ✓' : sc > 50 ? 'عم تتحرك!' : 'صرت ترقص 😅', sc > 85 ? 'ok' : sc > 50 ? 'warn' : 'bad');
      hud(`<div class="score"><b class="n">${Math.round(sc)}%</b><span>ثبات</span></div>`);
      if (left <= 0) { snap = Cam.snapshot(video); finish(sc, labelFor('statue', sc, fem)); }
    },
    frame(face, t, dt, now, left) {
      const bx = .5 + Math.sin(t * S.sp[0] + S.ph[0]) * .22 + Math.sin(t * S.sp[2] + S.ph[2]) * .08;
      const by = .5 + Math.sin(t * S.sp[1] + S.ph[1]) * .18 + Math.cos(t * S.sp[3] + S.ph[3]) * .06;
      const bw = .3, bh = .26;
      const [x0, y0] = v2c(bx - bw / 2, by - bh / 2), [x1, y1] = v2c(bx + bw / 2, by + bh / 2);
      let inside = false;
      if (face) {
        inside = Math.abs(face.nose.x - bx) < bw / 2 && Math.abs(face.nose.y - by) < bh / 2;
        const [nx, ny] = v2c(face.nose.x, face.nose.y);
        ctx.fillStyle = inside ? '#2A9D6F' : '#E5484D'; ctx.beginPath(); ctx.arc(nx, ny, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      }
      ctx.strokeStyle = inside ? '#2A9D6F' : '#FF8A5C'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
      S.tot += dt; if (inside) S.in += dt;
      const sc = S.tot ? S.in / S.tot * 100 : 0;
      status(inside ? 'جوّا ✓' : 'برا!', inside ? 'ok' : 'bad');
      hud(`<div class="score"><b class="n">${Math.round(sc)}%</b><span>جوّا الإطار</span></div>`);
      if (left <= 0) finish(sc, labelFor('frame', sc, fem));
    },
    head(face, t, dt, now, left) {
      const cw = cv.cw, ch = cv.ch;
      if (face) { const tgt = clamp(.5 - face.roll / 40, 0, 1); S.x += (tgt - S.x) * Math.min(1, dt * 10); }
      // توليد
      if (t >= S.next) { const sr = S.spawnR; S.objs.push({ x: .08 + sr() * .84, y: -.08, k: sr() < .55 ? 'star' : 'rock', v: .32 + sr() * .2 + t * .012 }); S.next = t + .55 - Math.min(.25, t * .01); }
      ctx.fillStyle = 'rgba(26,28,36,.35)'; ctx.fillRect(0, 0, cw, ch);
      const px = S.x * cw, py = ch * .84, R = 16;
      for (const o of S.objs) {
        o.y += o.v * dt; const ox = o.x * cw, oy = o.y * ch;
        if (!o.gone && Math.hypot(ox - px, oy - py) < R + 16) {
          o.gone = true;
          if (o.k === 'star') { S.stars++; fx('<span class="pop sm">⭐ +1</span>', 450); if (S.stars === 5) snap = Cam.snapshot(video); }
          else { S.stars = Math.max(0, S.stars - 1); S.hit = t; fx('<span class="pop sm">💥 −1</span>', 500); }
        }
        if (!o.gone) { ctx.font = '28px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.k === 'star' ? '⭐' : '🪨', ox, oy); }
      }
      S.objs = S.objs.filter(o => o.y < 1.1 && !o.gone);
      ctx.fillStyle = t - S.hit < .3 ? '#E5484D' : '#FF8A5C'; ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      status(face ? (Math.abs(face.roll) > 6 ? (face.roll > 0 ? '⬅ ميلان' : 'ميلان ➡') : 'ميّل راسك') : 'قرّب وجّك', face ? 'ok' : 'warn');
      hud(`<div class="score"><b class="n">${S.stars}</b><span>نجمة</span></div>`);
      if (left <= 0) finish(S.stars, labelFor('head', S.stars, fem));
    },
    blind(face, t, dt, now, left) {
      const tg = S.targets[S.k];
      const cw = cv.cw, ch = cv.ch;
      if (!S.reveal) {
        // رسم الهدف بالأسود
        const [x0, y0] = v2c(tg.x - tg.w / 2, tg.y - tg.w * .65), [x1, y1] = v2c(tg.x + tg.w / 2, tg.y + tg.w * .65);
        ctx.strokeStyle = '#FF8A5C'; ctx.lineWidth = 3; ctx.setLineDash([8, 7]);
        ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        status(`لقطة ${S.k + 1} من 3 — حط وجّك هون`, 'ok');
        if (S.want) {
          S.want = false;
          let acc = 0;
          if (face) {
            const fx_ = face.box.x + face.box.w / 2, fy = face.box.y + face.box.h / 2;
            const d = Math.hypot(fx_ - tg.x, (fy - tg.y) * .8), sd = Math.abs(face.box.w - tg.w);
            acc = clamp(100 - d * 220 - sd * 180, 0, 100);
          }
          const img = Cam.snapshot(video, 300);
          S.shots.push(acc); if (!snap || acc > (S.bestAcc || -1)) { snap = img; S.bestAcc = acc; }
          flashBang();
          S.reveal = { until: t + 1.6, acc, face: face ? { ...face.box } : null };
        }
      } else {
        // كشف اللقطة شوي
        $('#gcam').classList.remove('dark');
        const [x0, y0] = v2c(tg.x - tg.w / 2, tg.y - tg.w * .65), [x1, y1] = v2c(tg.x + tg.w / 2, tg.y + tg.w * .65);
        ctx.strokeStyle = '#FF8A5C'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, 7); ctx.stroke();
        status(`دقة ${Math.round(S.reveal.acc)}%`, S.reveal.acc > 60 ? 'ok' : 'warn');
        if (t > S.reveal.until) { S.reveal = null; S.k++; $('#gcam').classList.add('dark'); if (S.k >= 3) return end(); }
      }
      hud(`<div class="score"><b class="n">${S.shots.length}/3</b><span>لقطات</span></div>`);
      if (left <= 0) end();
      function end() { while (S.shots.length < 3) S.shots.push(0); const s = S.shots.reduce((a, b) => a + b, 0) / 3; $('#gcam').classList.remove('dark'); finish(s, labelFor('blind', s, fem)); }
    },
    color(face, t, dt, now, left) {
      const i = Math.min(2, Math.floor(t / S.per));
      if (S.i !== i) { S.i = i; }
      const tg = S.list[S.i];
      $('#gsw').style.background = `rgb(${tg.c})`; $('#gswn').textContent = tg.n;
      const cw = cv.cw, ch = cv.ch, rr = Math.min(cw, ch) * .12;
      ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(cw / 2, ch / 2, rr, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#1A1C24'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cw / 2, ch / 2, rr + 3, 0, 7); ctx.stroke();
      if (S.want) {
        S.want = false;
        const avg = sampleCenter(video, .12);
        if (avg) {
          const sc = colorScore(avg, tg.c);
          if (sc > S.best[S.i]) { S.best[S.i] = sc; S.got[S.i] = avg; if (!snap || S.i === 0) snap = Cam.snapshot(video); }
          $('#gmy').style.background = `rgb(${avg.map(Math.round)})`;
          flashBang(); status(`قرّبت ${Math.round(sc)}%`, sc > 70 ? 'ok' : 'warn');
          if (sc >= 88) { S.skipTo = (S.i + 1) * S.per; }
        }
      }
      if (S.skipTo && S.i < 2) { opts.startAt -= (S.skipTo - t) * 1000; S.skipTo = 0; $('#gmy').style.background = ''; }
      else if (S.skipTo) { S.skipTo = 0; return end(); }
      const sum = S.best.reduce((a, b) => a + b, 0) / 3;
      hud(`<div class="score"><b class="n">${S.i + 1}/3</b><span>لون · مجموعك ${Math.round(sum)}%</span></div>`);
      if (t >= S.per * 3 || left <= 0) end();
      function end() { const s = S.best.reduce((a, b) => a + b, 0) / 3; finish(s, labelFor('color', s, fem)); }
    }
  };
  function sampleCenter(v, frac) {
    if (!v.videoWidth) return null;
    const c = document.createElement('canvas'); const s = 48; c.width = s; c.height = s;
    const vw = v.videoWidth, vh = v.videoHeight, sz = Math.min(vw, vh) * frac * 2;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(v, (vw - sz) / 2, (vh - sz) / 2, sz, sz, 0, 0, s, s);
    const d = x.getImageData(0, 0, s, s).data; let R = 0, G_ = 0, B = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const dx = (i / 4) % s - s / 2, dy = Math.floor(i / 4 / s) - s / 2; if (dx * dx + dy * dy > s * s / 4) continue; R += d[i]; G_ += d[i + 1]; B += d[i + 2]; n++; }
    return [R / n, G_ / n, B / n];
  }
  return api;
}

function labelFor(id, s, fem) {
  const r = Math.round(s);
  switch (id) {
    case 'blink': return `صمد${fem ? 'ت' : ''} ${fmt(s)} ثانية`;
    case 'smile': return s >= 30 ? `ما ضحك${fem ? 'ت' : ''} أبداً 😐` : `صمد${fem ? 'ت' : ''} ${fmt(s)} ثانية`;
    case 'brows': return `${r} رفعة حواجب`;
    case 'wink': return `${r} غمزة صح`;
    case 'emoji': return `تطابق \u2066${r}%\u2069`;
    case 'statue': return `ثبات \u2066${r}%\u2069`;
    case 'frame': return `\u2066${r}%\u2069 جوّا الإطار`;
    case 'head': return `${r} نجمة`;
    case 'blind': return `دقة \u2066${r}%\u2069`;
    case 'color': return `قرب الألوان \u2066${r}%\u2069`;
  }
  return String(r);
}
function simScore(id, r) {
  const u = r ? r() : Math.random(), u2 = Math.random();
  const v = (u + u2) / 2;
  switch (id) {
    case 'blink': return 4 + v * 30; case 'smile': return 3 + v * 27; case 'brows': return Math.round(4 + v * 14);
    case 'wink': return Math.round(1 + v * 14); case 'head': return Math.round(v * 22);
    default: return 25 + v * 70;
  }
}

window.Taswir = { GAMES, ORDER, Cam, play, labelFor, simScore, duration, rng, shuffle };
})();
