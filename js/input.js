// キーボード・タッチ入力をまとめて管理する
const Input = {
  keys: {},        // 押しっぱなし中のキー
  pressed: {},     // このフレームで押されたキー
  dragX: 0,        // このフレームの指の移動量（ゲーム座標）
  dragY: 0,
  touching: false,
  mouse: null,     // マウスカーソルの位置（ゲーム座標）。キー操作をすると null に戻る
  tapped: false,

  init(canvas) {
    const block = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    addEventListener('keydown', (e) => {
      if (block.includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) {
        this.pressed[e.code] = true;
        this.history.push(e.code);
        if (this.history.length > 12) this.history.shift();
      }
      this.keys[e.code] = true;
      Sound.unlock();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });

    const toGame = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
    };
    // マウス：ボタンを押していなくても、常にカーソルの位置へ機体が向かう
    // タッチ：指をなぞった分だけ機体が動く（指で機体が隠れないように）
    let last = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        canvas.setPointerCapture(e.pointerId);
        last = toGame(e);
      } else {
        this.mouse = toGame(e);
      }
      this.touching = true;
      this.tapped = true;
      Sound.unlock();
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') {
        if (!last) return;
        const p = toGame(e);
        this.dragX += p.x - last.x;
        this.dragY += p.y - last.y;
        last = p;
      } else {
        this.mouse = toGame(e);
      }
    });
    const up = () => { last = null; this.touching = false; };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);

    const bombBtn = document.getElementById('bombBtn');
    if (bombBtn) {
      bombBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pressed.KeyX = true; });
    }
  },

  history: [],     // 直近に押したキー（隠しコマンド判定用）

  // 直近の入力が codes の並びで終わっていれば true（判定したら履歴を消す）
  typed(codes) {
    const h = this.history;
    if (h.length < codes.length) return false;
    const ok = codes.every((c, i) => h[h.length - codes.length + i] === c);
    if (ok) this.history = [];
    return ok;
  },

  down(...codes) { return codes.some((c) => this.keys[c]); },
  hit(...codes) { return codes.some((c) => this.pressed[c]); },

  endFrame() {
    this.pressed = {};
    this.dragX = 0;
    this.dragY = 0;
    this.tapped = false;
  },
};
