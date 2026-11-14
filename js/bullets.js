// 敵の弾とレーザー。弾の見た目は最初に一度だけ描いて使い回す。

const BulletSprites = (() => {
  const make = (w, h, fn) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    return c;
  };

  // 光る玉：外側のぼかし → 色のついた玉 → 白い芯
  const orb = (color, r) => make(r * 4, r * 4, (x, w) => {
    const c = w / 2;
    const g = x.createRadialGradient(c, c, r * 0.8, c, c, r * 2);
    g.addColorStop(0, color + 'aa');
    g.addColorStop(1, color + '00');
    x.fillStyle = g;
    x.fillRect(0, 0, w, w);
    x.fillStyle = 'rgba(0,0,0,0.55)';
    x.beginPath(); x.arc(c, c, r + 1, 0, Math.PI * 2); x.fill();
    x.fillStyle = color;
    x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(c, c, r * 0.55, 0, Math.PI * 2); x.fill();
  });

  // 十字の弾：長い方が進行方向（下）を向く
  const cross = (color, glow) => make(22, 32, (x) => {
    const g = x.createRadialGradient(11, 16, 2, 11, 16, 16);
    g.addColorStop(0, glow + '88');
    g.addColorStop(1, glow + '00');
    x.fillStyle = g;
    x.fillRect(0, 0, 22, 32);
    x.fillStyle = '#2a1000';
    x.fillRect(8, 3, 6, 26);
    x.fillRect(3, 8, 16, 6);
    x.fillStyle = color;
    x.fillRect(9, 4, 4, 24);
    x.fillRect(4, 9, 14, 4);
    x.fillStyle = '#fff';
    x.fillRect(10, 5, 2, 22);
    x.fillRect(5, 10, 12, 2);
  });

  // 火の玉：頭が進行方向（下）、尾が後ろに伸びる
  const flame = (inner, outer, size) => make(size * 2, size * 3.4, (x, w, h) => {
    const cx = w / 2, cy = h - size;
    x.fillStyle = outer + '66';
    x.beginPath(); x.arc(cx, cy, size, 0, Math.PI * 2); x.fill();
    x.fillStyle = outer;
    x.beginPath();
    x.moveTo(cx - size * 0.7, cy);
    x.quadraticCurveTo(cx - size * 0.3, cy - size * 1.4, cx, 0);
    x.quadraticCurveTo(cx + size * 0.3, cy - size * 1.4, cx + size * 0.7, cy);
    x.arc(cx, cy, size * 0.7, 0, Math.PI);
    x.fill();
    x.fillStyle = inner;
    x.beginPath(); x.arc(cx, cy, size * 0.42, 0, Math.PI * 2); x.fill();
  });

  // r は当たり判定の半径。rotate は進行方向に合わせて回転させるか。
  return {
    red:        { c: orb('#ff3050', 7), r: 5, rotate: false },
    redSmall:   { c: orb('#ff3050', 5), r: 3.5, rotate: false },
    redBig:     { c: orb('#ff2040', 13), r: 10, rotate: false },
    pink:       { c: orb('#ff5ac8', 6), r: 4.5, rotate: false },
    purple:     { c: orb('#b04cff', 7), r: 5, rotate: false },
    purpleBig:  { c: orb('#9a30ff', 13), r: 10, rotate: false },
    gold:       { c: orb('#ffcc33', 6), r: 4.5, rotate: false },
    blue:       { c: orb('#46a8ff', 6), r: 4.5, rotate: false },
    cross:      { c: cross('#ffd24a', '#ffcc33'), r: 4, rotate: true },
    crossRed:   { c: cross('#ff4a5a', '#ff2040'), r: 4, rotate: true },
    crossDark:  { c: cross('#c27aff', '#9a30ff'), r: 4, rotate: true },
    fire:       { c: flame('#fff3b0', '#ff7a1a', 7), r: 5, rotate: true, ay: 0.7 },
    firePurple: { c: flame('#f2d6ff', '#a63cff', 7), r: 5, rotate: true, ay: 0.7 },
    missile:    { c: flame('#ffffff', '#ff2a4a', 9), r: 6, rotate: true, ay: 0.7 },
  };
})();

const angleDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

class BulletSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.lasers = [];
  }

  // angle はラジアン（下向きが Math.PI/2）
  // opts: homing(秒) turn(rad/s) curve(rad/s) accel maxSpeed minSpeed at:{time, fn, remove} trail
  add(x, y, angle, speed, type = 'red', opts = {}) {
    const s = BulletSprites[type];
    const b = {
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      sprite: s.c, ay: s.ay ?? 0.5, r: s.r, rotate: s.rotate, t: 0, ...opts,
    };
    this.list.push(b);
    return b;
  }

  ring(x, y, n, speed, offset = 0, type = 'red', opts = {}) {
    for (let i = 0; i < n; i++) this.add(x, y, offset + (i / n) * Math.PI * 2, speed, type, opts);
  }

  fan(x, y, n, spread, center, speed, type = 'red', opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? center : center - spread / 2 + (spread * i) / (n - 1);
      this.add(x, y, a, speed, type, opts);
    }
  }

  // 予告線 → 太いビーム。from() を渡すと発射元に追従する。
  laser(opts) {
    const l = { warn: 1, dur: 1.2, width: 26, color: '255,40,80', sweep: 0, t: 0, ...opts };
    if (l.from) { const p = l.from(); l.x = p.x; l.y = p.y; }
    this.lasers.push(l);
    Sound.play('warn');
    return l;
  }

  update(dt) {
    const p = this.game.player;
    const W = this.game.W, H = this.game.H;
    for (const b of this.list) {
      b.t += dt;
      if (b.homing > 0 && p.alive) {
        b.homing -= dt;
        const sp = Math.hypot(b.vx, b.vy);
        const cur = Math.atan2(b.vy, b.vx);
        const want = Math.atan2(p.y - b.y, p.x - b.x);
        const turn = Math.max(-b.turn * dt, Math.min(b.turn * dt, angleDiff(want, cur)));
        b.vx = Math.cos(cur + turn) * sp;
        b.vy = Math.sin(cur + turn) * sp;
      }
      if (b.curve) {
        const c = Math.cos(b.curve * dt), s = Math.sin(b.curve * dt);
        const vx = b.vx * c - b.vy * s;
        b.vy = b.vx * s + b.vy * c;
        b.vx = vx;
      }
      if (b.accel) {
        const sp = Math.hypot(b.vx, b.vy) || 0.0001;
        const ns = Math.max(b.minSpeed ?? 0, Math.min(b.maxSpeed ?? 400, sp + b.accel * dt));
        b.vx *= ns / sp;
        b.vy *= ns / sp;
      }
      if (b.at && !b.fired && b.t >= b.at.time) {
        b.fired = true;
        b.at.fn(b, this);
        if (b.at.remove) b.dead = true;
      }
      if (b.trail) {
        b.trailT = (b.trailT ?? 0) + dt;
        if (b.trailT > 0.04) { b.trailT = 0; this.game.particles.spawn(b.x, b.y, 1, b.trail, 20, 0.3, 2); }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -40 || b.x > W + 40 || b.y < -60 || b.y > H + 40) b.dead = true;
    }
    this.list = this.list.filter((b) => !b.dead);

    for (const l of this.lasers) {
      l.t += dt;
      if (l.from) { const q = l.from(); l.x = q.x; l.y = q.y; }
      if (l.t > l.warn) l.angle += l.sweep * dt;
    }
    this.lasers = this.lasers.filter((l) => l.t < l.warn + l.dur);
  }

  // 当たったら true。かすった弾の数を graze に返す。
  collide(px, py, pr) {
    let hit = false, graze = 0;
    for (const b of this.list) {
      const d = Math.hypot(b.x - px, b.y - py);
      if (d < b.r + pr) hit = true;
      else if (!b.grazed && d < b.r + 16) { b.grazed = true; graze++; }
    }
    for (const l of this.lasers) {
      if (this.laserPower(l) < 0.6) continue;
      const dx = px - l.x, dy = py - l.y;
      const along = dx * Math.cos(l.angle) + dy * Math.sin(l.angle);
      const perp = Math.abs(-dx * Math.sin(l.angle) + dy * Math.cos(l.angle));
      if (along > 0 && perp < l.width * 0.4 + pr) hit = true;
    }
    return { hit, graze };
  }

  laserPower(l) {
    if (l.t < l.warn) return 0;
    const a = l.t - l.warn;
    return Math.max(0, Math.min(1, a / 0.12, (l.dur - a) / 0.2));
  }

  // ボムやフェーズ移行で弾を消す。消した弾は小さな光になって点数に変わる。
  clear(withScore = true) {
    for (const b of this.list) {
      this.game.particles.spawn(b.x, b.y, 1, '255,230,150', 40, 0.4, 2);
      if (withScore) this.game.score += 10;
    }
    this.list = [];
    this.lasers = [];
  }

  draw(ctx) {
    for (const l of this.lasers) {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.angle);
      if (l.t < l.warn) {
        ctx.fillStyle = `rgba(${l.color},${0.35 + 0.35 * Math.sin(l.t * 30)})`;
        ctx.fillRect(0, -1, 1200, 2);
      } else {
        const k = this.laserPower(l);
        const w = l.width * k;
        ctx.fillStyle = `rgba(${l.color},0.3)`;
        ctx.fillRect(0, -w * 0.9, 1200, w * 1.8);
        ctx.fillStyle = `rgba(${l.color},0.9)`;
        ctx.fillRect(0, -w / 2, 1200, w);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillRect(0, -w * 0.18, 1200, w * 0.36);
        ctx.fillStyle = `rgba(${l.color},0.6)`;
        ctx.beginPath(); ctx.arc(0, 0, w * 0.9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    for (const b of this.list) {
      const s = b.sprite;
      if (b.rotate) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx) - Math.PI / 2);
        ctx.drawImage(s, -s.width / 2, -s.height * b.ay);
        ctx.restore();
      } else {
        ctx.drawImage(s, b.x - s.width / 2, b.y - s.height / 2);
      }
    }
  }
}
