// ボスの定義。見た目・動き・フェーズごとの攻撃パターンをここにまとめる。
// 新しいボスを足すときは BOSS_DEFS に1つ追加するだけでよい。

const TAU = Math.PI * 2;
const DOWN = Math.PI / 2;

// 画像に色をかぶせた版を作る（ダメージ時の白フラッシュや闇堕ち表現に使う）
function tintImage(img, color, mode = 'source-atop') {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = mode;
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

class Boss {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.img = game.images[def.image];
    this.scale = def.scale;
    this.w = this.img.width * this.scale;
    this.h = this.img.height * this.scale;
    this.x = game.W / 2;
    this.y = -this.h / 2;
    this.homeY = def.y;
    this.phase = 0;
    this.hp = def.phases[0].hp;
    this.t = 0;
    this.pt = 0;
    this.dt = 0;
    this.timers = {};
    this.vars = {};
    this.entering = true;
    this.invuln = 0;
    this.flash = 0;
    this.dying = 0;
    this.dead = false;
    this.white = tintImage(this.img, '#ffffff', 'source-in');
    this.looks = def.phases.map((p) => (p.tint ? tintImage(this.img, p.tint) : this.img));
  }

  get name() { return this.def.name; }
  get phaseDef() { return this.def.phases[this.phase]; }
  get maxHp() { return this.phaseDef.hp; }

  // 画像内の座標（元画像のピクセル）→ 画面座標
  point(sx, sy) {
    return { x: this.x + (sx - this.img.width / 2) * this.scale, y: this.y + (sy - this.img.height / 2) * this.scale };
  }

  aim(from) {
    const p = this.game.player;
    return Math.atan2(p.y - from.y, p.x - from.x);
  }

  // interval 秒ごとに true を返す
  every(key, interval) {
    const st = this.timers[key] ?? (this.timers[key] = { t: interval * 0.5 });
    st.t += this.dt;
    if (st.t >= interval) { st.t -= interval; return true; }
    return false;
  }

  // interval 秒ごとに、gap 秒間隔で count 回 fn を呼ぶ（連射）
  burst(key, interval, count, gap, fn) {
    const st = this.timers[key] ?? (this.timers[key] = { t: interval * 0.5, n: 0, g: 0 });
    st.t += this.dt;
    if (st.n === 0 && st.t >= interval) { st.t = 0; st.n = count; st.g = 0; }
    if (st.n > 0) {
      st.g -= this.dt;
      if (st.g <= 0) { fn(count - st.n); st.n--; st.g = gap; }
    }
  }

  update(dt) {
    if (this.dead) return; // 倒れたボスは何もしない
    this.dt = dt;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.dying > 0) {
      this.dying -= dt;
      if (Math.random() < 0.5) {
        const px = this.x + (Math.random() - 0.5) * this.w * 0.7;
        const py = this.y + (Math.random() - 0.5) * this.h * 0.7;
        this.game.particles.spawn(px, py, 12, Math.random() < 0.5 ? '255,200,80' : '255,60,60', 160, 0.6, 3);
        if (Math.random() < 0.3) Sound.play('explode');
      }
      this.game.shake = Math.max(this.game.shake, 5);
      if (this.dying <= 0) this.dead = true;
      return;
    }
    if (this.entering) {
      this.y += (this.homeY - this.y) * Math.min(1, dt * 1.6);
      if (Math.abs(this.y - this.homeY) < 1.5) { this.entering = false; this.y = this.homeY; }
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.pt += dt;
    this.def.move(this, dt);
    if (this.invuln <= 0) this.phaseDef.attack(this, this.game.bullets);
    if (this.phaseDef.aura && Math.random() < 0.6) {
      const a = Math.random() * TAU;
      this.game.particles.spawn(this.x + Math.cos(a) * this.w * 0.35, this.y + Math.sin(a) * this.h * 0.35, 1, this.phaseDef.aura, 40, 0.8, 3, -60);
    }
  }

  hitTest(x, y) {
    const hb = this.def.hitbox;
    const cx = this.x + (hb.x - this.img.width / 2) * this.scale;
    const cy = this.y + (hb.y - this.img.height / 2) * this.scale;
    const dx = (x - cx) / (hb.rx * this.scale), dy = (y - cy) / (hb.ry * this.scale);
    return dx * dx + dy * dy < 1;
  }

  damage(n) {
    if (this.dead || this.entering || this.dying > 0 || this.invuln > 0) return false; // 撃破とボムの二重判定防止
    this.hp -= n;
    this.flash = 0.04;
    this.game.score += 10 * n;
    if (this.hp <= 0) this.nextPhase();
    return true;
  }

  nextPhase() {
    const g = this.game;
    g.score += 5000 * (this.phase + 1);
    if (this.phase + 1 >= this.def.phases.length) {
      this.dying = 2.6;
      this.hp = 0;
      g.bullets.clear();
      g.flashScreen('255,255,255', 0.8);
      Sound.play('phase');
      g.bossDying(this);
      return;
    }
    this.phase++;
    this.hp = this.phaseDef.hp;
    this.pt = 0;
    this.timers = {};
    this.vars = {};
    this.invuln = 1.6;
    g.bullets.clear();
    g.shake = 14;
    g.flashScreen(this.phaseDef.flash ?? '255,40,60', 0.9);
    g.particles.spawn(this.x, this.y, 60, this.phaseDef.aura ?? '255,80,80', 260, 1, 3);
    Sound.play('phase');
    g.showBanner(this.phaseDef.name, this.phaseDef.flash ?? '255,60,80');
    if (this.def.onPhase) this.def.onPhase(this, g);
  }

  draw(ctx) {
    if (this.dead) return;
    const look = this.looks[this.phase];
    const bob = Math.sin(this.t * 2.2) * 3;
    let dx = Math.round(this.x - this.w / 2), dy = Math.round(this.y - this.h / 2 + bob);
    if (this.dying > 0) { dx += (Math.random() - 0.5) * 8; dy += (Math.random() - 0.5) * 8; }
    ctx.imageSmoothingEnabled = false;
    if (this.invuln > 0 && Math.floor(this.t * 16) % 2 === 0) ctx.globalAlpha = 0.5;
    if (this.def.drawBehind) this.def.drawBehind(this, ctx, dx, dy);
    ctx.drawImage(look, dx, dy, this.w, this.h);

    // 最終形態：画像の一部が横にずれるノイズ
    if (this.phaseDef.glitch && Math.random() < 0.3) {
      for (let i = 0; i < 3; i++) {
        const sy = Math.floor(Math.random() * look.height);
        const sh = 1 + Math.floor(Math.random() * 6);
        const off = (Math.random() - 0.5) * 30;
        ctx.drawImage(look, 0, sy, look.width, sh, dx + off, dy + sy * this.scale, this.w, sh * this.scale);
      }
    }
    // 被弾中は白く点滅（撃ち続けても姿が見えるよう薄めに）
    const blink = this.flash > 0 && Math.floor(this.t * 30) % 3 === 0;
    if (blink || (this.dying > 0 && Math.random() < 0.3)) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.white, dx, dy, this.w, this.h);
    }
    ctx.globalAlpha = 1;
    if (this.def.drawFront) this.def.drawFront(this, ctx, dx, dy);
  }
}

// ---------------- ボスの設定 ----------------

const BOSS_DEFS = [
  {
    // 小：素早く動き回る。前方に3発を連射、たまに左右に広がる。
    id: 'small',
    name: 'クリムゾン・ヒナ',
    rank: '小',
    image: 'boss_s',
    scale: 1.4,
    y: 140,
    hitbox: { x: 40, y: 52, rx: 26, ry: 34 },
    background: () => 1,
    move(b, dt) {
      const k = b.phase === 0 ? 1 : 1.5;
      b.vars.m = (b.vars.m ?? 0) + dt * k;
      b.x = b.game.W / 2 + Math.sin(b.vars.m * 1.6) * 150 + Math.sin(b.vars.m * 3.7) * 30;
      b.y = b.homeY + Math.sin(b.vars.m * 2.3) * 30;
    },
    phases: [
      {
        name: '見習いの羽ばたき',
        hp: 170,
        attack(b, B) {
          const m = b.point(50, 36);
          b.burst('aim', 1.0, 1, 0.09, () => B.add(m.x, m.y, b.aim(m), 240, 'red'));
          if (b.every('fan', 3.2)) B.fan(m.x, m.y, 5, 1.0, DOWN, 170, 'pink');
        },
      },
      {
        name: '赤い目覚め',
        hp: 170,
        tint: 'rgba(255,0,40,0.18)',
        aura: '255,60,80',
        attack(b, B) {
          const m = b.point(50, 36);
          b.burst('aim', 1.0, 3, 0.09, () => B.add(m.x, m.y, b.aim(m), 240, 'red'));
          if (b.every('fan', 3.2)) B.fan(m.x, m.y, 5, 1.0, DOWN, 170, 'pink');
        },
      },
    ],
  },
  {
    // 中：不規則な動き。5発連射、上下左右に広がる弾。
    id: 'medium',
    name: 'クリムゾン・ホーク',
    rank: '中',
    image: 'boss_m',
    scale: 1.6,
    y: 150,
    hitbox: { x: 72, y: 55, rx: 34, ry: 40 },
    background: () => 2,
    move(b, dt) {
      const W = b.game.W;
      if (b.every('retarget', b.phase === 0 ? 1.8 : 1.2)) {
        b.vars.tx = 100 + Math.random() * (W - 200);
        b.vars.ty = b.homeY - 30 + Math.random() * 80;
      }
      b.x += ((b.vars.tx ?? b.x) - b.x) * Math.min(1, dt * 2.2);
      b.y += ((b.vars.ty ?? b.y) - b.y) * Math.min(1, dt * 2.2);
    },
    phases: [
      {
        name: '狩りの構え',
        hp: 420,
        attack(b, B) {
          const m = b.point(72, 40);
          b.burst('stream', 1.5, 5, 0.08, () => B.add(m.x, m.y, b.aim(m), 270, 'red'));
          if (b.every('cross', 2.2)) {
            b.vars.rot = (b.vars.rot ?? 0) + 0.4;
            for (let k = 0; k < 4; k++) {
              B.add(m.x, m.y, b.vars.rot + (k * TAU) / 4, 110, 'redBig', {
                at: { time: 0.75, remove: true, fn: (s, BB) => BB.ring(s.x, s.y, 8, 140, Math.random(), 'redSmall') },
              });
            }
          }
        },
      },
      {
        name: '血走る眼光',
        hp: 480,
        tint: 'rgba(255,0,40,0.25)',
        aura: '255,50,70',
        attack(b, B) {
          const m = b.point(72, 40);
          b.burst('fan', 1.1, 2, 0.15, () => B.fan(m.x, m.y, 5, 0.6, b.aim(m), 240, 'red'));
          if (b.every('spin', 0.15)) {
            b.vars.rot = (b.vars.rot ?? 0) + 0.13;
            for (let k = 0; k < 4; k++) B.add(m.x, m.y, b.vars.rot + (k * TAU) / 4, 150, 'pink');
          }
          if (b.every('bomb', 3)) {
            B.add(m.x, m.y, b.aim(m), 120, 'redBig', {
              at: { time: 0.9, remove: true, fn: (s, BB) => BB.ring(s.x, s.y, 16, 150, 0, 'red') },
            });
          }
        },
      },
    ],
  },
  {
    // 大：圧倒的な存在感。大量の弾、円形弾、追尾弾、レーザー。
    id: 'large',
    name: 'ブラッド・フェニックス',
    rank: '大',
    image: 'boss_l',
    scale: 2,
    y: 175,
    hitbox: { x: 99, y: 72, rx: 40, ry: 52 },
    background: () => 3,
    move(b) {
      b.x = b.game.W / 2 + Math.sin(b.pt * 0.6) * 80;
      b.y = b.homeY + Math.sin(b.pt * 1.1) * 15;
    },
    phases: [
      {
        name: '紅蓮の翼',
        hp: 850,
        aura: '255,40,60',
        attack(b, B) {
          const m = b.point(99, 45);
          if (b.every('spiral', 0.06)) {
            b.vars.rot = (b.vars.rot ?? 0) + 0.21;
            B.add(m.x, m.y, b.vars.rot, 150, 'purple');
            B.add(m.x, m.y, b.vars.rot + Math.PI, 150, 'purple');
          }
          if (b.every('missile', 3.5)) {
            for (const [sx, sy, a] of [[20, 30, -2.3], [40, 40, -2.0], [178, 30, -0.8], [158, 40, -1.1]]) {
              const p = b.point(sx, sy);
              B.add(p.x, p.y, a, 170, 'missile', { homing: 1.6, turn: 2.6, trail: '255,60,80' });
            }
          }
        },
      },
      {
        name: '滅びの咆哮',
        hp: 950,
        tint: 'rgba(255,0,30,0.28)',
        aura: '255,30,50',
        attack(b, B) {
          const m = b.point(99, 45);
          if (b.every('ring', 1.1)) {
            b.vars.flip = !b.vars.flip;
            B.ring(m.x, m.y, 28, 130, b.vars.flip ? Math.PI / 28 : 0, 'red');
            B.ring(m.x, m.y, 14, 90, 0, 'purple', { curve: b.vars.flip ? 0.4 : -0.4 });
          }
          if (b.every('laser', 5.5)) {
            const ang = b.aim(m);
            B.laser({ from: () => b.point(99, 45), angle: ang, warn: 1.0, dur: 1.3, width: 30 });
          }
          if (b.every('missile', 4)) {
            for (let i = 0; i < 6; i++) {
              const p = b.point(i < 3 ? 25 + i * 15 : 128 + (i - 3) * 15, 35);
              B.add(p.x, p.y, -DOWN + (i < 3 ? -0.9 : 0.9), 180, 'missile', { homing: 1.8, turn: 2.8, trail: '255,60,80' });
            }
          }
        },
      },
    ],
  },
  {
    // ラスボス。形態が変わるたびに背景の聖堂も崩れていく。
    id: 'xavier',
    name: '聖フランシスコ・ザビエル',
    rank: '終',
    image: 'xavier',
    scale: 3,
    y: 215,
    hitbox: { x: 78, y: 80, rx: 34, ry: 45 },
    cathedral: true,
    move(b) {
      b.x = b.game.W / 2 + Math.sin(b.pt * 0.5) * 30;
      b.y = b.homeY + Math.sin(b.pt * 0.9) * 8;
      if (b.phase === 2) { b.x += (Math.random() - 0.5) * 3; b.y += (Math.random() - 0.5) * 3; }
    },
    onPhase(b, g) { g.bg.setStage(b.phase + 1); },
    drawFront(b, ctx) {
      // 燃える心臓の脈動
      const h = b.point(87, 50);
      const r = 26 + Math.sin(b.t * (b.phase === 2 ? 9 : 4)) * 6 + b.phase * 8;
      const col = b.phase === 2 ? '255,20,60' : '255,140,40';
      const g = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, r);
      g.addColorStop(0, `rgba(${col},0.7)`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    },
    phases: [
      {
        name: '聖者',
        hp: 1300,
        flash: '255,220,120',
        attack(b, B) {
          const halo = b.point(72, 29), hand = b.point(19, 34), heart = b.point(87, 50);
          if (b.every('rain', 0.09)) {
            b.vars.rot = (b.vars.rot ?? 0) + 0.5;
            const s = Math.sin(b.vars.rot) * 1.2;
            B.add(halo.x, halo.y, DOWN + s, 160, 'cross');
            B.add(halo.x, halo.y, DOWN - s, 160, 'cross');
          }
          if (b.every('hand', 1.8)) B.fan(hand.x, hand.y, 7, 0.7, b.aim(hand), 200, 'gold');
          if (b.every('ring', 4)) B.ring(heart.x, heart.y, 20, 120, Math.random(), 'cross');
        },
      },
      {
        name: '殉教の焔',
        hp: 1700,
        tint: 'rgba(200,10,30,0.38)',
        aura: '255,90,40',
        flash: '255,60,40',
        attack(b, B) {
          const hand = b.point(19, 34), heart = b.point(87, 50);
          if (b.every('fire', 0.85)) {
            b.vars.flip = !b.vars.flip;
            B.ring(heart.x, heart.y, 14, 140, Math.random(), 'fire', { curve: b.vars.flip ? 0.5 : -0.5 });
          }
          b.burst('cross', 1.6, 3, 0.12, () => B.fan(hand.x, hand.y, 3, 0.3, b.aim(hand), 260, 'crossRed'));
          if (b.every('laser', 6)) {
            b.vars.dir = b.vars.dir === 1 ? -1 : 1;
            const from = () => b.point(116, 18);
            const p = from();
            B.laser({ from, angle: b.aim(p) - 0.55 * b.vars.dir, sweep: 0.45 * b.vars.dir, warn: 1.0, dur: 2.4, width: 22, color: '255,120,40' });
          }
        },
      },
      {
        name: '堕ちたる聖者',
        hp: 2000,
        tint: 'rgba(40,0,70,0.62)',
        aura: '170,60,255',
        flash: '160,40,255',
        glitch: true,
        attack(b, B) {
          const halo = b.point(72, 29), heart = b.point(87, 50), cross = b.point(116, 18);
          if (b.every('spiral', 0.075)) {
            b.vars.rot = (b.vars.rot ?? 0) + 0.19;
            B.add(halo.x, halo.y, b.vars.rot, 140, 'crossDark');
            B.add(halo.x, halo.y, b.vars.rot + Math.PI, 140, 'crossDark');
          }
          if (b.every('ring', 1.4)) B.ring(heart.x, heart.y, 24, 100, Math.random(), 'firePurple', { accel: 60, maxSpeed: 220 });
          if (b.every('missile', 3.2)) {
            for (const a of [-2.4, -DOWN, -0.7]) B.add(cross.x, cross.y, a, 170, 'missile', { homing: 1.7, turn: 2.6, trail: '200,80,255' });
          }
          if (b.every('laser', 7)) {
            const a = b.aim(heart);
            for (const o of [-0.5, 0, 0.5]) B.laser({ from: () => b.point(87, 50), angle: a + o, warn: 1.2, dur: 1.4, width: 24, color: '180,40,255' });
          }
        },
      },
    ],
  },
];
