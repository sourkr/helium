import { SoundMaterial } from '../shared/blocks';

/**
 * 100% procedural Web Audio API sound synthesizer for tactile voxel interaction and survival feedback.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.noiseBuffer && this.ctx) {
      const length = this.ctx.sampleRate * 0.5;
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.ctx;
  }

  public unlock() {
    this.ensureContext();
  }

  public playMineTick(material: SoundMaterial) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const jitter = 0.9 + Math.random() * 0.2;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const freq =
      material === 'stone' || material === 'metal'
        ? 1850
        : material === 'wood'
          ? 780
          : material === 'glass'
            ? 3200
            : 1100;
    filter.frequency.setValueAtTime(freq * jitter, now);
    filter.Q.value = 2.0;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.065);
  }

  public playBreak(material: SoundMaterial) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const jitter = 0.92 + Math.random() * 0.16;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    let freq = 900;
    let q = 1.4;
    let duration = 0.14;
    let vol = 0.18;

    switch (material) {
      case 'grass':
      case 'leaves':
        freq = 1350;
        q = 1.2;
        duration = 0.12;
        vol = 0.14;
        break;
      case 'dirt':
      case 'sand':
      case 'snow':
        freq = 750;
        q = 0.9;
        duration = 0.15;
        vol = 0.17;
        break;
      case 'stone':
        freq = 1650;
        q = 2.4;
        duration = 0.13;
        vol = 0.2;
        break;
      case 'wood':
        freq = 640;
        q = 2.2;
        duration = 0.12;
        vol = 0.18;
        break;
      case 'glass':
        freq = 3600;
        q = 3.5;
        duration = 0.18;
        vol = 0.16;
        break;
      case 'metal':
        freq = 2200;
        q = 4.2;
        duration = 0.2;
        vol = 0.16;
        break;
      case 'water':
        freq = 950;
        q = 1.5;
        duration = 0.22;
        vol = 0.15;
        break;
    }

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq * jitter, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(180, freq * 0.45), now + duration);
    filter.Q.value = q;

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration + 0.02);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    if (material === 'glass' || material === 'metal') {
      osc.type = 'triangle';
      const basePitch = material === 'glass' ? 1480 : 520;
      osc.frequency.setValueAtTime(basePitch * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(basePitch * 0.72 * jitter, now + 0.14);
      oscGain.gain.setValueAtTime(0.11, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    } else {
      osc.type = material === 'wood' ? 'triangle' : 'sine';
      const basePitch = material === 'stone' ? 185 : material === 'wood' ? 235 : 135;
      osc.frequency.setValueAtTime(basePitch * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.09);
      oscGain.gain.setValueAtTime(0.14, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    }

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playPlace(material: SoundMaterial) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const jitter = 0.94 + Math.random() * 0.12;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    let pitch = 170;
    if (material === 'stone') pitch = 240;
    else if (material === 'wood') pitch = 210;
    else if (material === 'glass') pitch = 620;
    else if (material === 'metal') pitch = 380;
    else if (material === 'snow' || material === 'sand') pitch = 135;

    osc.type = material === 'wood' || material === 'glass' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(pitch * 1.25 * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.58 * jitter, now + 0.085);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playStep(material: SoundMaterial) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const baseFreq =
      material === 'stone' || material === 'metal'
        ? 1400
        : material === 'wood'
          ? 700
          : material === 'water'
            ? 850
            : 1050;
    filter.frequency.setValueAtTime(baseFreq * (0.9 + Math.random() * 0.2), now);
    filter.Q.value = 1.6;

    const gain = ctx.createGain();
    const vol = material === 'water' ? 0.09 : 0.055;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.075);
  }

  public playJump() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.07);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playLand(intensity = 1) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.08);
    gain.gain.setValueAtTime(Math.min(0.16, 0.08 * intensity), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playStrike() {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.09);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playHurt() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.18);
    gain.gain.setValueAtTime(0.19, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playEat() {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    // Two quick crisp crunch bursts
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.09;
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1500 + i * 250, t);
      filter.Q.value = 1.6;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.075);
    }
  }

  public playCraft() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [440, 587.33];
    notes.forEach((freq, i) => {
      const t = now + i * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  }

  public playToolBreak() {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    // Sharp snap + metallic/wood clatter
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, now);
    filter.frequency.exponentialRampToValueAtTime(520, now + 0.22);
    filter.Q.value = 2.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.25);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.16);
    oscGain.gain.setValueAtTime(0.14, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playBucketFill() {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(1450, now + 0.16);
    filter.Q.value = 2.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.19);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.12);
    oscGain.gain.setValueAtTime(0.08, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playBucketEmpty() {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1350, now);
    filter.frequency.exponentialRampToValueAtTime(420, now + 0.24);
    filter.Q.value = 1.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.19, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.26);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(210, now + 0.16);
    oscGain.gain.setValueAtTime(0.07, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playUiTick() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.035);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  public playPickup() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const jitter = 0.92 + Math.random() * 0.22;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520 * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(1040 * jitter, now + 0.055);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public dispose() {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
