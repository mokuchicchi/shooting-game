// 背景。止まっている部分は img/bg/ の画像を読み込んで使い、動く部分（星・雲の流れ・火の粉・光・霧・稲妻）だけをここで描く。
// どちらのクラスも update(dt) と draw(ctx) を持つ。
//
// 使う画像（すべて 480×720）
//   sky_1〜3.png          夜空のグラデーション（小・中・大ボス戦）
//   clouds_far_1〜3.png   奥の雲（透明背景・上下がつながっていてループできる）
//   clouds_near_1〜3.png  手前の雲（同上）
//   cathedral_1〜3.png    聖堂（ラスボスの形態 1・2・3）

// 背景画像のファイル一覧。game.js の画像読み込みに混ぜて使う。
const BACKGROUND_IMAGES = {};
for (const n of [1, 2, 3]) {
  BACKGROUND_IMAGES[`sky_${n}`] = `img/bg/sky_${n}.png`;
  BACKGROUND_IMAGES[`clouds_far_${n}`] = `img/bg/clouds_far_${n}.png`;
  BACKGROUND_IMAGES[`clouds_near_${n}`] = `img/bg/clouds_near_${n}.png`;
  BACKGROUND_IMAGES[`cathedral_${n}`] = `img/bg/cathedral_${n}.png`;
}

// 鳥ボス戦：下へ流れる夜空
class SkyBackground {
  constructor(W, H, images, theme) {
    this.W = W; this.H = H;
    this.sky = images[`sky_${theme}`];
    this.far = images[`clouds_far_${theme}`];
    this.near = images[`clouds_near_${theme}`];
    this.ember = { 1: null, 2: '255,120,90', 3: '255,60,60' }[theme]; // 火の粉の色（小ボス戦はなし）
    this.scrollFar = 0;
    this.scrollNear = 0;
    this.stars = Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() < 0.2 ? 2 : 1, v: 10 + Math.random() * 30 }));
    this.embers = [];
  }

  update(dt) {
    const { W, H } = this;
    this.scrollFar = (this.scrollFar + 25 * dt) % H;   // 奥の雲はゆっくり
    this.scrollNear = (this.scrollNear + 70 * dt) % H; // 手前の雲は速く
    for (const s of this.stars) { s.y += s.v * dt; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } }
    if (this.ember) {
      if (this.embers.length < 50) this.embers.push({ x: Math.random() * W, y: H + 5, v: 30 + Math.random() * 60, p: Math.random() * 6 });
      for (const e of this.embers) { e.y -= e.v * dt; e.x += Math.sin(e.y * 0.03 + e.p) * 0.4; }
      this.embers = this.embers.filter((e) => e.y > -5);
    }
  }

  draw(ctx) {
    const { H } = this;
    ctx.drawImage(this.sky, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const s of this.stars) ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.s, s.s);
    // 雲は同じ画像を縦に2枚並べてずらし、切れ目なく流す
    ctx.globalAlpha = 0.8;
    ctx.drawImage(this.far, 0, this.scrollFar - H);
    ctx.drawImage(this.far, 0, this.scrollFar);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(this.near, 0, this.scrollNear - H);
    ctx.drawImage(this.near, 0, this.scrollNear);
    ctx.globalAlpha = 1;
    for (const e of this.embers) {
      ctx.fillStyle = `rgba(${this.ember},${0.5 + 0.4 * Math.sin(e.y * 0.1)})`;
      ctx.fillRect(Math.floor(e.x), Math.floor(e.y), 2, 2);
    }
  }
}

// ラスボス戦：形態に合わせて 1→2→3 と崩れていく聖堂
class CathedralBackground {
  constructor(W, H, images) {
    this.W = W; this.H = H;
    this.pictures = { 1: images.cathedral_1, 2: images.cathedral_2, 3: images.cathedral_3 };
    this.stage = 1;
    this.t = 0;
    this.embers = [];
    this.bolt = 0;
    this.boltPath = [];
    // 形態ごとの色：fog=床の霧、ember=火の粉、glow=窓の光
    this.palettes = {
      1: { fog: '120,110,170', ember: '255,200,110', glow: '220,200,255' },
      2: { fog: '150,60,60', ember: '255,120,60', glow: '230,90,50' },
      3: { fog: '110,30,150', ember: '200,90,255', glow: '220,30,60' },
    };
  }

  setStage(n) { this.stage = n; }

  makeBolt() {
    const { W, H } = this;
    let x = W * (0.15 + Math.random() * 0.7), y = 0;
    const pts = [[x, y]];
    while (y < H * 0.55) { x += (Math.random() - 0.5) * 50; y += 18 + Math.random() * 28; pts.push([x, y]); }
    return pts;
  }

  update(dt) {
    const { W, H, stage } = this;
    this.t += dt;
    const max = [0, 30, 60, 110][stage];
    while (this.embers.length < max) {
      this.embers.push({ x: Math.random() * W, y: H + Math.random() * 40, v: 15 + Math.random() * 40 * stage, s: 1 + Math.random() * 2.5, ph: Math.random() * 6 });
    }
    if (this.embers.length > max) this.embers.length = max;
    for (const e of this.embers) {
      e.y -= e.v * dt;
      e.x += Math.sin(this.t * 2 + e.ph) * 0.4;
      if (e.y < -10) { e.y = H + 10; e.x = Math.random() * W; }
    }
    // 最終形態ではときどき稲妻が走る
    if (stage === 3 && this.bolt <= 0 && Math.random() < 0.006) { this.bolt = 0.35; this.boltPath = this.makeBolt(); }
    if (this.bolt > 0) this.bolt -= dt;
  }

  draw(ctx) {
    const { W, H, stage } = this;
    const pal = this.palettes[stage];
    ctx.drawImage(this.pictures[stage], 0, 0);

    // バラ窓の脈打つ光
    const cx = W / 2, cy = H * 0.24;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * (stage === 3 ? 3 : 1.2));
    const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 260);
    glow.addColorStop(0, `rgba(${pal.glow},${0.12 + pulse * 0.12})`);
    glow.addColorStop(1, `rgba(${pal.glow},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // 窓から差し込む光の筋
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const bx = cx - 60 + i * 40;
      ctx.fillStyle = `rgba(${pal.glow},${0.03 + pulse * 0.02})`;
      ctx.beginPath();
      ctx.moveTo(bx, cy); ctx.lineTo(bx + 20, cy);
      ctx.lineTo(bx + 160 - i * 70, H); ctx.lineTo(bx + 60 - i * 70, H);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // 床を流れる霧
    for (let i = 0; i < 3; i++) {
      const y = H * (0.68 + i * 0.1);
      const off = (this.t * (12 + i * 8)) % W;
      ctx.fillStyle = `rgba(${pal.fog},${0.08 + stage * 0.025})`;
      for (const base of [-W, 0]) {
        ctx.beginPath();
        ctx.ellipse(base + off + W * 0.3, y, W * 0.45, 20 + i * 6, 0, 0, Math.PI * 2);
        ctx.ellipse(base + off + W * 0.8, y + 6, W * 0.4, 16 + i * 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 火の粉
    for (const e of this.embers) {
      ctx.fillStyle = `rgba(${pal.ember},${0.4 + 0.4 * Math.sin(this.t * 5 + e.ph)})`;
      ctx.fillRect(e.x, e.y, e.s, e.s);
    }

    // 稲妻
    if (this.bolt > 0) {
      ctx.fillStyle = `rgba(180,120,255,${this.bolt * 0.5})`;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = `rgba(240,220,255,${Math.min(1, this.bolt * 2.5)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.boltPath.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
    }

    // 画面のふちを暗くする
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,0,0,${0.4 + stage * 0.12})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }
}
