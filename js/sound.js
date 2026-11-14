// Web Audio で効果音を合成する（音声ファイル不要）
const Sound = {
  ctx: null,
  muted: false,

  // ブラウザは操作があるまで音を鳴らせないので、最初のキー入力やタップで起動する
  unlock() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  // [波形, 開始周波数, 終了周波数, 長さ(秒), 音量]
  presets: {
    shot:    ['square',   1200, 600,  0.04, 0.015],
    hit:     ['square',   220,  140,  0.04, 0.02],
    graze:   ['triangle', 1800, 2400, 0.05, 0.03],
    damage:  ['sawtooth', 400,  50,   0.5,  0.15],
    bomb:    ['sawtooth', 50,   400,  0.8,  0.18],
    explode: ['sawtooth', 150,  30,   0.7,  0.18],
    warn:    ['square',   330,  330,  0.25, 0.06],
    phase:   ['sawtooth', 90,   30,   1.2,  0.2],
    laser:   ['sawtooth', 700,  200,  0.6,  0.05],
    select:  ['square',   660,  990,  0.1,  0.06],
  },

  play(name) {
    if (this.muted || !this.ctx) return;
    const p = this.presets[name];
    if (!p) return;
    const c = this.ctx;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = p[0];
    osc.frequency.setValueAtTime(p[1], t);
    osc.frequency.exponentialRampToValueAtTime(p[2], t + p[3]);
    gain.gain.setValueAtTime(p[4], t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + p[3]);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + p[3] + 0.02);
  },
};
