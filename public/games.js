/* قعدة تصوير — الكاميرا، المعايرة، والألعاب العشرة
   كل اللاعبين بيلعبوا نفس التحدي بنفس الـseed. الكشف كله عالموبايل نفسه، وكل لاعب إلو عتباته الخاصة من المعايرة. */
(function () {
'use strict';

// ---------- أدوات ----------
function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => (Math.round(n * 10) / 10).toString();
const LSget = (k, d) => { try { const v = localStorage.getItem('tsw_' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
const LSset = (k, v) => { try { localStorage.setItem('tsw_' + k, JSON.stringify(v)); } catch (_) {} };
// مؤثرات صوتية للتلبيك (رمش)
function sfx(kind) {
  try {
    const c = beep.c || (beep.c = new (window.AudioContext || window.webkitAudioContext)()); if (c.state === 'suspended') c.resume();
    const t0 = c.currentTime, g = c.createGain(); g.connect(c.destination);
    if (kind === 'boom' || kind === 'clap') {
      const len = kind === 'boom' ? .6 : .15, buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, kind === 'boom' ? 2 : 4);
      const src = c.createBufferSource(); src.buffer = buf; const f = c.createBiquadFilter(); f.type = kind === 'boom' ? 'lowpass' : 'highpass'; f.frequency.value = kind === 'boom' ? 400 : 1500;
      src.connect(f); f.connect(g); g.gain.value = .5; src.start();
      return;
    }
    const o = c.createOscillator(); o.connect(g);
    if (kind === 'siren') { o.type = 'sawtooth'; o.frequency.setValueAtTime(500, t0); o.frequency.linearRampToValueAtTime(1300, t0 + .35); o.frequency.linearRampToValueAtTime(500, t0 + .7); g.gain.value = .12; o.start(); o.stop(t0 + .7); }
    else if (kind === 'horn') { o.type = 'square'; o.frequency.setValueAtTime(330, t0); o.frequency.setValueAtTime(262, t0 + .2); g.gain.value = .14; o.start(); o.stop(t0 + .45); }
    else if (kind === 'drop') { o.type = 'sine'; o.frequency.setValueAtTime(1600, t0); o.frequency.exponentialRampToValueAtTime(120, t0 + .5); g.gain.value = .2; o.start(); o.stop(t0 + .5); }
    else { o.type = 'square'; o.frequency.value = 1800; g.gain.value = .12; o.start(); o.stop(t0 + .08); }
  } catch (_) {}
}
function beep(f, ms) { try { const c = beep.c || (beep.c = new (window.AudioContext || window.webkitAudioContext)()); if (c.state === 'suspended') c.resume(); const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f || 880; g.gain.value = .08; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + (ms || 120) / 1000); } catch (_) {} }

// ---------- الكاميرا والكشف ----------
const BASE = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
const VISION_URL = new URL('vendor/tasks-vision', BASE).href;
const MODEL_URLS = [new URL('model/face_landmarker.task', BASE).href, 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'];

const Cam = {
  stream: null, facing: null, landmarker: null, loading: null, delegate: null, vision: null, fileset: null, buf: null,
  // طرق الكشف بالترتيب. بعض الموبايلات (مثلاً سامسونج بمعالج Exynos) الكشف عالـGPU أو من الفيديو مباشرة
  // ما بيشوف وجوه بلا ما يعطي خطأ، فمنجرّب الطريقة الجاية لحالنا ومنحفظ اللي اشتغلت.
  MODES: [['GPU', 'video'], ['GPU', 'canvas'], ['CPU', 'canvas'], ['CPU', 'data']],
  mi: 0, src: 'video', modeAt: 0, modeHits: 0, exhausted: false, saved: false,
  async ensureModel() {
    if (this.landmarker) return this.landmarker;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      this.vision = this.vision || await import(VISION_URL + '/vision_bundle.mjs');
      this.fileset = this.fileset || await this.vision.FilesetResolver.forVisionTasks(VISION_URL + '/wasm');
      if (!this.buf) {
        for (const u of MODEL_URLS) { try { const r = await fetch(u); if (r.ok) { this.buf = new Uint8Array(await r.arrayBuffer()); break; } } catch (_) {} }
      }
      if (!this.buf) throw new Error('nomodel');
      const sv = LSget('cammode', null);
      this.saved = sv != null; this.mi = sv != null ? clamp(sv | 0, 0, this.MODES.length - 1) : 0;
      for (let k = 0; k < this.MODES.length; k++) {
        try { await this.build(this.mi); break; } catch (e) { this.mi = Math.min(this.MODES.length - 1, this.mi + 1); }
      }
      if (!this.landmarker) throw new Error('nolandmarker');
      return this.landmarker;
    })();
    try { return await this.loading; } catch (e) { this.loading = null; throw e; }
  },
  async build(mi) {
    const [d, src] = this.MODES[mi];
    const lm = await this.vision.FaceLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetBuffer: this.buf, delegate: d }, runningMode: 'VIDEO', numFaces: 1,
      outputFaceBlendshapes: true, minFaceDetectionConfidence: .4, minFacePresenceConfidence: .4, minTrackingConfidence: .4
    });
    const old = this.landmarker;
    this.landmarker = lm; this.delegate = d; this.src = src; this.mi = mi;
    this.errs = 0; this.misses = 0; this.hits = 0; this.modeHits = 0; this.modeAt = performance.now(); this.vt = -1; this.frames = 0;
    if (old) setTimeout(() => { try { old.close(); } catch (_) {} }, 200);
    if (this.onMode) this.onMode(this.modeName());
  },
  modeName() { const [d, s] = this.MODES[this.mi]; return `${d === 'GPU' ? 'كرت الشاشة' : 'المعالج'} · ${s === 'video' ? 'فيديو' : s === 'canvas' ? 'لوحة' : 'بكسلات'}`; },
  // الطريقة الجاية (تلقائي أو من زر «الكاميرا ما عم تشوفني؟»)
  async nextMode(manual) {
    if (this.switching || !this.vision) return false;
    let n = this.mi + 1;
    if (n >= this.MODES.length) { if (!manual) { this.exhausted = true; return false; } n = 0; }
    this.switching = true;
    try { await this.build(n); } catch (_) { this.mi = n; this.switching = false; return this.nextMode(manual); }
    this.switching = false; this.saved = false;
    return true;
  },
  async toCPU() { if (this.delegate !== 'CPU') { this.switching = false; while (this.delegate !== 'CPU' && this.mi < this.MODES.length - 1) if (!(await this.nextMode())) break; } },
  frameSrc(video) {
    if (this.src === 'video') return video;
    const W = video.videoWidth, H = video.videoHeight, k = Math.min(1, 640 / Math.max(W, H));
    const w = Math.round(W * k), h = Math.round(H * k);
    if (!this.cv) { this.cv = document.createElement('canvas'); this.cx = this.cv.getContext('2d', { willReadFrequently: true }); }
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.cx.drawImage(video, 0, 0, w, h);
    return this.src === 'canvas' ? this.cv : this.cx.getImageData(0, 0, w, h);
  },
  // إذا الصورة عم تتحرك وما شفنا ولا وجه بهالطريقة من فترة، منجرّب اللي بعدها
  watchdog(video, now) {
    if (this.switching || this.exhausted) return;
    if (video.currentTime !== this.vt) { this.vt = video.currentTime; this.frames++; }
    if (this.modeHits > 0 || this.frames < 15) return;
    const wait = this.saved ? 6000 : 2500;
    if (now - this.modeAt > wait) this.nextMode();
  },
  live() { const t = this.stream && this.stream.getVideoTracks()[0]; return !!(t && t.readyState === 'live' && t.enabled && !t.muted); },
  async open(facing) {
    facing = facing || 'user';
    if (this.stream && this.facing === facing && this.live()) return this.stream;
    this.close();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nocam');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } } });
    this.facing = facing;
    return this.stream;
  },
  close() { if (this.stream) this.stream.getTracks().forEach(t => t.stop()); this.stream = null; this.facing = null; },
  attach(video) {
    video.muted = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.setAttribute('muted', ''); video.autoplay = true;
    if (video.srcObject !== this.stream) video.srcObject = this.stream;
    video.classList.toggle('mirror', this.facing === 'user');
    return video.play().catch(() => {});
  },
  // بيرجّع الفيديو يشتغل إذا وقف (قفل الشاشة، تبديل التطبيق…)
  async revive(video, facing) {
    if (!this.live()) { this.close(); await this.open(facing || 'user'); }
    await this.attach(video);
  },
  lastT: 0, lastRes: null, lastAt: 0,
  detect(video) {
    if (!this.landmarker || this.switching || !video || video.readyState < 2 || !video.videoWidth) return null;
    const now = performance.now();
    if (now - this.lastAt < 28 && this.lastVideo === video) return this.lastRes;
    this.lastAt = now; this.lastVideo = video;
    let t = now; if (t <= this.lastT) t = this.lastT + 1; this.lastT = t;
    let res;
    try { res = this.landmarker.detectForVideo(this.frameSrc(video), t); this.errs = 0; }
    catch (e) { if (++this.errs > 15) this.nextMode(); return (this.lastRes = null); }
    this.watchdog(video, now);
    if (this.failModes && this.failModes.includes(this.mi)) res = null; // للفحص فقط
    if (!res || !res.faceLandmarks || !res.faceLandmarks.length) { this.misses++; return (this.lastRes = null); }
    this.hits++; this.modeHits++;
    if (this.modeHits === 12 && !this.saved) { LSset('cammode', this.mi); this.saved = true; this.exhausted = false; }
    const bs = {};
    if (res.faceBlendshapes && res.faceBlendshapes[0]) res.faceBlendshapes[0].categories.forEach(c => (bs[c.categoryName] = c.score));
    const lm = res.faceLandmarks[0];
    let minx = 1, maxx = 0, miny = 1, maxy = 0;
    for (const p of lm) { if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y; }
    const mx = x => 1 - x; // بالإحداثيات المعكوسة (متل ما الشخص شايف حالو)
    const box = { x: mx(maxx), y: miny, w: maxx - minx, h: maxy - miny };
    const nose = { x: mx(lm[1].x), y: lm[1].y };
    const a = lm[33], b = lm[263];
    const roll = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    return (this.lastRes = { bs, lm, box, nose, roll });
  },
  snapshot(video, w) {
    w = w || 360;
    if (!video || !video.videoWidth) return null;
    const h = Math.round(w * video.videoHeight / video.videoWidth);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (this.facing === 'user') { x.translate(w, 0); x.scale(-1, 1); }
    x.drawImage(video, 0, 0, w, h);
    return c.toDataURL('image/jpeg', .8);
  }
};

// ---------- المعايرة ----------
const browF = bs => Math.max(bs.browInnerUp || 0, ((bs.browOuterUpLeft || 0) + (bs.browOuterUpRight || 0)) / 2);
const smileF = bs => ((bs.mouthSmileLeft || 0) + (bs.mouthSmileRight || 0)) / 2;
const jawF = bs => bs.jawOpen || 0;
const E1 = 'eyeBlinkLeft', E2 = 'eyeBlinkRight';
// قياسات هندسية من نقاط الوجه (أثبت من التعابير على بعض الوجوه)
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
// المسافة بين الحاجب والعين، نسبةً لطول الوجه وعلى محوره (يعني ما بتتأثر بالميلان)
function browGeo(lm) {
  const top = lm[10], chin = lm[152], H = dist(top, chin) || 1, ux = (chin.x - top.x) / H, uy = (chin.y - top.y) / H;
  const pr = (e, b) => (e.x - b.x) * ux + (e.y - b.y) * uy;
  const L = pr(mid(lm[33], lm[133]), mid(lm[105], lm[66])), Rr = pr(mid(lm[263], lm[362]), mid(lm[334], lm[296]));
  return (L + Rr) / 2 / H;
}
// فتحة العين (EAR): جهة A وجهة B
function ear(lm, side) { const k = side === 'A' ? [33, 133, 159, 145] : [263, 362, 386, 374]; return dist(lm[k[2]], lm[k[3]]) / (dist(lm[k[0]], lm[k[1]]) || 1); }
const DEF = {
  n: { bs: {}, nose: { x: .5, y: .5 }, w: .35, roll: 0, bg: 0, earA: 0, earB: 0 },
  browG: 0, earR: null,
  ex: { x0: .35, x1: .65, y0: .38, y1: .62 },
  rollR: 15, rollL: -15,
  brow: { n: .12, p: .6 }, smile: { n: .08, p: .75 }, jaw: { n: .03, p: .6 },
  eyes: { R: E2, L: E1 },
  winkR: { a: .75, b: .3 }, winkL: { a: .75, b: .3 },
  blink: { [E1]: .7, [E2]: .7 }
};
const Calib = {
  get() { const c = LSget('calib', null); return c && c.v === 3 ? c : null; },
  data() { return this.get() || DEF; },
  save(c) { c.v = 3; c.at = Date.now(); LSset('calib', c); },
  clear() { LSset('calib', null); }
};
// عتبات الشخص (مع إمكانية تحديث «الطبيعي» من العدّ التنازلي)
function thresholds(base) {
  const C = Calib.data();
  const nb = Object.assign({}, C.n.bs || {});
  if (base && base.n) for (const k in base.sum) nb[k] = base.sum[k] / base.n;
  const g = k => nb[k] != null ? nb[k] : (DEF.n.bs[k] || 0);
  const f = (feat, curN, frac, minD) => { const d = Math.max(minD, (C[feat].p - C[feat].n)); return curN + frac * d; };
  const nBrow = base && base.n ? browF(nb) : C.brow.n, nSmile = base && base.n ? smileF(nb) : C.smile.n, nJaw = base && base.n ? jawF(nb) : C.jaw.n;
  const blinkThr = k => { const n = g(k), p = (C.blink && C.blink[k]) || n + .5; return n + Math.max(.14, .5 * (p - n)); };
  return {
    C,
    browHi: f('brow', nBrow, .5, .12), browLo: f('brow', nBrow, .2, .06), browN: nBrow, browP: nBrow + Math.max(.12, C.brow.p - C.brow.n),
    smileHi: f('smile', nSmile, .38, .14), smileN: nSmile, smileP: nSmile + Math.max(.15, C.smile.p - C.smile.n),
    jawN: nJaw, jawP: nJaw + Math.max(.15, C.jaw.p - C.jaw.n),
    blink: { [E1]: blinkThr(E1), [E2]: blinkThr(E2) },
    browRel: C.n.bg && C.browG > C.n.bg ? clamp((C.browG - C.n.bg) / C.n.bg, .06, .5) : .12,
    // غمزة: إما الفرق بين العينين (تعابير) أو فتحة العين الهندسية، حسب المعايرة
    wink(bs, side, lm) {
      if (lm && C.earR && C.n.earA && C.n.earB) {
        const ts = side === 'R' ? C.earR : (C.earR === 'A' ? 'B' : 'A'), os = ts === 'A' ? 'B' : 'A';
        const rt = ear(lm, ts) / C.n['ear' + ts], ro = ear(lm, os) / C.n['ear' + os];
        if (rt < .62 && ro > .8) return true;
      }
      const key = side === 'R' ? C.eyes.R : C.eyes.L, oth = side === 'R' ? C.eyes.L : C.eyes.R, cal = side === 'R' ? C.winkR : C.winkL;
      const nd = g(key) - g(oth), cd = Math.max(.25, cal.a - cal.b);
      const d = (bs[key] || 0) - (bs[oth] || 0);
      const up = (bs[key] || 0) > g(key) + Math.max(.14, .45 * (cal.a - g(key)));
      return up && d - nd > .5 * (cd - nd);
    },
    nb: g
  };
}

// ---------- واجهة المعايرة ----------
const STEPS = [
  { k: 'neutral', t: 'خلّي وجّك بالنص وطبيعي', s: 'بصّ عالشاشة متل ما بتلعب عادةً', e: '🙂' },
  { k: 'right', t: 'حرّك راسك لتوصل النقطة للدائرة', s: 'لجهة اليمين ➡', dir: [1, 0] },
  { k: 'left', t: 'وهلّق للجهة التانية', s: '⬅ لجهة الشمال', dir: [-1, 0] },
  { k: 'up', t: 'لفوق', s: 'ارفع راسك شوي ⬆', dir: [0, -1] },
  { k: 'down', t: 'ولتحت', s: 'نزّل راسك شوي ⬇', dir: [0, 1] },
  { k: 'tiltR', t: 'ميّل راسك على كتفك اليمين', s: 'متل اللي عم يسمع شي ↘', e: '🙃' },
  { k: 'tiltL', t: 'وعلى كتفك الشمال', s: '↙ للجهة التانية', e: '🙃' },
  { k: 'brow', t: 'ارفع حواجبك لفوق', s: 'لآخر شي، متل المستغرب', e: '🤨' },
  { k: 'smile', t: 'اضحك ضحكة عريضة', s: 'خلّي أسنانك تبيّن', e: '😁' },
  { k: 'jaw', t: 'افتح تمّك منيح', s: 'متل اللي عم يقول «آآآ»', e: '😮' },
  { k: 'winkR', t: 'غمّز بعينك اليمين', s: 'سكّر اليمين بس وخلّي الشمال مفتوحة', e: '😉' },
  { k: 'winkL', t: 'وهلّق بعينك الشمال', s: 'سكّر الشمال بس', e: '😉' },
  { k: 'blink', t: 'سكّر عيونك التنتين', s: 'وما تفتحهن لحد ما تسمع الصوت 🔔', e: '😌' }
];
function calibrate(root, done) {
  root.innerHTML = `
    <div class="qh"><span>معايرة الوجه</span><span class="mut n" id="cbN"></span></div>
    <div class="prog"><b id="cbP" style="width:0"></b></div>
    <div class="card"><div class="gname"><span class="gico" id="cbE" style="font-size:24px"></span><div><h3 id="cbT"></h3><p id="cbS"></p></div></div>
      <div class="mbar" style="margin-top:10px"><b id="cbM"></b></div></div>
    <div class="cam" id="cbCam"><video id="cbV" autoplay muted playsinline></video><canvas id="cbC"></canvas>
      <i class="c c1"></i><i class="c c2"></i><i class="c c3"></i><i class="c c4"></i>
      <span class="live"><i></i><b>معايرة</b></span><span class="status" id="cbSt"></span></div>
    <div class="row" style="margin-top:12px"><button class="btn sm ghost" id="cbBack">رجوع</button><button class="btn sm ghost hide" id="cbSkip">تخطّى هالخطوة</button></div>
    <button class="btn sm hide" id="cbFix" style="margin-top:10px">الكاميرا ما عم تشوفني؟ جرّب طريقة تانية</button>
    <p class="mut n" id="cbDiag" style="font-size:11px;text-align:center;margin:8px 0 0"></p>
    <p class="mut" style="font-size:12px;text-align:center;margin:10px 0 0">المعايرة بتخلّي الكاميرا تعرف وجّك أنت. بتنحفظ عموبايلك وما في شي بيطلع لبرا.</p>`;
  const $ = s => root.querySelector(s);
  const video = $('#cbV'), cv = $('#cbC'), ctx = cv.getContext('2d');
  const C = JSON.parse(JSON.stringify(DEF)); C.n.bs = {};
  let i = 0, stepAt = 0, holdAt = 0, recUntil = 0, raf = 0, stopped = false, lastFace = 0, rec = null;
  const nsum = {}; let nCount = 0, nose = { x: 0, y: 0 }, roll = 0, wsum = 0, gsum = { bg: 0, a: 0, b: 0 };
  const st = (t, k) => { const e = $('#cbSt'); e.textContent = t; e.className = 'status ' + (k || ''); };
  function size() { const b = $('#cbCam').getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1); cv.width = b.width * d; cv.height = b.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); cv.cw = b.width; cv.ch = b.height; }
  function v2c(x, y) { const vw = video.videoWidth || 640, vh = video.videoHeight || 480, s = Math.max(cv.cw / vw, cv.ch / vh), dw = vw * s, dh = vh * s; return [x * dw - (dw - cv.cw) / 2, y * dh - (dh - cv.ch) / 2]; }
  function show() {
    const s = STEPS[i]; stepAt = performance.now(); holdAt = 0; recUntil = 0; rec = null;
    $('#cbN').textContent = `${i + 1}/${STEPS.length}`; $('#cbP').style.width = (i / STEPS.length * 100) + '%';
    $('#cbE').textContent = s.e || (s.dir ? '🎯' : '🙂'); $('#cbT').textContent = s.t; $('#cbS').textContent = s.s; $('#cbM').style.width = '0';
    $('#cbSkip').classList.add('hide');
  }
  function next() {
    beep(i === STEPS.length - 1 ? 1320 : 990, 110);
    if (navigator.vibrate) navigator.vibrate(40);
    i++;
    if (i >= STEPS.length) { stop(); finalize(); return; }
    show();
  }
  function stop() { stopped = true; cancelAnimationFrame(raf); window.removeEventListener('resize', size); Cam.onMode = null; }
  function finalize() {
    // حدود حركة الأنف لازم تكون معقولة
    C.ex.x0 = Math.min(C.ex.x0, C.n.nose.x - .06); C.ex.x1 = Math.max(C.ex.x1, C.n.nose.x + .06);
    C.ex.y0 = Math.min(C.ex.y0, C.n.nose.y - .05); C.ex.y1 = Math.max(C.ex.y1, C.n.nose.y + .05);
    // ميلان الراس: لازم يكون في جهتين متعاكستين
    const n = C.n.roll; if (Math.abs(C.rollR - n) < 5) C.rollR = n + 15;
    if (Math.abs(C.rollL - n) < 5 || Math.sign(C.rollL - n) === Math.sign(C.rollR - n)) C.rollL = n - (C.rollR - n);
    Calib.save(C); done(true);
  }
  $('#cbBack').onclick = () => { stop(); done(false); };
  $('#cbSkip').onclick = () => next();
  const diag = () => { const v = video; $('#cbDiag').textContent = `${Cam.modeName()} · ${v.videoWidth}×${v.videoHeight}${Cam.exhausted ? ' · جرّبنا كل الطرق' : ''}`; };
  Cam.onMode = () => { diag(); lastFace = performance.now(); st('عم نجرّب طريقة تانية…', ''); };
  $('#cbFix').onclick = async () => { $('#cbFix').classList.add('hide'); Cam.exhausted = false; await Cam.nextMode(true); diag(); };
  function loop() {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now(), s = STEPS[i];
    ctx.clearRect(0, 0, cv.cw, cv.ch);
    const f = Cam.detect(video);
    if (now - stepAt > 6000 && s.k !== 'neutral') $('#cbSkip').classList.remove('hide');
    if (!f) {
      st(Cam.exhausted ? 'جرّبنا كل الطرق وما عم نشوفك 😕 اكبس الزر تحت لنعيد' : now - lastFace > 1500 ? 'ما عم شوفك… قرّب وجّك وخلّي في ضو قدّامك' : 'قرّب وجّك', Cam.exhausted ? 'bad' : 'warn');
      if (now - lastFace > 3500) $('#cbFix').classList.remove('hide');
      holdAt = 0; return;
    }
    lastFace = now; $('#cbFix').classList.add('hide');
    if (!(i % 3) && !diag.d) { diag(); diag.d = 1; }
    // إطار حول الوجه
    const [bx0, by0] = v2c(f.box.x, f.box.y), [bx1, by1] = v2c(f.box.x + f.box.w, f.box.y + f.box.h);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0); ctx.setLineDash([]);
    if (f.box.w < .18) { st('قرّب الموبايل شوي', 'warn'); holdAt = 0; return; }
    if (f.box.w > .8) { st('بعّد الموبايل شوي', 'warn'); holdAt = 0; return; }
    let prog = 0;
    const bs = f.bs;
    switch (s.k) {
      case 'neutral': {
        const centered = Math.abs(f.nose.x - .5) < .2 && Math.abs(f.nose.y - .5) < .22;
        if (!centered) { st('حط وجّك بالنص', 'warn'); holdAt = 0; return; }
        if (!holdAt) { holdAt = now; nCount = 0; for (const k in nsum) delete nsum[k]; nose = { x: 0, y: 0 }; roll = 0; wsum = 0; gsum = { bg: 0, a: 0, b: 0 }; }
        for (const k in bs) nsum[k] = (nsum[k] || 0) + bs[k];
        nose.x += f.nose.x; nose.y += f.nose.y; roll += f.roll; wsum += f.box.w; nCount++; gsum.bg += browGeo(f.lm); gsum.a += ear(f.lm, 'A'); gsum.b += ear(f.lm, 'B');
        prog = (now - holdAt) / 1600;
        st('ثابت… 👌', 'ok');
        if (prog >= 1 && nCount >= 8) {
          for (const k in nsum) C.n.bs[k] = nsum[k] / nCount;
          C.n.nose = { x: nose.x / nCount, y: nose.y / nCount }; C.n.roll = roll / nCount; C.n.w = wsum / nCount; C.n.bg = gsum.bg / nCount; C.n.earA = gsum.a / nCount; C.n.earB = gsum.b / nCount;
          C.brow.n = browF(C.n.bs); C.smile.n = smileF(C.n.bs); C.jaw.n = jawF(C.n.bs);
          C.ex = { x0: C.n.nose.x, x1: C.n.nose.x, y0: C.n.nose.y, y1: C.n.nose.y };
          next(); return;
        }
        break;
      }
      case 'right': case 'left': case 'up': case 'down': {
        const D = .13, tx = clamp(C.n.nose.x + s.dir[0] * D, .1, .9), ty = clamp(C.n.nose.y + s.dir[1] * D * .8, .1, .9);
        const [cx, cy] = v2c(tx, ty), [nx, ny] = v2c(f.nose.x, f.nose.y);
        ctx.strokeStyle = '#FF8A5C'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, 7); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(nx, ny, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#1A1C24'; ctx.lineWidth = 3; ctx.stroke();
        const proj = ((f.nose.x - C.n.nose.x) * s.dir[0] + (f.nose.y - C.n.nose.y) * s.dir[1]) / (s.dir[1] ? D * .8 : D);
        prog = proj / .8;
        C.ex.x0 = Math.min(C.ex.x0, f.nose.x); C.ex.x1 = Math.max(C.ex.x1, f.nose.x); C.ex.y0 = Math.min(C.ex.y0, f.nose.y); C.ex.y1 = Math.max(C.ex.y1, f.nose.y);
        st(prog >= 1 ? 'تمام ✓' : 'حرّك راسك نحو الدائرة', prog >= 1 ? 'ok' : '');
        break;
      }
      case 'tiltR': case 'tiltL': {
        const d = f.roll - C.n.roll; prog = Math.abs(d) / 9;
        if (s.k === 'tiltL' && C.rollR != null && Math.sign(d) === Math.sign(C.rollR - C.n.roll) && Math.abs(d) > 4) { st('للجهة التانية ↙', 'warn'); holdAt = 0; prog = 0; break; }
        if (!rec || Math.abs(d) > Math.abs(rec.d)) rec = { d, v: f.roll };
        st(prog >= 1 ? 'تمام ✓' : 'ميّل أكتر شوي', prog >= 1 ? 'ok' : '');
        break;
      }
      case 'brow': { const v = browF(bs), g = browGeo(f.lm); prog = Math.max((v - C.brow.n) / .14, C.n.bg ? (g / C.n.bg - 1) / .08 : 0); if (!rec) rec = { v, g }; rec.v = Math.max(rec.v, v); rec.g = Math.max(rec.g, g); st(prog >= 1 ? 'تمام ✓' : 'لفوق أكتر', prog >= 1 ? 'ok' : ''); break; }
      case 'smile': { const v = smileF(bs); prog = (v - C.smile.n) / .22; if (!rec || v > rec.v) rec = { v }; st(prog >= 1 ? 'حلوة الضحكة ✓' : 'أعرض شوي', prog >= 1 ? 'ok' : ''); break; }
      case 'jaw': { const v = jawF(bs); prog = (v - C.jaw.n) / .22; if (!rec || v > rec.v) rec = { v }; st(prog >= 1 ? 'تمام ✓' : 'افتح أكتر', prog >= 1 ? 'ok' : ''); break; }
      case 'winkR': case 'winkL': {
        const d1 = (bs[E1] || 0) - (C.n.bs[E1] || 0), d2 = (bs[E2] || 0) - (C.n.bs[E2] || 0);
        const big = d1 > d2 ? E1 : E2, sm = big === E1 ? E2 : E1, asym = Math.abs(d1 - d2);
        const rA = ear(f.lm, 'A') / (C.n.earA || .3), rB = ear(f.lm, 'B') / (C.n.earB || .3), eAs = Math.abs(rA - rB), eSide = rA < rB ? 'A' : 'B';
        prog = Math.max(Math.min(Math.max(d1, d2) / .22, asym / .16), Math.min((1 - Math.min(rA, rB)) / .35, eAs / .28));
        if (s.k === 'winkL' && ((C.eyes._R && big === C.eyes._R && asym > .12) || (C.earR && eSide === C.earR && eAs > .22))) { st('هي نفس العين! غمّز بالتانية', 'warn'); prog = 0; holdAt = 0; break; }
        if (!rec || asym + eAs > rec.sc) rec = { sc: asym + eAs, asym, big, a: bs[big] || 0, b: bs[sm] || 0, eSide };
        st(prog >= 1 ? 'تمام ✓' : 'سكّر عين وحدة بس', prog >= 1 ? 'ok' : '');
        break;
      }
      case 'blink': {
        const d1 = (bs[E1] || 0) - (C.n.bs[E1] || 0), d2 = (bs[E2] || 0) - (C.n.bs[E2] || 0);
        prog = Math.min(d1, d2) / .22;
        if (!rec) rec = { [E1]: 0, [E2]: 0 };
        if (prog >= 1) { rec[E1] = Math.max(rec[E1], bs[E1] || 0); rec[E2] = Math.max(rec[E2], bs[E2] || 0); }
        st(prog >= 1 ? 'خليك مسكّر…' : 'سكّر التنتين', prog >= 1 ? 'ok' : '');
        break;
      }
    }
    $('#cbM').style.width = clamp(prog, 0, 1) * 100 + '%';
    const hold = s.k === 'blink' ? 900 : 380;
    if (prog >= 1) { if (!holdAt) holdAt = now; } else if (s.k !== 'neutral') holdAt = 0;
    if (s.k !== 'neutral' && holdAt && now - holdAt > hold) {
      if (!recUntil) recUntil = now + (s.k === 'blink' ? 0 : 450);
      if (now >= recUntil) {
        // حفظ نتيجة الخطوة
        if (s.k === 'tiltR') C.rollR = rec ? rec.v : C.n.roll + 15;
        if (s.k === 'tiltL') C.rollL = rec ? rec.v : C.n.roll - 15;
        if (s.k === 'brow') { C.brow.p = rec.v; C.browG = rec.g; }
        if (s.k === 'smile') C.smile.p = rec.v;
        if (s.k === 'jaw') C.jaw.p = rec.v;
        if (s.k === 'winkR') { C.eyes = { R: rec.big, L: rec.big === E1 ? E2 : E1, _R: rec.big }; C.winkR = { a: rec.a, b: rec.b }; C.earR = rec.eSide; }
        if (s.k === 'winkL') C.winkL = { a: rec.a, b: rec.b };
        if (s.k === 'blink') C.blink = { [E1]: rec[E1], [E2]: rec[E2] };
        next();
      }
    }
  }
  st('عم نجهّز الكاميرا…', '');
  (async () => {
    try { await Cam.open('user'); await Cam.attach(video); size(); window.addEventListener('resize', size); }
    catch (e) { st('ما قدرنا نفتح الكاميرا — اسمح للكاميرا من إعدادات المتصفح', 'bad'); return; }
    st('عم نحمّل كاشف الوجه…', '');
    try { await Cam.ensureModel(); } catch (e) { st('ما قدرنا نحمّل كاشف الوجه، تأكد من النت وجرّب', 'bad'); return; }
    show(); lastFace = performance.now(); diag(); loop();
  })();
  return { stop };
}

// ---------- الإيموجيات ----------
const EMOJI = [
  { e: '😮', n: 'مستغرب', jaw: .7, k: { mouthFunnel: .3 } },
  { e: '😁', n: 'مبسوط', smile: 1 },
  { e: '😗', n: 'بوسة', k: { mouthPucker: .6 } },
  { e: '😲', n: 'مصدوم', jaw: .6, brow: .7 },
  { e: '😠', n: 'معصّب', k: { browDownLeft: .4, browDownRight: .4 }, noSmile: true },
  { e: '😑', n: 'زهقان', blink: true, noJaw: true },
  { e: '🙁', n: 'زعلان', k: { mouthFrownLeft: .35, mouthFrownRight: .35 }, noSmile: true },
  { e: '😉', n: 'غمزة', wink: true },
  { e: '🤨', n: 'شاكك', brow: .6, oneBrow: true },
  { e: '😆', n: 'عم يضحك', smile: .9, blinkHalf: true }
];
function emojiMatch(t, bs, T, lm) {
  const g = k => bs[k] || 0;
  const nrm = (v, n, p) => clamp((v - n) / Math.max(.1, p - n), 0, 1);
  const parts = [];
  if (t.smile) parts.push(nrm(smileF(bs), T.smileN, T.smileP) / t.smile);
  if (t.jaw) parts.push(nrm(jawF(bs), T.jawN, T.jawP) / t.jaw);
  if (t.brow && !t.oneBrow) parts.push(nrm(browF(bs), T.browN, T.browP) / t.brow);
  if (t.oneBrow) { const l = g('browOuterUpLeft'), r = g('browOuterUpRight'), dn = Math.max(g('browDownLeft'), g('browDownRight')); parts.push(clamp((Math.abs(l - r) + dn * .6 - .04) / .3, 0, 1)); }
  if (t.k) for (const k in t.k) parts.push(clamp((g(k) - T.nb(k)) / t.k[k], 0, 1));
  if (t.blink) { const a = clamp((g(E1) - T.nb(E1)) / Math.max(.15, T.blink[E1] - T.nb(E1)), 0, 1), b = clamp((g(E2) - T.nb(E2)) / Math.max(.15, T.blink[E2] - T.nb(E2)), 0, 1); parts.push(Math.min(a, b)); }
  if (t.blinkHalf) { const a = Math.max(g(E1) - T.nb(E1), g(E2) - T.nb(E2)); parts.push(clamp(a / .2, 0, 1)); }
  if (t.wink) parts.push(T.wink(bs, 'R', lm) || T.wink(bs, 'L', lm) ? 1 : clamp(Math.abs(g(E1) - g(E2)) / .5, 0, .6));
  let v = parts.length ? parts.reduce((a, b) => a + Math.min(1, b), 0) / parts.length : 0;
  if (t.noSmile && smileF(bs) > T.smileHi) v *= .5;
  if (t.noJaw && jawF(bs) > T.jawN + .5 * (T.jawP - T.jawN)) v *= .5;
  return clamp(v, 0, 1);
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

// ---------- الألوان ----------
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
  head: '<circle cx="12" cy="9" r="5"/><path d="M5 20l3-4M19 20l-3-4M12 14v2"/><path d="M8 4l-2-2M16 4l2-2"/>',
  balance: '<path d="M3 16l18-5"/><circle cx="14" cy="10" r="2.6"/><path d="M12 14.5V21M8 21h8"/>',
  bubbles: '<circle cx="9" cy="11" r="5"/><circle cx="17.5" cy="15.5" r="3"/><circle cx="16.5" cy="6" r="1.8"/>',
  reaction: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'
};
const GAMES = {
  blink: { name: 'لا ترمش', icon: ic.eye, short: 'آخر واحد بيضل فاتح عيونه بيربح', how: 'حدّق بالكاميرا وما ترمش ولا تتحرك، ولا حتى وجّك. أول رمشة أو حركة بتطلّعك، وانتبه… رح تطلعلك مفاجآت لتلبكك. إذا طلع وجّك من الكادر الوقت بيوقف لحد ما ترجع. أطول وقت بيربح.', facing: 'user' },
  color: { name: 'صيّاد الألوان', icon: ic.drop, short: 'لاقي اللون وصوّره بأسرع وقت', how: 'الكاميرا الخلفية بتنفتح. بيطلعلك 3 ألوان، دوّر عليهن حولك وحط الدائرة على اللون واكبس بأي مكان عالشاشة. كل ما قرّبت أكتر نقاطك أعلى.', facing: 'environment' },
  blind: { name: 'التصوير الأعمى', icon: ic.blind, short: 'صوّر حالك بالمكان الصح… بلا ما تشوف', how: 'الشاشة بتسوَد. بيطلعلك رسم وين لازم يكون وجّك وقدّيش كبير. حرّك الموبايل بلا ما تشوف واكبس «صوّر». 3 لقطات.', facing: 'user' },
  frame: { name: 'ثبّت الإطار', icon: ic.frame, short: 'خلّي أنفك جوّا المربع اللي عم يتحرك', how: 'في مربع عم يتحرك عالشاشة. حرّك راسك لتضل نقطة أنفك جوّاه. كل ما ضليت جوّاه أكتر بتربح.', facing: 'user' },
  wink: { name: 'غمزات', icon: ic.wink, short: 'غمّز بالعين الصح… وجمّع نقاط', how: 'بيطلعلك «يمين» أو «شمال». غمّز بالعين المطلوبة، وبعد كل غمزة فتّح عيونك التنتين ليطلع الأمر الجاي. الغلط ما بيطلّعك، بس ما بيعطيك نقطة. أكتر غمزات صح خلال 30 ثانية بيربح. قرّب الموبايل على وجّك منيح.', facing: 'user' },
  laugh: { name: 'اضحك… جمّد!', icon: ic.smile, short: 'ضحكة، جمود، ضحكة… وبسرعة', how: 'بيطلعلك «اضحك 😁» أو «جمّد 😐». نفّذ الأمر قبل ما يخلص وقته. كل أمر صح نقطة، والأوامر بتسرع. إذا ما لحقت ما في مشكلة، بيجي الأمر اللي بعدو.', facing: 'user' },
  emoji: { name: 'قلّد الإيموجي', icon: ic.emoji, short: 'اعمل نفس تعبير الإيموجي', how: 'بيطلع إيموجي ورا إيموجي. قلّد تعبيره بوجّك قبل ما يتغيّر، والكاميرا بتعطيك نسبة تطابق.', facing: 'user' },
  balance: { name: 'ميزان الطابة', icon: ic.balance, short: 'خلّي الطابة عاللوح بميلان راسك', how: 'في لوح عليه طابة، والهوا عم يدفشها. ميّل راسك على كتفك لتميّل اللوح وتخلّي الطابة بالنص. إذا وقعت بترجع بعد ثانية. الوقت اللي بتضل فيه عاللوح هو نتيجتك، والهوا بيقوى مع الوقت.', facing: 'user' },
  brows: { name: 'حواجب طايرة', icon: ic.brows, short: 'كم مرة بترفع حواجبك بالوقت؟', how: 'ارفع حواجبك لفوق منيح ونزّلهن، وعيد بأسرع ما فيك. الكاميرا بتعدّ كل رفعة كاملة (لفوق ورجعة لتحت). خلّي راسك ثابت ووجّك قريب.', facing: 'user' },
  head: { name: 'راسك هو الجويستيك', icon: ic.head, short: 'ميّل راسك لتلم النجوم وتهرب من الحجار', how: 'ميّل راسك على كتفك يمين وشمال لتحرّك الطابة. لمّ النجوم ⭐ وابعد عن الحجار، كل حجرة بتاكل نجمة.', facing: 'user' },
  bubbles: { name: 'صيّاد الفقاعات', icon: ic.bubbles, short: 'أنفك هو الدبوس… فقّع الفقاعات', how: 'فقاعات بتطلع بكل الشاشة. حرّك راسك لتوصل نقطة أنفك لعند الفقاعة قبل ما تختفي. الفقاعة الدهبية بنقطتين.', facing: 'user' },
  reaction: { name: 'أسرع ردّة فعل', icon: ic.reaction, short: 'لحظة ما تخضرّ الشاشة… افتح تمّك!', how: 'سكّر تمّك واستنى. لحظة ما تصير الشاشة خضرا افتح تمّك بأسرع ما فيك. 5 مرات، والنتيجة معدّل سرعتك بالميلي ثانية. إذا فتحت قبل الأخضر بتنحسب عليك.', facing: 'user' }
};
const ORDER = ['blink', 'color', 'blind', 'frame', 'wink', 'laugh', 'emoji', 'balance', 'brows', 'head', 'bubbles', 'reaction'];
const MAX = { blink: 60 };

// مدة كل لعبة (بالثواني) — الحد الأقصى بتوقيت الحيط
function duration(id, seed) {
  const r = rng(seed);
  switch (id) {
    case 'blink': return 75; case 'laugh': return 30; case 'color': return 33; case 'blind': return 36;
    case 'frame': return 18 + Math.floor(r() * 5); case 'wink': return 30; case 'emoji': return 6 * 3.6 + .5;
    case 'balance': return 30; case 'brows': return 10 + Math.floor(r() * 4); case 'head': return 25;
    case 'bubbles': return 25; case 'reaction': return 45;
  }
  return 30;
}

// ---------- مشغّل الجولة ----------
// opts: {id, seed, startAt(local ms), g, stage, sim, onDone(score,label,snap)}
function play(opts) {
  const G = GAMES[opts.id], r = rng(opts.seed), fem = opts.g === 'f';
  const st = opts.stage;
  st.innerHTML = `
    <div class="cam" id="gcam"><video id="gv" autoplay muted playsinline></video><canvas id="gc"></canvas>
      <i class="c c1"></i><i class="c c2"></i><i class="c c3"></i><i class="c c4"></i>
      <span class="live"><i></i><b id="glive">عم يراقب</b></span>
      <div class="gfx" id="gfx"></div>
      <div class="cd" id="gcd"></div>
      <span class="status" id="gst"></span><span class="far" id="gfar">📱 قرّب الموبايل على وجّك أكتر</span>
    </div>
    <div class="ghud" id="ghud"></div>
    <div class="tm"><b class="n" id="gtm">0</b><span id="gtl">ثانية</span><div class="tmbar"><b id="gbar"></b></div></div>
    <div id="gact"></div>`;
  const video = st.querySelector('#gv'), cv = st.querySelector('#gc'), ctx = cv.getContext('2d');
  const $ = s => st.querySelector(s);
  const status = (t, kind) => { const e = $('#gst'); e.textContent = t || ''; e.className = 'status' + (kind ? ' ' + kind : ''); e.style.display = t ? '' : 'none'; };
  const hud = h => ($('#ghud').innerHTML = h || '');
  const fx = (h, ms) => { const e = $('#gfx'); e.innerHTML = h; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); clearTimeout(fx.t); fx.t = setTimeout(() => e.classList.remove('on'), ms || 1400); };
  let done = false, raf = 0, snap = null, ready = false; const unhook = [];
  const S = {}; let T = thresholds(null), C = T.C, lastFace = 0, prevT = 0, startedLoop = false, revived = 0;
  const base = { n: 0, sum: {} };
  const dur = duration(opts.id, opts.seed);
  function sizeCanvas() { const b = $('#gcam').getBoundingClientRect(); const d = Math.min(2, window.devicePixelRatio || 1); cv.width = b.width * d; cv.height = b.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); cv.cw = b.width; cv.ch = b.height; }
  function v2c(x, y) {
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480, cw = cv.cw, ch = cv.ch;
    const s = Math.max(cw / vw, ch / vh), dw = vw * s, dh = vh * s;
    return [x * dw - (dw - cw) / 2, y * dh - (dh - ch) / 2];
  }
  function finish(score, label) {
    if (done) return; done = true; cancelAnimationFrame(raf);
    if (!snap && !opts.sim) snap = Cam.snapshot(video);
    status(''); $('#gtm').textContent = '✓'; $('#gbar').style.width = '0';
    $('#gact').innerHTML = '';
    hud(`<div class="gdone"><b>${label}</b><span>${fem ? 'استني' : 'استنى'} الباقي…</span></div>`);
    window.removeEventListener('resize', sizeCanvas); unhook.forEach(f => f());
    if (G.facing === 'environment' && !opts.sim) Cam.open('user').then(() => Cam.attach(video)).catch(() => {});
    opts.onDone(Math.round(score * 10) / 10, label, snap);
  }
  const api = { stop() { done = true; cancelAnimationFrame(raf); window.removeEventListener('resize', sizeCanvas); unhook.forEach(f => f()); },
    // الجولة تسكّرت قبل ما يخلّص: منبعت نتيجته لهلّق
    finishNow() { if (done) return; if (!startedLoop || !ready) return api.stop(); const v = current(); finish(v, labelFor(opts.id, v, fem)); } };
  function current() {
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    switch (opts.id) {
      case 'blink': return Math.min(MAX.blink, S.vis || 0); case 'laugh': return laughScore();
      case 'brows': case 'wink': case 'bubbles': return S.n || 0; case 'head': return S.stars || 0; case 'balance': return S.on || 0;
      case 'reaction': return reactScore();
      case 'emoji': return S.list ? S.best.reduce((a, b) => a + (b || 0), 0) / S.list.length * 100 : 0;
      case 'frame': return S.tot ? S.in / S.tot * 100 : 0;
      case 'blind': return S.shots ? S.shots.reduce((a, b) => a + b, 0) / 3 : 0;
      case 'color': return S.best ? avg(S.best) : 0;
    }
    return 0;
  }
  function laughScore() { const n = S.n || 0, rts = S.rts || []; return n + (rts.length ? clamp(1 - rts.reduce((a, b) => a + b, 0) / rts.length / 2, 0, .9) : 0); }
  function reactScore() { const a = (S.rts || []).slice(); while (a.length < 5) a.push(1500); return Math.max(0, 1500 - a.reduce((x, y) => x + y, 0) / 5); }

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
      startedLoop = ready = true;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return api;
  }

  const facing = G.facing;
  window.addEventListener('resize', sizeCanvas);
  status('عم نجهّز الكاميرا…', '');
  (async () => {
    try { await Cam.open(facing); await Cam.attach(video); }
    catch (e) { status('ما قدرنا نفتح الكاميرا', 'bad'); hud(`<div class="gdone"><b>الكاميرا مسكّرة</b><span>اسمح للكاميرا من إعدادات المتصفح</span></div>`); setTimeout(() => finish(0, 'بلا كاميرا'), 2500); return; }
    if (facing === 'user') {
      status('عم نجهّز كاشف الوجه…', '');
      try { await Cam.ensureModel(); }
      catch (e) { status('ما اشتغل كاشف الوجه', 'bad'); setTimeout(() => finish(0, 'ما اشتغل كاشف الوجه'), 2500); return; }
    }
    if (done) return;
    // إذا تأخرنا (تحميل أو رجوع بعد انقطاع) منعطي عدّ تنازلي خاص
    if (Date.now() > opts.startAt - 1500) opts.startAt = Date.now() + 3500;
    sizeCanvas(); ready = true;
    if (opts.id === 'blind') $('#gcam').classList.add('dark');
    if (opts.id === 'color') $('#glive').textContent = 'الكاميرا الخلفية';
    setup[opts.id] && setup[opts.id]();
    raf = requestAnimationFrame(loop);
  })();


  function loop() {
    if (done) return;
    raf = requestAnimationFrame(loop);
    const now = Date.now(), t = (now - opts.startAt) / 1000, dt = prevT ? Math.min(.5, Math.max(0, t - prevT)) : 0; prevT = t;
    ctx.clearRect(0, 0, cv.cw, cv.ch);
    // الفيديو وقف؟ رجّعو
    if ((!Cam.live() || video.paused) && now - revived > 1500) { revived = now; Cam.revive(video, facing).catch(() => {}); }
    const face = facing === 'user' ? Cam.detect(video) : null;
    if (face) lastFace = now;
    if (facing === 'user') { const far = face && face.box.w < (opts.id === 'wink' || opts.id === 'brows' ? .32 : .2); $('#gfar').classList.toggle('on', !!far); }
    if (t < 0) { // عدّ تنازلي + «الطبيعي» الحالي
      $('#gcd').textContent = Math.ceil(-t);
      $('#gtm').textContent = Math.ceil(dur); $('#gbar').style.width = '100%';
      if (face && -t < 2.4) { base.n++; for (const k in face.bs) base.sum[k] = (base.sum[k] || 0) + face.bs[k]; }
      if (facing === 'user') status(face ? 'شايفك ✓ جهّز حالك' : 'قرّب وجّك من الكاميرا', face ? 'ok' : 'warn');
      else status('جهّز الكاميرا الخلفية', 'ok');
      if (opts.id === 'blind') status('جهّز حالك… الشاشة رح تسوَد', 'ok');
      return;
    }
    if (!startedLoop) {
      startedLoop = true; $('#gcd').textContent = ''; flashBang();
      if (base.n >= 5) T = thresholds(base);
      lastFace = face ? now : now; // مهلة من لحظة البداية
    }
    const left = dur - t;
    $('#gtm').textContent = Math.max(0, Math.ceil(left)); $('#gbar').style.width = clamp(left / dur, 0, 1) * 100 + '%';
    tick[opts.id](face, t, dt, now, left);
  }
  function flashBang() { const e = document.createElement('div'); e.className = 'bang'; $('#gcam').appendChild(e); setTimeout(() => e.remove(), 500); }
  const missing = now => now - lastFace;

  const setup = {
    blink() {
      // مفاجآت للتلبيك: صوت + شي بيطلع عالشاشة
      const K = ['emoji', 'flash', 'shake', 'fake', 'spider', 'zoom', 'emoji', 'boom'];
      let at = 2.5; S.events = [];
      while (at < 70) { S.events.push({ at, k: K[Math.floor(r() * K.length)], e: FUNNY[Math.floor(r() * FUNNY.length)] }); at += 2.2 + r() * 3.2; }
      S.cl = 0; S.vis = 0; S.ref = null; S.refN = 0; S.mv = 0;
    },
    laugh() { S.cmd = 'smile'; S.n = 0; S.win = 2; S.cmdAt = 0; S.rts = []; S.holdAt = 0; $('#gact').innerHTML = '<div class="bigcmd" id="gcmd"></div><div class="mbar" style="margin-top:8px"><b id="gcb"></b></div>'; },
    brows() { S.n = 0; S.up = false; S.hist = []; },
    wink() {
      S.seq = Array.from({ length: 80 }, () => r() < .5 ? 'R' : 'L'); S.i = 0; S.n = 0; S.holdAt = 0; S.wait = false; S.openAt = 0; S.badAt = 0; S.shown = false;
      $('#gact').innerHTML = '<div class="bigcmd" id="gcmd"></div>';
    },
    emoji() {
      S.list = shuffle(EMOJI, r).slice(0, 6); S.i = -1; S.best = []; S.per = 3.6;
      $('#gact').innerHTML = '<div class="emo"><span id="gemo"></span><div><b id="gemn"></b><div class="mbar"><b id="gemb"></b></div></div></div>';
    },
    balance() { S.x = 0; S.v = 0; S.on = 0; S.falls = 0; S.pause = 0; S.wind = 0; S.windT = 0; S.wt = 1.5; S.wr = rng(opts.seed + 11); S.tilt = 0; },
    bubbles() { S.b = []; S.n = 0; S.next = .3; S.br = rng(opts.seed + 21); },
    reaction() { S.k = 0; S.rts = []; S.ph = 'arm'; S.cl = 0; const rr = rng(opts.seed + 31); S.waits = Array.from({ length: 5 }, () => 1.4 + rr() * 2.6); $('#gact').innerHTML = '<div class="bigcmd" id="gcmd"></div>'; },
    frame() { S.ph = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28]; S.sp = [.35 + r() * .25, .45 + r() * .3, .3 + r() * .2, .5 + r() * .3]; S.in = 0; S.tot = 0; },
    head() { S.x = .5; S.stars = 0; S.objs = []; S.next = 0; S.spawnR = rng(opts.seed + 7); S.hit = 0; },
    blind() {
      S.shots = []; S.k = 0;
      const w0 = C.n.w || .35;
      S.targets = Array.from({ length: 3 }, () => ({ x: .3 + r() * .4, y: .34 + r() * .32, w: clamp(w0 * (.7 + r() * .6), .2, .6) }));
      $('#gact').innerHTML = '<button class="btn big shoot" id="gshoot">صوّر 📸</button>';
      $('#gshoot').onclick = () => { if (!S.reveal) S.want = true; };
    },
    color() {
      S.list = shuffle(COLORS, r).slice(0, 3); S.i = 0; S.best = [0, 0, 0]; S.per = 11; S.off = 0;
      $('#gact').innerHTML = '<div class="swatch"><span id="gsw"></span><div><small>دوّر على</small><b id="gswn"></b></div><span id="gmy" class="my"></span></div><button class="btn big shoot" id="gshoot">صوّر 📸</button>';
      $('#gshoot').onclick = () => (S.want = true);
      // أي كبسة عالشاشة بتصوّر
      S.tap = e => { if (done || e.target.closest('button, a, input, textarea, .sheet, .top, header')) return; S.want = true; };
      document.addEventListener('pointerdown', S.tap); unhook.push(() => document.removeEventListener('pointerdown', S.tap));
    }
  };

  const tick = {
    blink(face, t, dt, now) {
      const ev = S.events.find(e => !e.done && t >= e.at); if (ev) { ev.done = true; surprise(ev); }
      if (face) {
        // سكّرة: تعابير العين أو فتحة العين الهندسية (أي وحدة منهن بتكفي)
        const bt = k => T.nb(k) + Math.max(.1, .38 * (T.blink[k] - T.nb(k)) / .5);
        const b1 = face.bs[E1] || 0, b2 = face.bs[E2] || 0;
        const rA = C.n.earA ? ear(face.lm, 'A') / C.n.earA : 1, rB = C.n.earB ? ear(face.lm, 'B') / C.n.earB : 1;
        const strong = (b1 > T.blink[E1] && b2 > T.blink[E2]) || (rA < .6 && rB < .6);
        const soft = (b1 > bt(E1) && b2 > bt(E2)) || (rA < .74 && rB < .74);
        if (strong) S.cl += 2; else if (soft) S.cl += 1; else S.cl = 0;
        if (S.cl >= 2) return lose(fem ? 'رمشتي! 👁' : 'رمشت! 👁');
        // ممنوع تتحرك: منسجّل مكان الوجه بأول ثانية
        if (S.refN < 8) { S.ref = S.ref || { x: 0, y: 0, w: 0, r: 0 }; S.ref.x += face.nose.x; S.ref.y += face.nose.y; S.ref.w += face.box.w; S.ref.r += face.roll; S.refN++; if (S.refN === 8) for (const k in S.ref) S.ref[k] /= 8; }
        else {
          const R = S.ref, mvp = Math.hypot(face.nose.x - R.x, face.nose.y - R.y) / R.w, mvs = Math.abs(face.box.w / R.w - 1), mvr = Math.abs(face.roll - R.r);
          const m = Math.max(mvp / .35, mvs / .2, mvr / 12);
          S.mv = m > 1 ? S.mv + dt : 0;
          if (S.mv > .25) return lose(fem ? 'تحرّكتي! 🫨' : 'تحرّكت! 🫨');
          if (m > .6) { status('لا تتحرك! 🗿', 'bad'); } else status('عيونك فاتحة ✓ لا تتحرك', 'ok');
        }
        S.vis += dt;
      } else {
        S.cl = 0;
        status(`رجّع وجّك… الوقت واقف`, 'warn');
        if (missing(now) > 5000) return finish(S.vis, labelFor('blink', S.vis, fem) + ' 🙈');
      }
      $('#gtl').textContent = 'ثانية';
      hud(`<div class="score"><b class="n">${fmt(S.vis)}</b><span>ثانية صامد${fem ? 'ة' : ''}</span></div>`);
      if (S.vis >= MAX.blink || t >= dur) finish(Math.min(MAX.blink, S.vis), labelFor('blink', Math.min(MAX.blink, S.vis), fem));
      function lose(why) { snap = Cam.snapshot(video); status(why, 'bad'); finish(S.vis, labelFor('blink', S.vis, fem)); }
      function surprise(ev) {
        const cam = $('#gcam');
        const fxc = (cls, ms) => { cam.classList.remove(cls); void cam.offsetWidth; cam.classList.add(cls); setTimeout(() => cam.classList.remove(cls), ms); };
        switch (ev.k) {
          case 'flash': { const c = ['#FF8A5C', '#FFD166', '#9AD1F5', '#fff', '#E5484D'][Math.floor(r() * 5)]; const e = document.createElement('div'); e.className = 'bang'; e.style.background = c; cam.appendChild(e); setTimeout(() => e.remove(), 500); sfx('clap'); break; }
          case 'shake': fxc('shake', 600); sfx('horn'); fx(`<span class="pop">${ev.e}</span>`, 700); break;
          case 'fake': fx(`<span class="pop sm">${fem ? 'رمشتي!' : 'رمشت!'} 😱</span>`, 700); sfx('drop'); setTimeout(() => !done && fx('<span class="pop sm">مزح 😜</span>', 700), 750); break;
          case 'spider': { const e = document.createElement('div'); e.className = 'crawl'; e.textContent = r() < .5 ? '🕷️' : '🪳'; e.style.top = (15 + r() * 60) + '%'; cam.appendChild(e); setTimeout(() => e.remove(), 1800); sfx('tick'); break; }
          case 'zoom': fx(`<span class="pop huge">${ev.e}</span>`, 900); sfx('siren'); break;
          case 'boom': fxc('shake', 600); fx('<span class="pop huge">💥</span>', 800); sfx('boom'); break;
          default: fx(`<span class="pop">${ev.e}</span>`, 1000); sfx('tick');
        }
        if (navigator.vibrate) try { navigator.vibrate(60); } catch (_) {}
      }
    },
    brows(face, t, dt, now, left) {
      if (face) {
        const g = browGeo(face.lm);
        S.hist.push({ t: now, g }); while (S.hist.length && now - S.hist[0].t > 2000) S.hist.shift();
        let base = Infinity; for (const h of S.hist) if (h.g < base) base = h.g;
        const rel = (g - base) / base, hi = T.browRel * .45;
        const bsU = (browF(face.bs) - T.browN) / Math.max(.06, T.browHi - T.browN);
        if (!S.up && (rel > hi || bsU > 1)) { S.up = rel > hi ? 'g' : 'b'; S.n++; fx(`<span class="pop">+1</span>`, 500); beep(1000, 50); if (S.n === 3) snap = Cam.snapshot(video); }
        else if (S.up && (S.up === 'g' ? rel < hi * .4 : bsU < .5) && (rel < hi * .6)) S.up = false;
        status(S.up ? 'نزّل! ⬇' : 'ارفع! ⬆', 'ok');
      } else { S.hist = []; status('قرّب وجّك', 'warn'); }
      hud(`<div class="score"><b class="n">${S.n}</b><span>رفعة</span></div>`);
      if (left <= 0) finish(S.n, labelFor('brows', S.n, fem));
    },
    wink(face, t, dt, now, left) {
      const want = S.seq[S.i];
      if (!S.shown) { S.shown = true; showCmd(); }
      if (face) {
        const wr = T.wink(face.bs, 'R', face.lm), wl = T.wink(face.bs, 'L', face.lm);
        const open = !wr && !wl && (face.bs[E1] || 0) < T.blink[E1] && (face.bs[E2] || 0) < T.blink[E2];
        if (S.wait) {
          // بعد كل غمزة لازم تنفتح العيون التنتين
          if (open) { if (!S.openAt) S.openAt = now; if (now - S.openAt > 120) { S.wait = false; S.openAt = 0; showCmd(); } } else S.openAt = 0;
          status('فتّح عيونك 👀', '');
        } else {
          const ok = want === 'R' ? wr : wl, bad = want === 'R' ? wl : wr;
          if (ok) { if (!S.holdAt) S.holdAt = now; } else S.holdAt = 0;
          if (S.holdAt && now - S.holdAt > 60) {
            S.n++; S.i++; S.wait = true; S.holdAt = 0; fx(`<span class="pop">✓</span>`, 400); beep(1100, 60);
            if (S.n === 4) snap = Cam.snapshot(video);
            const e = $('#gcmd'); if (e) e.innerHTML = '👀 فتّح';
          } else if (bad && now - S.badAt > 900) { S.badAt = now; fx('<span class="pop sm">العين التانية! 🙃</span>', 700); status('العين التانية!', 'warn'); }
          else if (!bad) status('غمّز!', 'ok');
        }
      } else status('قرّب وجّك', 'warn');
      hud(`<div class="score"><b class="n">${S.n}</b><span>غمزة صح</span></div>`);
      if (left <= 0) finish(S.n, labelFor('wink', S.n, fem));
      function showCmd() { const e = $('#gcmd'); if (e) e.innerHTML = S.seq[S.i] === 'R' ? 'يمين 👉' : '👈 شمال'; }
    },
    laugh(face, t, dt, now, left) {
      if (!S.cmdAt) { S.cmdAt = t; show(); }
      const el = t - S.cmdAt;
      if (face) {
        const sm = (smileF(face.bs) - T.smileN) / Math.max(.15, T.smileP - T.smileN), jw = (jawF(face.bs) - T.jawN) / Math.max(.15, T.jawP - T.jawN);
        const ok = S.cmd === 'smile' ? sm > .5 : (sm < .22 && jw < .35);
        if (ok) { if (!S.holdAt) S.holdAt = now; } else S.holdAt = 0;
        if (S.holdAt && now - S.holdAt > 140) {
          S.n++; S.rts.push(el); fx(`<span class="pop">✓</span>`, 400); beep(1100, 60);
          if (S.n === 3) snap = Cam.snapshot(video);
          return next(false);
        }
        status(S.cmd === 'smile' ? 'اضحك أكتر!' : 'جمّد وجّك!', 'ok');
      } else status('قرّب وجّك', 'warn');
      if (el > S.win) { fx('<span class="pop sm">⌛</span>', 500); return next(true); }
      $('#gcb').style.width = clamp(1 - el / S.win, 0, 1) * 100 + '%';
      hud(`<div class="score"><b class="n">${S.n}</b><span>أمر صح</span></div>`);
      if (left <= 0) { const v = laughScore(); finish(v, labelFor('laugh', v, fem)); }
      function next(miss) { S.cmd = S.cmd === 'smile' ? 'freeze' : 'smile'; S.cmdAt = t; S.holdAt = 0; if (!miss) S.win = Math.max(.8, S.win * .93); show(); }
      function show() { const e = $('#gcmd'); if (e) e.innerHTML = S.cmd === 'smile' ? 'اضحك 😁' : 'جمّد 😐'; }
    },
    emoji(face, t) {
      const i = Math.floor(t / S.per);
      if (i >= S.list.length) { const s = S.best.reduce((a, b) => a + b, 0) / S.list.length * 100; return finish(s, labelFor('emoji', s, fem)); }
      if (i !== S.i) { S.i = i; S.best[i] = 0; $('#gemo').textContent = S.list[i].e; $('#gemn').textContent = S.list[i].n; fx(`<span class="pop">${S.list[i].e}</span>`, 900); }
      const inWin = t - i * S.per > .4;
      if (face && inWin) {
        const m = emojiMatch(S.list[i], face.bs, T, face.lm);
        if (m > S.best[i]) { S.best[i] = m; if (m > .75 && !snap) snap = Cam.snapshot(video); }
        $('#gemb').style.width = Math.round(m * 100) + '%';
        status(`تطابق ${Math.round(S.best[i] * 100)}%`, S.best[i] > .7 ? 'ok' : '');
      } else if (!face) status('قرّب وجّك', 'warn');
      $('#gtm').textContent = `${i + 1}/${S.list.length}`; $('#gtl').textContent = 'إيموجي';
    },
    balance(face, t, dt, now, left) {
      const cw = cv.cw, ch = cv.ch;
      if (face) {
        const n = C.n.roll, sR = (C.rollR - n) || 15, sL = (C.rollL - n) || -15, d = face.roll - n;
        const u = Math.sign(d) === Math.sign(sR) ? clamp(d / (sR * .8), 0, 1) : -clamp(d / (sL * .8), 0, 1);
        S.tilt += (u - S.tilt) * Math.min(1, dt * 8);
      }
      if (t >= S.wt) { const lvl = Math.min(1, t / 25); const sg = S.wr() < .35 ? -Math.sign(S.windT || 1) : Math.sign(S.windT || (S.wr() < .5 ? -1 : 1)); S.windT = sg * (.6 + S.wr() * .4) * (1.5 + lvl * 3); S.wt = t + 1.4 + S.wr() * 1.8; }
      S.wind += (S.windT - S.wind) * Math.min(1, dt * 3);
      const gust = Math.sin(t * 7.3) * .35 * Math.min(1, t / 20) * Math.sign(S.wind || 1);
      const ang = S.tilt * .45;
      if (S.pause > 0) { S.pause -= dt; if (S.pause <= 0) { S.x = 0; S.v = 0; } }
      else {
        S.v += (Math.sin(ang) * 9 + S.wind + gust + S.x * 1.6) * Math.min(dt, .1); S.v *= Math.pow(.7, Math.min(dt, .1)); S.x += S.v * Math.min(dt, .1) * .55;
        if (Math.abs(S.x) > 1) { S.falls++; S.pause = 1.2; fx('<span class="pop sm">💥 وقعت!</span>', 900); beep(300, 150); if (S.falls === 1) snap = Cam.snapshot(video); }
        else S.on += dt;
      }
      ctx.fillStyle = 'rgba(26,28,36,.35)'; ctx.fillRect(0, 0, cw, ch);
      const cx = cw / 2, cy = ch * .62, L = cw * .4, ux = Math.cos(ang), uy = Math.sin(ang);
      ctx.lineCap = 'round'; ctx.strokeStyle = '#1A1C24'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(cx - ux * L, cy - uy * L); ctx.lineTo(cx + ux * L, cy + uy * L); ctx.stroke();
      ctx.strokeStyle = '#FFD166'; ctx.lineWidth = 10; ctx.stroke();
      ctx.fillStyle = '#1A1C24'; ctx.beginPath(); ctx.moveTo(cx - 14, cy + 40); ctx.lineTo(cx + 14, cy + 40); ctx.lineTo(cx, cy + 8); ctx.fill();
      if (S.pause <= 0) {
        const bx = cx + ux * L * S.x + uy * 17, by = cy + uy * L * S.x - ux * 17;
        ctx.fillStyle = '#FF8A5C'; ctx.beginPath(); ctx.arc(bx, by, 14, 0, 7); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      }
      const w = S.wind; ctx.font = '700 18px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(Math.abs(w) < .4 ? '🍃 هادي' : (w > 0 ? '💨 ➡'.repeat(1) : '⬅ 💨') + (Math.abs(w) > 3 ? ' عاصفة!' : Math.abs(w) > 1.8 ? ' قوي!' : ''), cw / 2, ch * .2);
      status(face ? (S.pause > 0 ? 'وقعت! رجعت…' : 'ميّل راسك لتوازن') : 'قرّب وجّك', face ? (S.pause > 0 ? 'bad' : 'ok') : 'warn');
      hud(`<div class="score"><b class="n">${fmt(S.on)}</b><span>ثانية عالميزان</span></div>`);
      if (left <= 0) finish(S.on, labelFor('balance', S.on, fem));
    },
    bubbles(face, t, dt, now, left) {
      const ex = C.ex, cw = cv.cw, ch = cv.ch, R = Math.min(cw, ch) * .08;
      if (t >= S.next && S.b.length < 7) {
        // بكل الشاشة: منقسمها لـ9 مناطق وكل فقاعة بمنطقة فاضية، ومنطقة الحركة من المعايرة مكبّرة شوي
        const mx = (ex.x1 - ex.x0) * .15, my = (ex.y1 - ex.y0) * .15, X0 = Math.max(.02, ex.x0 - mx), X1 = Math.min(.98, ex.x1 + mx), Y0 = Math.max(.02, ex.y0 - my), Y1 = Math.min(.98, ex.y1 + my);
        const used = new Set(S.b.map(b => b.z)), free = []; for (let z = 0; z < 9; z++) if (!used.has(z) && z !== S.lastZ) free.push(z);
        const z = free.length ? free[Math.floor(S.br() * free.length)] : Math.floor(S.br() * 9); S.lastZ = z;
        const u = ((z % 3) + .15 + .7 * S.br()) / 3, w = (Math.floor(z / 3) + .15 + .7 * S.br()) / 3, life = Math.max(1.6, 3 - t * .05);
        S.b.push({ x: X0 + u * (X1 - X0), y: Y0 + w * (Y1 - Y0), z, born: t, life, gold: S.br() < .15, sz: .75 + S.br() * .5 });
        S.next = t + Math.max(.18, .45 - t * .012);
      }
      let nx = -999, ny = -999; if (face) [nx, ny] = v2c(face.nose.x, face.nose.y);
      S.b = S.b.filter(b => {
        const age = (t - b.born) / b.life; if (age >= 1) return false;
        const [bx, by] = v2c(b.x, b.y), rr = R * (b.sz || 1) * (1 - .25 * age);
        if (Math.hypot(nx - bx, ny - by) < rr + 6) { S.n += b.gold ? 2 : 1; fx(`<span class="pop sm">${b.gold ? '✨ +2' : '+1'}</span>`, 400); beep(b.gold ? 1400 : 1000, 50); if (S.n >= 5 && !snap) snap = Cam.snapshot(video); return false; }
        ctx.globalAlpha = 1 - age * .5; ctx.fillStyle = b.gold ? 'rgba(255,209,102,.55)' : 'rgba(154,209,245,.4)';
        ctx.beginPath(); ctx.arc(bx, by, rr, 0, 7); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(bx - rr * .35, by - rr * .35, rr * .18, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        return true;
      });
      if (face) { ctx.fillStyle = '#FF8A5C'; ctx.beginPath(); ctx.arc(nx, ny, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); }
      status(face ? 'حرّك أنفك عالفقاعات' : 'قرّب وجّك', face ? 'ok' : 'warn');
      hud(`<div class="score"><b class="n">${S.n}</b><span>فقاعة</span></div>`);
      if (left <= 0) finish(S.n, labelFor('bubbles', S.n, fem));
    },
    reaction(face, t, dt, now, left) {
      const cam = $('#gcam'), cmd = $('#gcmd');
      if (S.k >= 5) return end();
      const jw = face ? (jawF(face.bs) - T.jawN) / Math.max(.15, T.jawP - T.jawN) : null;
      const open = jw != null && jw > .45, closed = jw != null && jw < .25;
      const done1 = (ms, msg) => { S.rts.push(ms); S.ph = 'show'; S.showUntil = t + 1.3; cam.classList.remove('go', 'wait'); fx(`<span class="pop sm">${msg}</span>`, 1100); };
      switch (S.ph) {
        case 'arm':
          cmd.textContent = `${S.k + 1}/5 · سكّر تمّك`; cam.classList.remove('go', 'wait');
          if (closed) { if (!S.cl) S.cl = now; if (now - S.cl > 300) { S.ph = 'wait'; S.goAt = t + S.waits[S.k]; S.cl = 0; } } else S.cl = 0;
          break;
        case 'wait':
          cmd.textContent = 'استنى… 🤫'; cam.classList.add('wait');
          if (open) { done1(1500, 'بكّير! 🙈'); beep(300, 150); }
          else if (t >= S.goAt) { S.ph = 'go'; S.goT = now; beep(1300, 90); cam.classList.remove('wait'); cam.classList.add('go'); }
          break;
        case 'go': {
          cmd.textContent = 'افتح تمّك! 😮';
          const ms = now - S.goT;
          if (open) { done1(ms, `${Math.round(ms)} ms`); if (!S.bestMs || ms < S.bestMs) { S.bestMs = ms; snap = Cam.snapshot(video); } }
          else if (ms > 1500) done1(1500, '⌛ تأخرت');
          break;
        }
        case 'show': if (t >= S.showUntil) { S.k++; S.ph = 'arm'; } break;
      }
      const a = S.rts.length ? Math.round(S.rts.reduce((x, y) => x + y, 0) / S.rts.length) : 0;
      status(face ? (S.ph === 'go' ? 'هلّق!' : 'جاهز…') : 'قرّب وجّك', face ? (S.ph === 'go' ? 'ok' : '') : 'warn');
      hud(`<div class="score"><b class="n">${a ? a + ' ms' : '—'}</b><span>المعدّل لهلّق</span></div>`);
      if (left <= 0) end();
      function end() { cam.classList.remove('go', 'wait'); const v = reactScore(); finish(v, labelFor('reaction', v, fem)); }
    },
    frame(face, t, dt, now, left) {
      const ex = C.ex, cxm = (ex.x0 + ex.x1) / 2, cym = (ex.y0 + ex.y1) / 2, rx = Math.max(.08, (ex.x1 - ex.x0) / 2), ry = Math.max(.06, (ex.y1 - ex.y0) / 2);
      const bx = cxm + (Math.sin(t * S.sp[0] + S.ph[0]) * .7 + Math.sin(t * S.sp[2] + S.ph[2]) * .25) * rx * .85;
      const by = cym + (Math.sin(t * S.sp[1] + S.ph[1]) * .7 + Math.cos(t * S.sp[3] + S.ph[3]) * .25) * ry * .85;
      const bw = Math.max(.1, rx * .75), bh = Math.max(.09, ry * .8);
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
      status(!face ? 'قرّب وجّك' : inside ? 'جوّا ✓' : 'برا!', !face ? 'warn' : inside ? 'ok' : 'bad');
      hud(`<div class="score"><b class="n">${Math.round(sc)}%</b><span>جوّا الإطار</span></div>`);
      if (left <= 0) finish(sc, labelFor('frame', sc, fem));
    },
    head(face, t, dt, now, left) {
      const cw = cv.cw, ch = cv.ch;
      if (face) {
        const n = C.n.roll, sR = (C.rollR - n) || 15, sL = (C.rollL - n) || -15, d = face.roll - n;
        // جهة اليمين المسجّلة بالمعايرة = يمين الشاشة
        let u = Math.sign(d) === Math.sign(sR) ? clamp(d / (sR * .75), 0, 1) : -clamp(d / (sL * .75), 0, 1);
        const tgt = clamp(.5 + u * .5, 0, 1); S.x += (tgt - S.x) * Math.min(1, dt * 10);
      }
      if (t >= S.next) { const sr = S.spawnR; S.objs.push({ x: .08 + sr() * .84, y: -.08, k: sr() < .55 ? 'star' : 'rock', v: .32 + sr() * .2 + t * .012 }); S.next = t + .55 - Math.min(.25, t * .01); }
      ctx.fillStyle = 'rgba(26,28,36,.55)'; ctx.fillRect(0, 0, cw, ch);
      const px = S.x * cw, py = ch * .84, R = 16;
      for (const o of S.objs) {
        o.y += o.v * Math.min(dt, .1); const ox = o.x * cw, oy = o.y * ch;
        if (!o.gone && Math.hypot(ox - px, oy - py) < R + 19) {
          o.gone = true;
          if (o.k === 'star') { S.stars++; fx('<span class="pop sm">⭐ +1</span>', 450); if (S.stars === 5) snap = Cam.snapshot(video); }
          else { S.stars = Math.max(0, S.stars - 1); S.hit = t; fx('<span class="pop sm">💥 −1</span>', 500); }
        }
        if (!o.gone) {
          // خلفية غامقة وإطار ليبينوا فوق الكاميرا
          ctx.fillStyle = o.k === 'star' ? 'rgba(26,28,36,.92)' : 'rgba(90,20,24,.95)'; ctx.beginPath(); ctx.arc(ox, oy, 21, 0, 7); ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = o.k === 'star' ? '#FFD166' : '#E5484D'; ctx.stroke();
          ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.k === 'star' ? '⭐' : '🪨', ox, oy + 1);
        }
      }
      S.objs = S.objs.filter(o => o.y < 1.1 && !o.gone);
      ctx.fillStyle = t - S.hit < .3 ? '#E5484D' : '#FF8A5C'; ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      status(face ? 'ميّل راسك يمين وشمال' : 'قرّب وجّك', face ? 'ok' : 'warn');
      hud(`<div class="score"><b class="n">${S.stars}</b><span>نجمة</span></div>`);
      if (left <= 0) finish(S.stars, labelFor('head', S.stars, fem));
    },
    blind(face, t, dt, now, left) {
      const tg = S.targets[S.k];
      const [x0, y0] = v2c(tg.x - tg.w / 2, tg.y - tg.w * .65), [x1, y1] = v2c(tg.x + tg.w / 2, tg.y + tg.w * .65);
      ctx.strokeStyle = '#FF8A5C'; ctx.lineWidth = 3; if (!S.reveal) ctx.setLineDash([8, 7]);
      ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      if (!S.reveal) {
        status(`لقطة ${S.k + 1} من 3 — حط وجّك هون`, 'ok');
        if (S.want) {
          S.want = false;
          const f = face || Cam.detect(video);
          let acc = 0;
          if (f) {
            const fcx = f.box.x + f.box.w / 2, fcy = f.box.y + f.box.h / 2;
            const d = Math.hypot(fcx - tg.x, (fcy - tg.y) * .8) / tg.w, sd = Math.abs(f.box.w - tg.w) / tg.w;
            acc = clamp(100 - d * 110 - sd * 90, 0, 100);
          }
          const img = Cam.snapshot(video, 300);
          S.shots.push(acc); if (!snap || acc > (S.bestAcc || -1)) { snap = img; S.bestAcc = acc; }
          flashBang(); beep(acc > 60 ? 1200 : 600, 90);
          S.reveal = { until: t + 1.6, acc };
          $('#gcam').classList.remove('dark');
        }
      } else {
        status(S.reveal.acc ? `دقة ${Math.round(S.reveal.acc)}%` : 'ما بيّن وجّك 🙈', S.reveal.acc > 60 ? 'ok' : 'warn');
        if (t > S.reveal.until) { S.reveal = null; S.k++; $('#gcam').classList.add('dark'); if (S.k >= 3) return end(); }
      }
      hud(`<div class="score"><b class="n">${S.shots.length}/3</b><span>لقطات</span></div>`);
      if (left <= 0) end();
      function end() { while (S.shots.length < 3) S.shots.push(0); const s = S.shots.reduce((a, b) => a + b, 0) / 3; $('#gcam').classList.remove('dark'); finish(s, labelFor('blind', s, fem)); }
    },
    color(face, t, dt, now, left) {
      const tt = t + S.off;
      const i = Math.min(2, Math.floor(tt / S.per));
      if (S.i !== i) { S.i = i; $('#gmy').style.background = ''; }
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
          if (sc > S.best[S.i]) { S.best[S.i] = sc; if (!snap || S.i === 0) snap = Cam.snapshot(video); }
          $('#gmy').style.background = `rgb(${avg.map(Math.round)})`;
          flashBang(); S.msgT = now + 1100; status(`قرّبت ${Math.round(sc)}%`, sc > 70 ? 'ok' : 'warn');
          if (sc >= 88) { if (S.i >= 2) return end(); S.off += (S.i + 1) * S.per - tt; }
        }
      } else if (!(S.msgT > now)) status('حط الدائرة عاللون واكبس بأي مكان', 'ok');
      const sum = S.best.reduce((a, b) => a + b, 0) / 3;
      hud(`<div class="score"><b class="n">${S.i + 1}/3</b><span>لون · مجموعك ${Math.round(sum)}%</span></div>`);
      if (tt >= S.per * 3 || left <= 0) end();
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
  const r = Math.round(s), P = v => `⁦${v}%⁩`;
  switch (id) {
    case 'blink': return `صمد${fem ? 'ت' : ''} ${fmt(s)} ثانية`;
    case 'laugh': return `${Math.floor(s)} أمر صح`;
    case 'brows': return `${r} رفعة حواجب`;
    case 'wink': return `${r} غمزة صح`;
    case 'emoji': return `تطابق ${P(r)}`;
    case 'balance': return `${fmt(s)} ثانية عالميزان`;
    case 'bubbles': return `${r} فقاعة`;
    case 'reaction': return `ردّة فعلك \u2066${Math.round(1500 - s)} ms\u2069`;
    case 'frame': return `${P(r)} جوّا الإطار`;
    case 'head': return `${r} نجمة`;
    case 'blind': return `دقة ${P(r)}`;
    case 'color': return `قرب الألوان ${P(r)}`;
  }
  return String(r);
}
function simScore(id, r) {
  const u = r ? r() : Math.random(), u2 = Math.random();
  const v = (u + u2) / 2;
  switch (id) {
    case 'blink': return 4 + v * 30; case 'laugh': return 3 + v * 12; case 'brows': return Math.round(4 + v * 14);
    case 'balance': return 5 + v * 22; case 'bubbles': return Math.round(3 + v * 18); case 'reaction': return 300 + v * 900;
    case 'wink': return Math.round(1 + v * 14); case 'head': return Math.round(v * 22);
    default: return 25 + v * 70;
  }
}

window.Taswir = { GAMES, ORDER, Cam, Calib, calibrate, play, labelFor, simScore, duration, rng, shuffle, browGeo, ear };
})();
