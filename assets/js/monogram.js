/* Plays the P ∞ M write-on animation on a transparent canvas, so the page background shows through. */
(function () {
  function MonogramPlayer(canvas, data, opts) {
    this.canvas = canvas; this.data = data; this.opts = opts || {};
    this.meta = data.meta; this.ready = false;
  }

  MonogramPlayer.prototype.load = function () {
    var self = this, M = this.meta.size;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = M; c.height = M * 3;
          var cx = c.getContext('2d', { willReadFrequently: true });
          cx.drawImage(img, 0, 0);
          var px = cx.getImageData(0, 0, M, M * 3).data, N = M * M, list = [];
          for (var i = 0; i < N; i++) {
            if (px[i * 4 + 2] > 0 || px[(N + i) * 4 + 2] > 0) list.push(i);
          }
          var n = list.length;
          self.idx = new Uint32Array(n); self.P = new Float32Array(n); self.A = new Float32Array(n);
          self.TP = new Float32Array(n); self.TC = new Float32Array(n); self.E = new Float32Array(n);
          self.GX = new Float32Array(n);
          var k = self.meta.scale;
          for (var j = 0; j < n; j++) {
            var p = list[j], o1 = p * 4, o2 = (N + p) * 4, o3 = (2 * N + p) * 4;
            self.idx[j] = p;
            self.P[j] = px[o1] * 256 + px[o1 + 1];
            self.A[j] = px[o1 + 2] / 255;
            self.TP[j] = px[o2] * 256 + px[o2 + 1];
            self.TC[j] = px[o2 + 2] / 255;
            self.E[j] = px[o3] * 256 + px[o3 + 1];
            self.GX[j] = ((p % M) * k + 1) + 0.6 * (Math.floor(p / M) * k + 1);   // glint coordinate
          }
          self.canvas.width = M; self.canvas.height = M;
          self.ctx = self.canvas.getContext('2d');
          self.image = self.ctx.createImageData(M, M);
          self.ready = true;
          resolve(self);
        } catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = self.data.maps;
    });
  };

  MonogramPlayer.prototype.duration = function () {
    return (this.meta.head.length - 1) / this.meta.fps;
  };

  MonogramPlayer.prototype.headAt = function (t) {
    var H = this.meta.head, f = t * this.meta.fps;
    if (f <= 0) return H[0];
    if (f >= H.length - 1) return H[H.length - 1] + 1e6 * (f > H.length ? 1 : 0);
    var i = Math.floor(f), u = f - i;
    return H[i] + (H[i + 1] - H[i]) * u;
  };

  MonogramPlayer.prototype.draw = function (t) {
    var m = this.meta, h = this.headAt(t), band = m.band, buf = this.image.data;
    var g0 = m.glint[0], g1 = m.glint[1], glint = t > g0 && t < g1;
    var pos = glint ? -500 + ((t - g0) / (g1 - g0)) * (2 * m.S + 1000) : 0;
    var b = m.base, l = m.light, n = this.idx.length, inv2s2 = 1 / (2 * 120 * 120);
    for (var j = 0; j < n; j++) {
      var rev = (h - this.P[j]) / band; rev = rev < 0 ? 0 : rev > 1 ? 1 : rev; rev *= this.A[j];
      var a = rev;
      if (this.TC[j] > 0) {
        var br = (h - this.TP[j]) / band; br = br < 0 ? 0 : br > 1 ? 1 : br;
        var er = (h - this.E[j]) / band; er = er < 0 ? 0 : er > 1 ? 1 : er;
        br = this.TC[j] * br * (1 - er);
        if (br > a) a = br;
      }
      var o = this.idx[j] * 4;
      if (a <= 0) { buf[o + 3] = 0; continue; }
      var s = 0;
      if (glint) { var d = this.GX[j] - pos; s = 0.5 * Math.exp(-d * d * inv2s2); }
      buf[o] = b[0] + (l[0] - b[0]) * s;
      buf[o + 1] = b[1] + (l[1] - b[1]) * s;
      buf[o + 2] = b[2] + (l[2] - b[2]) * s;
      buf[o + 3] = a * 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
  };

  MonogramPlayer.prototype.play = function (from) {
    var self = this, dur = this.duration(), start = null;
    if (this._raf) cancelAnimationFrame(this._raf);
    from = from || 0;
    function step(now) {
      if (start === null) start = now;
      var t = from + (now - start) / 1000;
      if (t >= dur) { self.draw(dur + 1); self._raf = null; if (self.opts.onEnd) self.opts.onEnd(); return; }
      self.draw(t);
      self._raf = requestAnimationFrame(step);
    }
    this._raf = requestAnimationFrame(step);
  };

  MonogramPlayer.prototype.showFinal = function () { this.draw(this.duration() + 1); };

  window.MonogramPlayer = MonogramPlayer;
})();
