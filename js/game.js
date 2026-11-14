// ゲーム全体の進行（タイトル → ボス戦 ×4 → クリア）と画面描画

class Particles {
  constructor() { this.list = []; }

  // drift は上下方向の初速の上乗せ（負で上に昇る）
  spawn(x, y, n, color, speed, life, size = 2, drift = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.2 + Math.random() * 0.8);
      const l = life * (0.5 + Math.random() * 0.5);
      this.list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + drift, life: l, max: l, color, size });
    }
  }

  update(dt) {
    for (const p of this.list) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx) {
    for (const p of this.list) {
      ctx.fillStyle = `rgba(${p.color},${Math.max(0, p.life / p.max)})`;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
  }
}

const FONT = '"DotGothic16", "MS Gothic", monospace';
const GOD_COMMAND = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];

class Game {
  constructor(canvas, images) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.images = images;
    this.state = 'title';
    this.t = 0;
    this.skies = { 1: new SkyBackground(this.W, this.H, images, 1), 2: new SkyBackground(this.W, this.H, images, 2), 3: new SkyBackground(this.W, this.H, images, 3) };
    this.cathedral = new CathedralBackground(this.W, this.H, images);
    this.bg = this.skies[1];
    this.particles = new Particles();
    this.bullets = new BulletSystem(this);
    this.shots = [];
    this.player = null;
    this.boss = null;
    this.score = 0;
    this.shake = 0;
    this.flash = null;
    this.banner = null;
    this.bombT = 0;
    this.bombFx = null;
    this.hitSoundT = 0;
    this.grazeSoundT = 0;
    this.highScore = 0;
    try { this.highScore = Number(localStorage.getItem('xavier-hi')) || 0; } catch (e) { /* 保存できない環境では無視 */ }
  }

  // ---------- 進行 ----------

  newRun(bossIndex) {
    this.score = 0;
    this.runTime = 0;
    this.player = new Player(this);
    this.bossIndex = bossIndex;
    this.startBoss();
  }

  startBoss() {
    const def = BOSS_DEFS[this.bossIndex];
    if (def.cathedral) { this.cathedral.setStage(1); this.bg = this.cathedral; } else { this.bg = this.skies[def.background()]; }
    this.boss = new Boss(this, def);
    this.bullets = new BulletSystem(this);
    this.shots = [];
    this.state = 'intro';
    this.introT = 3;
    this.warnBeeps = 0;
  }

  bossDying() {
    this.state = 'defeat';
    this.defeatT = 4;
    this.showBanner('撃破！', '255,220,120');
  }

  gameOver() {
    this.state = 'gameover';
    this.saveHigh();
  }

  saveHigh() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      try { localStorage.setItem('xavier-hi', String(this.highScore)); } catch (e) { /* 無視 */ }
    }
  }

  useBomb() {
    const p = this.player;
    if (!p.alive || p.bombs <= 0 || this.bombT > 0) return;
    p.bombs--;
    this.bombT = 1.3;
    p.invuln = Math.max(p.invuln, 1.6);
    this.bullets.clear();
    if (this.boss && !this.boss.entering) this.boss.damage(40);
    this.bombFx = { x: p.x, y: p.y, t: 0 };
    this.flashScreen('255,240,200', 0.7);
    this.shake = 10;
    Sound.play('bomb');
  }

  flashScreen(color, alpha) { this.flash = { color, a: alpha }; }
  showBanner(text, color) { this.banner = { text, color, t: 2.2 }; }

  // ---------- 更新 ----------

  update(dt) {
    this.t += dt;
    if (Input.hit('KeyM')) Sound.muted = !Sound.muted;
    const start = Input.hit('KeyZ', 'Space', 'Enter') || Input.tapped;

    // 隠しコマンド：↑↑↓↓←→←→ で無敵モードの切り替え（タイトルでも戦闘中でも可）
    if (Input.typed(GOD_COMMAND)) {
      this.godMode = !this.godMode;
      Sound.play(this.godMode ? 'phase' : 'select');
      this.flashScreen(this.godMode ? '255,220,120' : '120,120,160', 0.6);
      this.showBanner(this.godMode ? '無敵モード ON' : '無敵モード OFF', '255,220,120');
    }

    switch (this.state) {
      case 'title':
        this.skies[3].update(dt);
        for (let i = 0; i < 4; i++) {
          if (Input.hit('Digit' + (i + 1), 'Numpad' + (i + 1))) { Sound.play('select'); this.newRun(i); return; }
        }
        if (start) { Sound.play('select'); this.newRun(0); }
        break;
      case 'paused':
        if (Input.hit('KeyP', 'Escape') || Input.tapped) this.state = this.prevState;
        break;
      case 'gameover':
        this.bg.update(dt);
        this.particles.update(dt);
        if (Input.hit('Escape')) { this.state = 'title'; return; }
        if (start) { Sound.play('select'); this.newRun(this.bossIndex); }
        break;
      case 'clear':
        this.skies[1].update(dt);
        this.particles.update(dt);
        if (Math.random() < 0.15) this.particles.spawn(Math.random() * this.W, Math.random() * this.H * 0.6, 20, Math.random() < 0.5 ? '255,220,120' : '255,120,160', 150, 1, 3);
        if (start && this.t - this.clearAt > 1.5) { this.state = 'title'; }
        break;
      default:
        if (Input.hit('KeyP', 'Escape')) { this.prevState = this.state; this.state = 'paused'; return; }
        this.updatePlay(dt);
    }
  }

  updatePlay(dt) {
    this.runTime += dt;
    // 無敵モード中は K で今のフェーズを飛ばせる
    const b = this.boss;
    if (this.godMode && Input.hit('KeyK') && b && !b.entering && b.dying <= 0 && b.invuln <= 0) {
      b.hp = 0;
      b.nextPhase();
    }
    this.bg.update(dt);
    this.player.update(dt);
    if (this.state === 'gameover') return;
    this.boss.update(dt);
    this.bullets.update(dt);
    this.hitSoundT -= dt;
    this.grazeSoundT -= dt;

    if (this.bombT > 0) {
      this.bombT -= dt;
      this.bullets.clear();
      if (this.bombFx) this.bombFx.t += dt;
    }

    // 自機の弾 → ボス
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y < -20) s.dead = true;
      else if (!this.boss.dead && this.boss.hitTest(s.x, s.y) && this.boss.damage(s.dmg)) {
        s.dead = true;
        this.particles.spawn(s.x, s.y, 2, '160,220,255', 80, 0.2, 2);
        if (this.hitSoundT <= 0) { Sound.play('hit'); this.hitSoundT = 0.07; }
      }
    }
    this.shots = this.shots.filter((s) => !s.dead);

    // 敵の弾 → 自機
    const p = this.player;
    if (p.alive) {
      const res = this.bullets.collide(p.x, p.y, p.hitRadius);
      if (res.graze) {
        this.score += 30 * res.graze;
        this.particles.spawn(p.x, p.y, 3 * res.graze, '255,255,255', 90, 0.25, 1);
        if (this.grazeSoundT <= 0) { Sound.play('graze'); this.grazeSoundT = 0.06; }
      }
      if (res.hit && p.invuln <= 0 && this.bombT <= 0) p.hit();
    }

    if (this.state === 'intro') {
      this.introT -= dt;
      if (this.introT < 2.8 - this.warnBeeps * 0.7 && this.warnBeeps < 3) { this.warnBeeps++; Sound.play('warn'); }
      if (this.introT <= 0 && !this.boss.entering) { this.state = 'battle'; this.showBanner(this.boss.phaseDef.name, '255,200,120'); }
    }

    // 撃破後は残った弾が出ても即座に消す
    if (this.state === 'defeat' && (this.bullets.list.length || this.bullets.lasers.length)) this.bullets.clear(false);

    if (this.state === 'defeat' && this.boss.dead) {
      this.defeatT -= dt;
      if (this.defeatT <= 0) {
        if (this.bossIndex + 1 < BOSS_DEFS.length) {
          this.bossIndex++;
          this.startBoss();
        } else {
          this.score += p.lives * 20000 + p.bombs * 5000;
          this.saveHigh();
          this.state = 'clear';
          this.clearAt = this.t;
        }
      }
    }
    this.particles.update(dt);
  }

  // ---------- 描画 ----------

  draw() {
    const { ctx, W, H } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    if (this.shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= 0.9;
    } else this.shake = 0;

    if (this.state === 'title') { this.drawTitle(); ctx.restore(); return; }
    if (this.state === 'clear') { this.skies[1].draw(ctx); this.particles.draw(ctx); ctx.restore(); this.drawClear(); return; }

    this.bg.draw(ctx);
    if (this.boss) this.boss.draw(ctx);
    for (const s of this.shots) {
      ctx.fillStyle = 'rgba(120,200,255,0.5)';
      ctx.fillRect(Math.round(s.x - 2), Math.round(s.y - 8), 4, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(s.x - 1), Math.round(s.y - 7), 2, 14);
    }
    if (this.player) this.player.draw(ctx);
    this.bullets.draw(ctx);
    this.particles.draw(ctx);
    if (this.bombFx && this.bombFx.t < 1) {
      const f = this.bombFx;
      ctx.strokeStyle = `rgba(255,230,150,${1 - f.t})`;
      ctx.lineWidth = 10 * (1 - f.t) + 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.t * 700, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    if (this.flash && this.flash.a > 0.01) {
      ctx.fillStyle = `rgba(${this.flash.color},${this.flash.a})`;
      ctx.fillRect(0, 0, W, H);
      this.flash.a *= 0.9;
    }

    this.drawHud();
    if (this.state === 'intro') this.drawWarning();
    if (this.banner && this.banner.t > 0) this.drawBanner();
    if (this.state === 'gameover') this.drawGameOver();
    if (this.state === 'paused') this.drawCenter(['一時停止', 'P / Esc で再開'], '255,255,255');
  }

  text(str, x, y, size, color, align = 'left', shadow = 'rgba(0,0,0,0.85)') {
    const ctx = this.ctx;
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = shadow;
    ctx.fillText(str, x + 2, y + 2);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  drawHud() {
    const { ctx, W, H, boss, player } = this;
    if (boss && !boss.dead && !(this.state === 'intro' && boss.entering)) {
      const phases = boss.def.phases.length;
      this.text(`${boss.def.rank}  ${boss.name}`, 14, 18, 15, '#ffe6a0');
      for (let i = 0; i < phases - boss.phase - 1; i++) {
        ctx.fillStyle = '#ff3050';
        ctx.fillRect(W - 22 - i * 14, 12, 9, 9);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(12, 30, W - 24, 10);
      const ratio = Math.max(0, boss.hp / boss.maxHp);
      ctx.fillStyle = boss.phase === phases - 1 ? '#ff2a4a' : '#e8c25a';
      ctx.fillRect(14, 32, (W - 28) * ratio, 6);
    }
    if (!player) return;
    if (this.godMode) this.text('無敵  K:フェーズを飛ばす', W - 14, H - 72, 12, '#ffe6a0', 'right');
    this.text(`SCORE ${String(this.score).padStart(8, '0')}`, 14, H - 18, 15, '#ffffff');
    this.text(`HI ${String(Math.max(this.highScore, this.score)).padStart(8, '0')}`, 14, H - 38, 12, '#a594b4');
    for (let i = 0; i < player.lives; i++) ctx.drawImage(player.sprite, W - 30 - i * 26, H - 52, 17, 15);
    for (let i = 0; i < player.bombs; i++) {
      const x = W - 22 - i * 20, y = H - 18;
      ctx.fillStyle = '#e8c25a';
      ctx.fillRect(x - 2, y - 7, 4, 14);
      ctx.fillRect(x - 6, y - 3, 12, 4);
    }
  }

  drawWarning() {
    const { ctx, W, H } = this;
    const a = 0.5 + 0.5 * Math.sin(this.t * 10);
    const y = H * 0.45;
    ctx.fillStyle = `rgba(160,0,20,${0.35 + a * 0.2})`;
    ctx.fillRect(0, y - 46, W, 92);
    ctx.fillStyle = '#ff2a4a';
    for (let x = -40 + ((this.t * 120) % 40); x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, y - 46); ctx.lineTo(x + 20, y - 46); ctx.lineTo(x + 10, y - 38); ctx.lineTo(x - 10, y - 38); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y + 38); ctx.lineTo(x + 20, y + 38); ctx.lineTo(x + 10, y + 46); ctx.lineTo(x - 10, y + 46); ctx.fill();
    }
    this.text('WARNING', W / 2, y - 10, 38, `rgba(255,${Math.round(200 * a)},${Math.round(200 * a)},1)`, 'center');
    const def = this.boss.def;
    this.text(`${def.rank === '終' ? 'ラスボス' : def.rank + 'ボス'}：${def.name}`, W / 2, y + 20, 16, '#ffe6a0', 'center');
  }

  drawBanner() {
    const b = this.banner;
    b.t -= 1 / 60;
    const a = Math.min(1, b.t);
    this.ctx.globalAlpha = a;
    this.text(b.text, this.W / 2, this.H * 0.55, 26, `rgb(${b.color})`, 'center');
    this.ctx.globalAlpha = 1;
  }

  drawCenter(lines, color) {
    const { ctx, W, H } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    lines.forEach((l, i) => this.text(l, W / 2, H / 2 - 20 + i * 36, i === 0 ? 30 : 16, i === 0 ? `rgb(${color})` : '#e9e2f0', 'center'));
  }

  drawGameOver() {
    this.drawCenter(['GAME OVER', `SCORE ${this.score}`, 'Z / タップ：このボスからやり直す', 'Esc：タイトルへ'], '255,60,80');
  }

  drawTitle() {
    const { ctx, W, H } = this;
    this.skies[3].draw(ctx);
    const xi = this.images.xavier_silhouette;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(xi, W / 2 - xi.width * 1.5, 60, xi.width * 3, xi.height * 3);
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, 300, 0, H);
    g.addColorStop(0, 'rgba(8,4,12,0)');
    g.addColorStop(0.4, 'rgba(8,4,12,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 300, W, H - 300);

    this.text('堕聖ザビエル', W / 2, 380, 52, '#e8c25a', 'center', '#7a0a1c');
    this.text('— 4体のボスを撃ち落とせ —', W / 2, 428, 15, '#e9e2f0', 'center');

    const keys = [['boss_s', '小', 1.0], ['boss_m', '中', 0.7], ['boss_l', '大', 0.55], ['mystery', '???', 0.75]];
    keys.forEach(([k, label, s], i) => {
      const img = this.images[k];
      const cx = 66 + i * 116, cy = 520 + Math.sin(this.t * 2 + i) * 4;
      ctx.drawImage(img, Math.round(cx - img.width * s / 2), Math.round(cy - img.height * s / 2), img.width * s, img.height * s);
      this.text(`${i + 1}  ${label}`, cx, 590, 14, '#ffe6a0', 'center');
    });

    if (Math.floor(this.t * 2) % 2 === 0) this.text('Z キー / タップ でスタート', W / 2, 640, 18, '#ffffff', 'center');
    this.text('1〜4 キーで好きなボスから', W / 2, 668, 13, '#a594b4', 'center');
    this.text(`HI SCORE ${String(this.highScore).padStart(8, '0')}`, W / 2, 698, 13, '#a594b4', 'center');
    if (this.godMode) this.text('無敵モード ON', W / 2, 24, 16, '#ffe6a0', 'center');
  }

  drawClear() {
    const { W } = this;
    const m = Math.floor(this.runTime / 60), s = Math.floor(this.runTime % 60);
    this.text('ALL CLEAR', W / 2, 220, 48, '#e8c25a', 'center', '#7a0a1c');
    this.text('聖者は静かに眠りについた', W / 2, 280, 18, '#ffffff', 'center');
    this.text(`SCORE  ${this.score}`, W / 2, 360, 22, '#ffffff', 'center');
    this.text(`TIME   ${m}:${String(s).padStart(2, '0')}`, W / 2, 396, 18, '#e9e2f0', 'center');
    this.text(`HI     ${this.highScore}`, W / 2, 428, 16, '#a594b4', 'center');
    if (this.t - this.clearAt > 1.5) this.text('Z / タップ でタイトルへ', W / 2, 520, 16, '#ffe6a0', 'center');
  }
}

// ---------- 起動 ----------

function loadImages(map) {
  const entries = Object.entries(map).map(([key, src]) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve([key, img]);
    img.onerror = () => reject(new Error(src + ' が読み込めませんでした'));
    img.src = src;
  }));
  return Promise.all(entries).then(Object.fromEntries);
}

(function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.font = `16px ${FONT}`;
  ctx.fillText('読み込み中…', 20, 30);

  loadImages({
    boss_s: 'img/boss_s.png',
    boss_m: 'img/boss_m.png',
    boss_l: 'img/boss_l.png',
    xavier: 'img/xavier.png',
    mystery: 'img/mystery.png',
    xavier_silhouette: 'img/xavier_silhouette.png',
    ...BACKGROUND_IMAGES,
  }).then((images) => {
    Input.init(canvas);
    const game = new Game(canvas, images);
    window.game = game;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && ['intro', 'battle', 'defeat'].includes(game.state)) { game.prevState = game.state; game.state = 'paused'; }
    });
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      game.update(dt);
      Input.endFrame();
      game.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }).catch((err) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff6070';
    ctx.fillText(err.message, 20, 30);
  });
})();
