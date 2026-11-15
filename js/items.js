const POWER_MAX = 4;

// 自機の撃ち方。player.js の fire() から呼ばれる
const PowerShot = {
  fire(p) {
    const s = p.game.shots;
    const lv = p.power;
    const big = lv >= 4;
    const shot = (x, y, angle, kind) => s.push({ x, y, vx: Math.sin(angle) * 900, vy: -Math.cos(angle) * 900, dmg: big ? 1.5 : 1, big, kind });
    const y = p.y - 14;

    shot(p.x - 5, y, 0);
    shot(p.x + 5, y, 0);
    if (lv >= 2) { shot(p.x, y, -0.16); shot(p.x, y, 0.16); }
    if (lv >= 4) { shot(p.x, y, -0.32); shot(p.x, y, 0.32); }
    // オプションからもまっすぐ1発ずつ
    if (lv >= 3) for (const o of p.game.items.options) shot(o.x, o.y - 6, 0, 'option');
  },
};

// 落ちてくるアイテムの見た目（金色の箱に赤い「P」）
const ITEM_SPRITE = (() => {
  const map = [
    '..XXXXXXXX..',
    '.XGGGGGGGGX.',
    'XGWWGGGGGGGX',
    'XGWRRRRRGGGX',
    'XGGRRGGRRGGX',
    'XGGRRGGRRGGX',
    'XGGRRRRRGGGX',
    'XGGRRGGGGGGX',
    'XGGRRGGGGGGX',
    'XGGGGGGGGGDX',
    '.XDDDDDDDDX.',
    '..XXXXXXXX..',
  ];
  const colors = { X: '#0a0612', G: '#e8c25a', W: '#fff1b8', R: '#c8102e', D: '#b0802e' };
  const scale = 2;
  const c = document.createElement('canvas');
  c.width = map[0].length * scale;
  c.height = map.length * scale;
  const x = c.getContext('2d');
  map.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    x.fillStyle = colors[ch];
    x.fillRect(i * scale, j * scale, scale, scale);
  }));
  return c;
})();

class ItemSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.options = [];   // Lv3から出るオプション（自機の左右の光る球）
  }

  reset() { this.list = []; this.options = []; }

  // ボスを倒した場所からアイテムを1つ出す（最後のボスのときは出さない）
  spawn(boss) {
    if (this.game.bossIndex + 1 >= BOSS_DEFS.length) return;
    if (this.game.player.power >= POWER_MAX) return;
    this.list.push({ x: boss.x, y: boss.y, vy: -140, t: 0 });
  }

  collect(it) {
    const g = this.game, p = g.player;
    if (p.power >= POWER_MAX) return;
    p.power++;
    g.flashScreen('255,230,150', 0.4);
    g.particles.spawn(it.x, it.y, 30, '255,220,120', 200, 0.6, 3);
    Sound.play('select');
  }

  update(dt) {
    const g = this.game, p = g.player;

    // アイテム：少し跳ね上がってから落ちてくる。画面の下まで落ちたら消える（取り逃し）
    for (const it of this.list) {
      it.t += dt;
      it.vy = Math.min(240, it.vy + 420 * dt);
      it.y += it.vy * dt;
      if (it.y > g.H + 20) it.dead = true;
      if (p.alive) {
        const dx = p.x - it.x, dy = p.y - it.y, d = Math.hypot(dx, dy);
        if (d < 22) { this.collect(it); it.dead = true; }
        else if (d < 110) { it.x += (dx / d) * 420 * dt; it.y += (dy / d) * 420 * dt; } // 近づくと吸い寄せられる
      }
    }
    this.list = this.list.filter((it) => !it.dead);

    // オプション：自機の左右の定位置へ、少し遅れてついていく
    if (p && p.power >= 3) {
      while (this.options.length < 2) this.options.push({ x: p.x, y: p.y, side: this.options.length ? 1 : -1 });
      for (const o of this.options) {
        const tx = p.x + o.side * 30, ty = p.y + 10 + Math.sin(g.t * 5 + o.side) * 4;
        o.x += (tx - o.x) * Math.min(1, dt * 10);
        o.y += (ty - o.y) * Math.min(1, dt * 10);
      }
    } else {
      this.options = [];
    }
  }

  draw(ctx) {
    const g = this.game, p = g.player;
    // 自機の弾の上乗せ表示：オプションの弾は水色の菱形、Lv4の弾は太い金色
    for (const sh of g.shots) {
      if (sh.kind === 'option') {
        ctx.fillStyle = '#7fe8ff';
        ctx.beginPath(); ctx.moveTo(sh.x, sh.y - 8); ctx.lineTo(sh.x + 4, sh.y); ctx.lineTo(sh.x, sh.y + 8); ctx.lineTo(sh.x - 4, sh.y); ctx.fill();
      } else if (sh.big) {
        ctx.fillStyle = 'rgba(255,210,90,0.45)';
        ctx.fillRect(Math.round(sh.x - 4), Math.round(sh.y - 10), 8, 20);
        ctx.fillStyle = '#ffe9a0';
        ctx.fillRect(Math.round(sh.x - 2), Math.round(sh.y - 9), 4, 18);
      }
    }
    // オプション本体：水色の四角
    if (p && p.alive) {
      for (const o of this.options) {
        ctx.fillStyle = '#7fe8ff';
        ctx.fillRect(Math.round(o.x - 4), Math.round(o.y - 4), 8, 8);
      }
    }
    // アイテム：「P」の箱の絵を貼る
    for (const it of this.list) {
      ctx.drawImage(ITEM_SPRITE, Math.round(it.x - ITEM_SPRITE.width / 2), Math.round(it.y - ITEM_SPRITE.height / 2));
    }
  }
}