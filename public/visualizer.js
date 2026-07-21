(function () {
  "use strict";

  if (typeof THREE === "undefined") return;

  /* ===== Config ===== */
  const BANDS = 12;
  const HIST_W = 400;
  const FFT_SIZE = 2048;
  const FREQ_LO = 30;
  const FREQ_HI = 18000;
  const NM_RED = 780;
  const NM_VIOLET = 380;
  const SMOOTH = 1.0;
  const AMBIENT_SMOOTH = 0.04;

  const ORBIT_SPEED = 0.06;
  const ORBIT_RADIUS = 9;
  const ORBIT_HEIGHT = 14;
  const CHART_SIZE = 6;
  const PEAK_HEIGHT = 4.0;

  /* Catmull-Rom spline: returns smoothed Y values for an input array */
  function catmullRom(src, outLen) {
    const out = new Float32Array(outLen);
    const n = src.length;
    for (let i = 0; i < outLen; i++) {
      const t = (i / (outLen - 1)) * (n - 1);
      const idx = Math.floor(t);
      const frac = t - idx;

      const p0 = src[Math.max(0, idx - 1)];
      const p1 = src[idx];
      const p2 = src[Math.min(n - 1, idx + 1)];
      const p3 = src[Math.min(n - 1, idx + 2)];

      const t2 = frac * frac;
      const t3 = t2 * frac;
      out[i] = 0.5 * (
        (2 * p1) +
        (-p0 + p2) * frac +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3
      );
    }
    return out;
  }

  /* ===== Hz helpers ===== */

  function hzToNm(hz) {
    const t = Math.log(hz / FREQ_LO) / Math.log(FREQ_HI / FREQ_LO);
    return NM_RED - t * (NM_RED - NM_VIOLET);
  }

  function nmToRGB(nm) {
    let r, g, b;
    if      (nm < 380) { r = 0; g = 0; b = 0; }
    else if (nm < 440) { r = -(nm - 440) / 60; g = 0; b = 1; }
    else if (nm < 490) { r = 0; g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { r = 0; g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; b = 0; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; b = 0; }
    else if (nm <= 780){ r = 1; g = 0; b = 0; }
    else               { r = 0; g = 0; b = 0; }
    let f;
    if      (nm >= 380 && nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
    else if (nm <= 700)             f = 1.0;
    else if (nm <= 780)             f = 0.3 + 0.7 * (780 - nm) / 80;
    else                            f = 0;
    return [r * f, g * f, b * f];
  }

  function hzToRGB(hz) { return nmToRGB(hzToNm(hz)); }

  /* ===== Visualizer ===== */

  class Visualizer {
    constructor(canvas) {
      this.canvas = canvas;

      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      this.renderer.setClearColor(0x0a0a0a, 1);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      this.aspect = 1;

      this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
      this.scene = new THREE.Scene();

      this.audioCtx = null;
      this.analyser = null;
      this.rawData = null;
      this.sampleRate = 44100;
      this.binCount = FFT_SIZE / 2;
      this.smoothed = new Float32Array(this.binCount);
      this.connected = false;
      this.isPlaying = false;

      this.bandAvg = new Float32Array(BANDS).fill(0.15);
      this.bandPeak = new Float32Array(BANDS).fill(0.3);
      this.bandDisplay = new Float32Array(BANDS);
      this.bandBinMap = [];

      this.history = [];
      for (let b = 0; b < BANDS; b++) {
        this.history.push(new Float32Array(HIST_W));
      }
      this.writeCol = 0;

      this.time = 0;
      this.lastTime = performance.now() / 1000;

      this._resize();
      window.addEventListener("resize", () => this._resize());
      this._buildBandMap(this.sampleRate);
      this._buildRidges();
      this._loop();
    }

    _resize() {
      const p = this.canvas.parentElement;
      const w = p.clientWidth;
      const h = p.clientHeight;
      this.aspect = w / h;
      this.renderer.setSize(w, h);
      this.camera.aspect = this.aspect;
      this.camera.updateProjectionMatrix();
    }

    _buildBandMap(sr) {
      this.sampleRate = sr;
      const hzPerBin = sr / FFT_SIZE;
      this.bandBinMap = [];
      for (let i = 0; i < BANDS; i++) {
        const f0 = FREQ_LO * Math.pow(FREQ_HI / FREQ_LO, i / BANDS);
        const f1 = FREQ_LO * Math.pow(FREQ_HI / FREQ_LO, (i + 1) / BANDS);
        const b0 = Math.max(0, Math.floor(f0 / hzPerBin));
        const b1 = Math.min(this.binCount, Math.max(Math.ceil(f1 / hzPerBin), b0 + 1));
        this.bandBinMap.push([b0, b1]);
      }
    }

    /* ---- audio ---- */

    connectAudio(el) {
      if (this.connected) return;
      try {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this._buildBandMap(this.audioCtx.sampleRate);
        const src = this.audioCtx.createMediaElementSource(el);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = FFT_SIZE;
        this.analyser.minDecibels = -60;
        this.analyser.maxDecibels = -10;
        this.analyser.smoothingTimeConstant = 0.05;
        src.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
        this.rawData = new Uint8Array(this.analyser.frequencyBinCount);
        this.connected = true;
      } catch (e) {
        console.warn("Visualizer: connect failed", e);
      }
    }

    resumeCtx() {
      if (this.audioCtx && this.audioCtx.state === "suspended")
        this.audioCtx.resume();
    }

    /* ---- frequency ---- */

    _freq() {
      if (this.connected && this.analyser && this.isPlaying) {
        this.analyser.getByteFrequencyData(this.rawData);
        let sum = 0;
        for (let i = 0; i < this.rawData.length; i++) sum += this.rawData[i];
        if (sum > 200) {
          for (let i = 0; i < this.binCount; i++) {
            const r = this.rawData[i] / 255;
            this.smoothed[i] += (r - this.smoothed[i]) * SMOOTH;
          }
          return;
        }
      }
      const t = this.time;
      const boost = this.isPlaying ? 1.4 : 0.5;
      for (let i = 0; i < this.binCount; i++) {
        const f = i / this.binCount;
        const fall = Math.pow(1 - f, 1.6);
        const v =
          (0.15 +
            Math.sin(t * 0.4 + f * 5) * 0.1 +
            Math.sin(t * 0.7 + f * 10 + 1.2) * 0.08 +
            Math.cos(t * 1.0) * 0.06 * (1 - f)) *
          fall * boost;
        this.smoothed[i] +=
          (Math.max(0, Math.min(1, v)) - this.smoothed[i]) * AMBIENT_SMOOTH;
      }
    }

    /* ---- history ---- */

    _updateHistory() {
      for (let b = 0; b < BANDS; b++) {
        const [lo, hi] = this.bandBinMap[b];
        let s = 0;
        for (let j = lo; j < hi && j < this.binCount; j++) s += this.smoothed[j];
        const raw = s / (hi - lo);

        this.bandAvg[b] += (raw - this.bandAvg[b]) * 0.003;

        if (raw > this.bandPeak[b]) this.bandPeak[b] = raw;
        else this.bandPeak[b] += (raw - this.bandPeak[b]) * 0.003;

        const floor = this.bandAvg[b] * 0.92;
        const range = Math.max(this.bandPeak[b] - floor, 0.01);
        const norm = Math.min(1, Math.max(0, (raw - floor) / range));

        if (norm > this.bandDisplay[b]) {
          this.bandDisplay[b] = norm;
        } else {
          this.bandDisplay[b] *= 0.55;
        }

        this.history[b][this.writeCol] = this.bandDisplay[b];
      }
      this.writeCol = (this.writeCol + 1) % HIST_W;
    }

    /* ---- build 3D ridges ---- */

    _buildRidges() {
      this.ridgeLines = [];

      for (let b = 0; b < BANDS; b++) {
        const bandT = b / (BANDS - 1);
        const hz = FREQ_LO * Math.pow(FREQ_HI / FREQ_LO, bandT);
        const [cr, cg, cb] = hzToRGB(hz);
        const color = new THREE.Color(cr, cg, cb);

        const z = -CHART_SIZE / 2 + bandT * CHART_SIZE;

        /* Line on top */
        const linePos = new Float32Array(HIST_W * 3);
        for (let i = 0; i < HIST_W; i++) {
          linePos[i * 3] = -CHART_SIZE / 2 + (i / (HIST_W - 1)) * CHART_SIZE;
          linePos[i * 3 + 1] = 0;
          linePos[i * 3 + 2] = z;
        }
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
        const lineMat = new THREE.LineBasicMaterial({
          color,
          linewidth: 1,
          transparent: true,
          opacity: 0.95,
        });
        const line = new THREE.Line(lineGeo, lineMat);
        this.scene.add(line);

        /* Filled mesh underneath: triangle strip from ridge top down to y=0 */
        const fillVerts = new Float32Array(HIST_W * 2 * 3);
        const fillGeo = new THREE.BufferGeometry();
        fillGeo.setAttribute("position", new THREE.BufferAttribute(fillVerts, 3));
        const indices = [];
        for (let i = 0; i < HIST_W - 1; i++) {
          const top = i * 2;
          const bot = i * 2 + 1;
          const topNext = (i + 1) * 2;
          const botNext = (i + 1) * 2 + 1;
          indices.push(top, bot, topNext);
          indices.push(bot, botNext, topNext);
        }
        fillGeo.setIndex(indices);
        const fillMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.15,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const fillMesh = new THREE.Mesh(fillGeo, fillMat);
        this.scene.add(fillMesh);

        this.ridgeLines.push({ line, lineGeo, fillGeo, z });
      }
    }

    _smoothPass(arr, passes) {
      for (let p = 0; p < passes; p++) {
        for (let i = 1; i < arr.length - 1; i++) {
          arr[i] = arr[i] * 0.5 + (arr[i - 1] + arr[i + 1]) * 0.25;
        }
      }
    }

    _updateRidges() {
      const raw = new Float32Array(HIST_W);

      for (let b = 0; b < BANDS; b++) {
        for (let i = 0; i < HIST_W; i++) {
          raw[i] = this.history[b][(this.writeCol + i) % HIST_W];
        }

        this._smoothPass(raw, 3);
        const smooth = catmullRom(raw, HIST_W);

        const lineAttr = this.ridgeLines[b].lineGeo.getAttribute("position");
        const lineArr = lineAttr.array;
        const fillAttr = this.ridgeLines[b].fillGeo.getAttribute("position");
        const fillArr = fillAttr.array;
        const z = this.ridgeLines[b].z;

        for (let i = 0; i < HIST_W; i++) {
          const x = -CHART_SIZE / 2 + (i / (HIST_W - 1)) * CHART_SIZE;
          const y = Math.max(0, smooth[i]) * PEAK_HEIGHT;

          lineArr[i * 3 + 1] = y;

          const ti = i * 2;
          fillArr[ti * 3] = x;
          fillArr[ti * 3 + 1] = y;
          fillArr[ti * 3 + 2] = z;
          fillArr[(ti + 1) * 3] = x;
          fillArr[(ti + 1) * 3 + 1] = 0;
          fillArr[(ti + 1) * 3 + 2] = z;
        }

        lineAttr.needsUpdate = true;
        fillAttr.needsUpdate = true;
      }
    }

    /* ---- camera orbit ---- */

    _updateCamera() {
      const angle = this.time * ORBIT_SPEED;
      this.camera.position.set(
        Math.sin(angle) * ORBIT_RADIUS,
        ORBIT_HEIGHT,
        Math.cos(angle) * ORBIT_RADIUS
      );
      this.camera.lookAt(0, 0.3, 0);
    }

    /* ---- loop ---- */

    _loop() {
      requestAnimationFrame(() => this._loop());
      const now = performance.now() / 1000;
      const dt = Math.min(now - this.lastTime, 0.06);
      this.lastTime = now;
      this.time += dt;

      this._freq();
      this._updateHistory();
      this._updateRidges();
      this._updateCamera();

      this.renderer.render(this.scene, this.camera);
    }
  }

  /* ===== Bootstrap ===== */
  const canvas = document.getElementById("visualizer-canvas");
  if (!canvas) return;

  const viz = new Visualizer(canvas);

  function hookAudio() {
    const audio = window.__wsAudio;
    if (!audio) {
      requestAnimationFrame(hookAudio);
      return;
    }
    audio.addEventListener("play", () => {
      viz.connectAudio(audio);
      viz.resumeCtx();
      viz.isPlaying = true;
    });
    audio.addEventListener("pause", () => {
      viz.isPlaying = false;
    });
    if (!audio.paused) {
      viz.connectAudio(audio);
      viz.resumeCtx();
      viz.isPlaying = true;
    }
  }
  hookAudio();
})();
