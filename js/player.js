// 自機。ドット絵は文字の地図から描く。
const SHIP_MAP = [
  '.......W.......',
  '......WBW......',
  '......WBW......',
  '.....WWBWW.....',
  '.....WBBBW.....',
  '....WWBRBWW....',
  '...WWWBRBWWW...',
  '..RWWWBBBWWWR..',
  '.RRWWWWBWWWWRR.',
  'RRWWWWWWWWWWWRR',
  'RW.GWWWWWWWG.WR',
  'R..GWW.W.WWG..R',
  '....W..W..W....',
];
const SHIP_COLORS = { W: '#e8eef8', B: '#2a6cf0', R: '#d8203c', G: '#8a96b0' };

function makeShipSprite(scale = 2) {
  const h = SHIP_MAP.length, w = SHIP_MAP[0].length;
  const c = document.createElement('canvas');
  c.width = (w + 2) * scale;
  c.height = (h + 2) * scale;
  const x = c.getContext('2d');
  const filled = (i, j) => SHIP_MAP[j] && SHIP_MAP[j][i] && SHIP_MAP[j][i] !== '.';
  // 1ドットの暗い縁取り
  x.fillStyle = '#0a0612';
  for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
    if (filled(i, j)) continue;
    if (filled(i + 1, j) || filled(i - 1, j) || filled(i, j + 1) || filled(i, j - 1)) x.fillRect((i + 1) * scale, (j + 1) * scale, scale, scale);
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const ch = SHIP_MAP[j][i];
    if (ch === '.') continue;
    x.fillStyle = SHIP_COLORS[ch];
    x.fillRect((i + 1) * scale, (j + 1) * scale, scale, scale);
  }
  return c;
}

class Player {
  constructor(game) {
    this.game = game;
    this.sprite = makeShipSprite(2);
    this.hitRadius = 2.5;
    this.lives = 3;
    this.bombs = 3;
    this.power = 1; //追加 ショットの強さ
    this.t = 0;
    this.spawn();
  }

  spawn() {
    this.x = this.game.W / 2;
    this.y = this.game.H - 90;
    this.alive = true;
    this.invuln = 2.5;
    this.shotT = 0;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        if (this.lives > 0) { this.spawn(); this.bombs = 3; } else g.gameOver();
      }
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    const speed = 270;
    let dx = (Input.down('ArrowRight', 'KeyD') ? 1 : 0) - (Input.down('ArrowLeft', 'KeyA') ? 1 : 0);
    let dy = (Input.down('ArrowDown', 'KeyS') ? 1 : 0) - (Input.down('ArrowUp', 'KeyW') ? 1 : 0);
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    if (dx || dy) Input.mouse = null; // キーを押したらマウス追従をやめる
    this.x += dx * speed * dt + Input.dragX * 1.2;
    this.y += dy * speed * dt + Input.dragY * 1.2;

    // マウス追従：カーソルに向かって一定の速さで近づく
    const m = Input.mouse;
    if (m) {
      const mx = m.x - this.x, my = m.y - this.y;
      const dist = Math.hypot(mx, my);
      const step = 560 * dt;
      if (dist <= step) { this.x = m.x; this.y = m.y; } else { this.x += (mx / dist) * step; this.y += (my / dist) * step; }
    }
    this.x = Math.max(12, Math.min(g.W - 12, this.x));
    this.y = Math.max(40, Math.min(g.H - 16, this.y));

    this.shotT -= dt;
    const shooting = Input.down('KeyZ', 'Space') || Input.touching;
    if (shooting && this.shotT <= 0) { this.fire(); this.shotT = 0.075; }

    if (Input.hit('KeyX')) g.useBomb();
  }

  fire() {
    PowerShot.fire(this); // item.jsで管理
    if (Math.floor(this.t * 13) % 2 === 0) Sound.play('shot');
  }

  hit() {
    const g = this.game;
    if (!this.alive || this.invuln > 0 || g.bombT > 0 || g.godMode) return;
    this.alive = false;
    this.lives--;
    this.respawnT = 1.4;
    g.particles.spawn(this.x, this.y, 40, '120,180,255', 220, 0.9, 3);
    g.particles.spawn(this.x, this.y, 20, '255,255,255', 120, 0.6, 2);
    g.shake = 12;
    g.bullets.clear(false);
    Sound.play('damage');
  }

  draw(ctx) {
    if (!this.alive) return;
    if (this.invuln > 0 && Math.floor(this.t * 20) % 2 === 0) return;
    const s = this.sprite;
    // エンジンの炎
    const f = 4 + Math.random() * 5;
    ctx.fillStyle = '#7fd0ff';
    ctx.fillRect(Math.round(this.x - 7), Math.round(this.y + 12), 3, f);
    ctx.fillRect(Math.round(this.x + 4), Math.round(this.y + 12), 3, f);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(this.x - 6), Math.round(this.y + 12), 1, f * 0.6);
    ctx.fillRect(Math.round(this.x + 5), Math.round(this.y + 12), 1, f * 0.6);
    ctx.drawImage(s, Math.round(this.x - s.width / 2), Math.round(this.y - s.height / 2));
    // 当たり判定（常に表示）
    {
      ctx.fillStyle = '#ff2a4a';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.hitRadius + 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.hitRadius, 0, Math.PI * 2); ctx.fill();
    }
  }
}
