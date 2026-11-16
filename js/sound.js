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
    shot:    ['square',   1200, 600,  0.04, 0.03],
    hit:     ['square',   220,  140,  0.04, 0.04],
    graze:   ['triangle', 1800, 2400, 0.05, 0.03],
    damage:  ['sawtooth', 400,  50,   0.5,  0.15],
    bomb:    ['sawtooth', 50,   400,  0.8,  0.2],
    explode: ['sawtooth', 150,  30,   0.7,  0.18],
    warn:    ['square',   330,  330,  0.25, 0.03],
    phase:   ['sawtooth', 90,   30,   1.2,  0.2],
    laser:   ['sawtooth', 700,  200,  0.6,  0.2],
    select:  ['square',   660,  990,  0.1,  0.1],
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


  // シリアスなBGM（Dマイナー）
  bgmGain: null,
  bgmTimer: null,
  bgmStep: 0,
  nextNoteTime: 0,

  // 64拍分のメロディ。nullは休符
  bgmMelody: [
    293.66, 293.66, 349.23, 392.00,
    440.00, 392.00, 349.23, 293.66,
    261.63, 293.66, 349.23, 440.00,
    392.00, 349.23, 293.66, 261.63,

    293.66, 349.23, 392.00, 440.00,
    523.25, 440.00, 392.00, 349.23,
    293.66, 349.23, 392.00, 349.23,
    261.63, 293.66, 261.63, 220.00,

    349.23, 349.23, 392.00, 440.00,
    523.25, 493.88, 440.00, 392.00,
    349.23, 392.00, 440.00, 523.25,
    587.33, 523.25, 440.00, 392.00,

    349.23, 293.66, 349.23, 392.00,
    440.00, 392.00, 349.23, 293.66,
    261.63, 293.66, 349.23, 293.66,
    261.63, 220.00, 261.63, 293.66,
  ],

  // Dマイナーを中心にしたベース進行
  bgmBass: [
    73.42, 73.42, 87.31, 87.31,
    65.41, 65.41, 78.00, 78.00,
    58.27, 58.27, 73.42, 73.42,
    65.41, 65.41, 73.42, 73.42,
  ],

  playBGMTone(freq, time, duration, type, volume) {
    if (!freq || !this.ctx || !this.bgmGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.08);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      time + duration
    );

    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + duration + 0.05);
  },


  // キック：低く鋭いバスドラム
  drumKick(time) {
    const c = this.ctx;
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);

    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + 0.17);
  },

  // スネア：ノイズと低音を重ねる
  drumSnare(time) {
    const c = this.ctx;
    const length = Math.floor(c.sampleRate * 0.18);
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const gain = c.createGain();

    noise.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 1200;

    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    noise.start(time);
    noise.stop(time + 0.18);

    // スネアの胴鳴り
    const osc = c.createOscillator();
    const bodyGain = c.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, time);

    bodyGain.gain.setValueAtTime(0.1, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.connect(bodyGain);
    bodyGain.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + 0.11);
  },

  // ハイハット：高音のノイズ
  drumHat(time, volume = 0.12) {
    const c = this.ctx;
    const length = Math.floor(c.sampleRate * 0.06);
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const gain = c.createGain();

    noise.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 7000;

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    noise.start(time);
    noise.stop(time + 0.06);
  },


  startBGM() {
    this.unlock();

    if (!this.ctx) return;
    if (this.bgmTimer) return;

    const c = this.ctx;
    const beat = 60 / 300; // BPM 300

    this.bgmGain = c.createGain();
    this.bgmGain.gain.setValueAtTime(
      this.muted ? 0 : 0.10,
      c.currentTime
    );
    this.bgmGain.connect(c.destination);

    this.bgmStep = 0;
    this.nextNoteTime = c.currentTime + 0.1;

    // 先読みして音をスケジュール
    this.bgmTimer = setInterval(() => {
      while (this.nextNoteTime < c.currentTime + 0.15) {
        const step = this.bgmStep % 64;
        const melody = this.bgmMelody[step];

      // メロディ
      if (melody) {
        this.playBGMTone(
          melody,
          this.nextNoteTime,
          beat * 0.75,
          'sawtooth',
          0.09
        );
      }

      // ベース：1拍ごとに鳴らす
      if (step % 1 === 0) {
        const bass = this.bgmBass[
          Math.floor(step / 4) % this.bgmBass.length
        ];

        this.playBGMTone(
          bass * 2,
          this.nextNoteTime,
          beat * 0.9,
          'triangle',
          0.22
        );
      }

      // パッド：4拍ごとにコードを鳴らす
      if (step % 4 === 0) {
        const root = this.bgmBass[
          Math.floor(step / 4) % this.bgmBass.length
        ] * 2;

        // マイナーコード（ルート・短3度・完全5度）
        const chord = [
          root,
          root * Math.pow(2, 3 / 12),
          root * Math.pow(2, 7 / 12)
        ];

        chord.forEach((freq) => {
          this.playBGMTone(
            freq,
            this.nextNoteTime,
            beat * 3.8,
            'sine',
            0.13
          );
        });
      }


      // ドラムパターン
      // キック：毎拍
      this.drumKick(this.nextNoteTime);

      // スネア：2拍ごと
      if (step % 2 === 1) {
        this.drumSnare(this.nextNoteTime);
      }

      // ハイハット：8分音符で刻む
      this.drumHat(this.nextNoteTime, 0.10);
      this.drumHat(
        this.nextNoteTime + beat / 2,
        0.055
      );

      // 16拍ごとにフィルイン
      if (step % 16 === 14) {
        this.drumSnare(this.nextNoteTime + beat / 2);
      }

        this.bgmStep++;
        this.nextNoteTime += beat;
      }
    }, 25);
  },

  stopBGM() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }

    if (this.bgmGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setTargetAtTime(0, now, 0.5);
    }
  },

  // BGMを一時停止
  bgmPaused: false,

  pauseBGM() {
    this.bgmPaused = true;

    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setTargetAtTime(
        0,
        this.ctx.currentTime,
        0.03
      );
    }
  },

  // BGMを再開
  resumeBGM() {
    this.bgmPaused = false;

    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setTargetAtTime(
        this.muted ? 0 : 0.10,
        this.ctx.currentTime,
        0.05
      );
    }
  },

  setMuted(value) {
    this.muted = value;

    if (this.bgmGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setTargetAtTime(
        (value || this.bgmPaused) ? 0 : 0.10,
        now,
        0.05
      );
    }
  },

};
