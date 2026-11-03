// Tiny WebAudio synth so the game ships with sound and zero asset files.

const NOISE_SECONDS = 0.7;

export class AudioEngine {
  constructor({ muted = false } = {}) {
    this.muted = muted;
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.lastShot = 0;
  }

  /** Must be called from a user gesture (click / keypress). */
  unlock() {
    if (typeof window === 'undefined') return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(this.ctx.destination);
      this.noise = this._buildNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _buildNoise() {
    const frames = Math.floor(this.ctx.sampleRate * NOISE_SECONDS);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.28, this.ctx.currentTime, 0.02);
    }
  }

  _tone({ freq = 440, endFreq = freq, type = 'square', duration = 0.12, gain = 0.2, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(gain, now + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(env).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  _burst({ duration = 0.3, gain = 0.35, cutoff = 1400, delay = 0 }) {
    if (!this.ctx || this.muted || !this.noise) return;
    const now = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + duration);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter).connect(env).connect(this.master);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'shoot': {
        const now = this.ctx.currentTime;
        if (now - this.lastShot < 0.055) return;
        this.lastShot = now;
        this._tone({ freq: 880, endFreq: 420, type: 'square', duration: 0.07, gain: 0.06 });
        break;
      }
      case 'hit':
        this._tone({ freq: 320, endFreq: 180, type: 'triangle', duration: 0.06, gain: 0.1 });
        break;
      case 'explode':
        this._burst({ duration: 0.26, gain: 0.22, cutoff: 1800 });
        this._tone({ freq: 180, endFreq: 60, type: 'sawtooth', duration: 0.2, gain: 0.1 });
        break;
      case 'bossDown':
        this._burst({ duration: 0.75, gain: 0.4, cutoff: 2400 });
        this._tone({ freq: 160, endFreq: 40, type: 'sawtooth', duration: 0.7, gain: 0.16 });
        break;
      case 'powerup':
        [523, 659, 784, 1046].forEach((freq, i) =>
          this._tone({ freq, type: 'triangle', duration: 0.12, gain: 0.13, delay: i * 0.055 }),
        );
        break;
      case 'hurt':
        this._tone({ freq: 240, endFreq: 70, type: 'sawtooth', duration: 0.4, gain: 0.2 });
        this._burst({ duration: 0.35, gain: 0.28, cutoff: 900 });
        break;
      case 'wave':
        [392, 523, 659].forEach((freq, i) =>
          this._tone({ freq, type: 'sine', duration: 0.22, gain: 0.1, delay: i * 0.1 }),
        );
        break;
      case 'bossWarn':
        [140, 110, 140, 110].forEach((freq, i) =>
          this._tone({ freq, type: 'square', duration: 0.2, gain: 0.12, delay: i * 0.24 }),
        );
        break;
      case 'gameover':
        [440, 349, 294, 196].forEach((freq, i) =>
          this._tone({ freq, endFreq: freq * 0.92, type: 'triangle', duration: 0.34, gain: 0.14, delay: i * 0.16 }),
        );
        break;
      case 'ui':
        this._tone({ freq: 660, endFreq: 990, type: 'sine', duration: 0.08, gain: 0.08 });
        break;
      default:
        break;
    }
  }
}
