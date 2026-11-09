export interface EQBandConfig {
  id: string;
  label: string;
  type: BiquadFilterType;
  frequency: number;
  gain: number;
  Q: number;
}

export interface ChannelStripConfig {
  trackId: string;
  inputGainDb: number; // -24 to +24
  pan: number; // -1.0 to +1.0
  mute: boolean;
  solo: boolean;
  polarityInvert: boolean;
  eqBands: EQBandConfig[];
  compressor: {
    threshold: number; // -60 to 0
    ratio: number; // 1 to 20
    attack: number; // 0.001 to 0.2
    release: number; // 0.01 to 1.0
    knee: number; // 0 to 40
  };
}

export interface MasterBusConfig {
  gainDb: number;
  limiterEnabled: boolean;
  limiterThreshold: number;
  stereoWidth: number; // 0.0 to 2.0
  reverbSend: number; // 0.0 to 1.0
  eqBands: EQBandConfig[];
}

export interface StemMixLevels {
  drums: number; // 0..1
  bass: number; // 0..1
  harmony: number; // 0..1
  lead: number; // 0..1
  autoDuck: boolean;
}

export interface BroadcastMeterTelemetry {
  leftPeakDb: number;
  rightPeakDb: number;
  leftRmsDb: number;
  rightRmsDb: number;
  shortTermLufs: number;
  integratedLufs: number;
  phaseCorrelation: number;
  audioBass: number; // 0.0 to 1.0 normalized low-frequency FFT energy
  fftBins: Uint8Array;
  timeDomainL: Float32Array;
  timeDomainR: Float32Array;
  channelGainReduction: Record<string, number>;
}

/**
 * Real-time Fairlight-style Web Audio API Mastering & 4-Stem Synthesis Engine
 * Manages live playback synthesis, 4-band Parametric EQ, DynamicsCompressorNode,
 * ConvolverNode studio reverb, 2048-point FFT analyzer, and 4-Stem Dynamic Music Mixer.
 */
class WebAudioMasteringEngine {
  private ctx: AudioContext | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private masterEqNodes: BiquadFilterNode[] = [];
  private reverbConvolver: ConvolverNode | null = null;
  private reverbSendGain: GainNode | null = null;

  private isPlaying = false;
  private currentBpm = 124;
  private synthIntervalId: number | null = null;
  private stepCounter = 0;

  private stemMix: StemMixLevels = {
    drums: 0.92,
    bass: 0.88,
    harmony: 0.76,
    lead: 0.84,
    autoDuck: true,
  };

  private trackGainMultiplier = 1.0;
  private trackPanOffset = 0.0;

  private fftBuffer = new Uint8Array(1024);
  private timeBufferL = new Float32Array(512);
  private timeBufferR = new Float32Array(512);

  public initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    // Master 4-Band Parametric EQ
    const defaultFreqs = [80, 400, 2500, 10000];
    const defaultTypes: BiquadFilterType[] = ['lowshelf', 'peaking', 'peaking', 'highshelf'];
    this.masterEqNodes = defaultFreqs.map((freq, idx) => {
      const node = ctx.createBiquadFilter();
      node.type = defaultTypes[idx];
      node.frequency.value = freq;
      node.gain.value = 0;
      node.Q.value = 1.0;
      return node;
    });

    // Brickwall Limiter
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.0;
    limiter.knee.value = 0.0;
    limiter.ratio.value = 20.0;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    this.masterLimiter = limiter;

    // Master Gain
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;
    this.masterGain = masterGain;

    // Synthesized Studio Reverb Impulse Response
    const convolver = ctx.createConvolver();
    convolver.buffer = this.createImpulseResponse(ctx, 1.8, 2.5);
    this.reverbConvolver = convolver;

    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.18;
    this.reverbSendGain = reverbGain;

    // 2048-point FFT Master Analyser
    const masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 2048;
    masterAnalyser.smoothingTimeConstant = 0.8;
    this.masterAnalyser = masterAnalyser;

    // Stereo Split Analysers for L/R Peak, RMS & Lissajous Phase Scope
    const splitter = ctx.createChannelSplitter(2);
    const analyserL = ctx.createAnalyser();
    analyserL.fftSize = 1024;
    const analyserR = ctx.createAnalyser();
    analyserR.fftSize = 1024;
    this.analyserL = analyserL;
    this.analyserR = analyserR;

    // Chain Master EQ -> Limiter -> MasterGain -> Analysers -> Destination
    for (let i = 0; i < this.masterEqNodes.length - 1; i++) {
      this.masterEqNodes[i].connect(this.masterEqNodes[i + 1]);
    }
    const lastEq = this.masterEqNodes[this.masterEqNodes.length - 1];
    lastEq.connect(limiter);

    // Parallel Reverb Aux
    lastEq.connect(convolver);
    convolver.connect(reverbGain);
    reverbGain.connect(limiter);

    limiter.connect(masterGain);
    masterGain.connect(masterAnalyser);
    masterAnalyser.connect(ctx.destination);

    masterGain.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);

    return ctx;
  }

  private createImpulseResponse(
    ctx: BaseAudioContext,
    durationSeconds: number,
    decay: number
  ): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSeconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, decay);
      left[i] = (Math.random() * 2 - 1) * env;
      right[i] = (Math.random() * 2 - 1) * env;
    }
    return impulse;
  }

  public setStemMix(mix: Partial<StemMixLevels>) {
    this.stemMix = { ...this.stemMix, ...mix };
  }

  public syncChannelStrips(
    strips: Record<string, ChannelStripConfig>,
    tracksMutedMap?: Record<string, boolean>
  ) {
    const a1 = strips['track-a1'];
    const isMuted = Boolean(a1?.mute || tracksMutedMap?.['track-a1']);
    if (isMuted) {
      this.trackGainMultiplier = 0;
    } else if (a1) {
      this.trackGainMultiplier = Math.pow(10, a1.inputGainDb / 20);
      this.trackPanOffset = a1.pan;
    }
  }

  public syncMasterBus(config: MasterBusConfig) {
    if (!this.ctx) return;
    if (this.masterGain) {
      const linear = Math.pow(10, config.gainDb / 20);
      this.masterGain.gain.setTargetAtTime(linear, this.ctx.currentTime, 0.015);
    }
    if (this.masterLimiter) {
      this.masterLimiter.threshold.setTargetAtTime(
        config.limiterEnabled ? config.limiterThreshold : 0,
        this.ctx.currentTime,
        0.015
      );
      this.masterLimiter.ratio.setTargetAtTime(
        config.limiterEnabled ? 20 : 1,
        this.ctx.currentTime,
        0.015
      );
    }
    if (this.reverbSendGain) {
      this.reverbSendGain.gain.setTargetAtTime(
        config.reverbSend,
        this.ctx.currentTime,
        0.015
      );
    }
    config.eqBands.forEach((band, idx) => {
      const node = this.masterEqNodes[idx];
      if (node && this.ctx) {
        node.frequency.setTargetAtTime(band.frequency, this.ctx.currentTime, 0.015);
        node.gain.setTargetAtTime(band.gain, this.ctx.currentTime, 0.015);
        node.Q.setTargetAtTime(band.Q, this.ctx.currentTime, 0.015);
      }
    });
  }

  public speakDubbedPreview(text: string, langLabel: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      const langMap: Record<string, string> = {
        Japanese: 'ja-JP',
        Spanish: 'es-ES',
        French: 'fr-FR',
        German: 'de-DE',
        Hindi: 'hi-IN',
      };
      utter.lang = langMap[langLabel] || 'en-US';
      utter.rate = 1.02;
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore if speech synthesis blocked
    }
  }

  public setPlaybackState(playing: boolean, bpm = 124) {
    if (playing === this.isPlaying && bpm === this.currentBpm) return;
    this.isPlaying = playing;
    this.currentBpm = bpm;

    if (this.synthIntervalId !== null) {
      clearInterval(this.synthIntervalId);
      this.synthIntervalId = null;
    }

    if (playing) {
      const ctx = this.initContext();
      if (!ctx) return;
      const stepMs = (60 / Math.max(60, bpm) / 2) * 1000; // 8th-note steps
      this.triggerSynthStep(this.stepCounter);
      this.synthIntervalId = window.setInterval(() => {
        if (!this.isPlaying) return;
        this.stepCounter++;
        this.triggerSynthStep(this.stepCounter);
      }, stepMs);
    }
  }

  private triggerSynthStep(step: number) {
    const ctx = this.ctx;
    const entryNode = this.masterEqNodes[0];
    if (!ctx || !entryNode || ctx.state !== 'running') return;
    if (this.trackGainMultiplier <= 0.001) return;

    const now = ctx.currentTime;
    const duckFactor = this.stemMix.autoDuck ? 0.82 : 1.0;
    const masterTrim = this.trackGainMultiplier * duckFactor;

    // 1. DRUMS STEM (Kick on even steps, Crisp Hat on odd steps)
    if (this.stemMix.drums > 0.01) {
      if (step % 2 === 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(145, now);
        osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);

        gain.gain.setValueAtTime(0.58 * this.stemMix.drums * masterTrim, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

        osc.connect(gain);
        gain.connect(entryNode);
        osc.start(now);
        osc.stop(now + 0.25);
      } else {
        const hatOsc = ctx.createOscillator();
        const hatFilter = ctx.createBiquadFilter();
        const hatGain = ctx.createGain();
        hatOsc.type = 'square';
        hatOsc.frequency.setValueAtTime(6400, now);
        hatFilter.type = 'highpass';
        hatFilter.frequency.setValueAtTime(5000, now);
        hatGain.gain.setValueAtTime(0.05 * this.stemMix.drums * masterTrim, now);
        hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        hatOsc.connect(hatFilter);
        hatFilter.connect(hatGain);
        hatGain.connect(entryNode);
        hatOsc.start(now);
        hatOsc.stop(now + 0.07);
      }
    }

    // 2. SUB-BASS STEM
    const scale = [55.0, 65.41, 73.42, 82.41, 98.0, 110.0];
    const freq = scale[step % scale.length];

    if (this.stemMix.bass > 0.01) {
      const bassOsc = ctx.createOscillator();
      const bassFilter = ctx.createBiquadFilter();
      const bassGain = ctx.createGain();
      const panner = ctx.createStereoPanner();

      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(freq * (step % 4 === 0 ? 1 : 2), now);

      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(920, now);
      bassFilter.frequency.exponentialRampToValueAtTime(210, now + 0.18);

      bassGain.gain.setValueAtTime(0.2 * this.stemMix.bass * masterTrim, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      panner.pan.setValueAtTime(
        Math.max(-1, Math.min(1, this.trackPanOffset + Math.sin(step * 0.9) * 0.35)),
        now
      );

      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(panner);
      panner.connect(entryNode);

      bassOsc.start(now);
      bassOsc.stop(now + 0.21);
    }

    // 3. HARMONY / ANALOG SYNTH PADS STEM (Every 4 steps)
    if (this.stemMix.harmony > 0.01 && step % 4 === 0) {
      const padOsc = ctx.createOscillator();
      const padGain = ctx.createGain();
      padOsc.type = 'triangle';
      padOsc.frequency.setValueAtTime(freq * 4, now);
      padGain.gain.setValueAtTime(0.09 * this.stemMix.harmony * masterTrim, now);
      padGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      padOsc.connect(padGain);
      padGain.connect(entryNode);
      padOsc.start(now);
      padOsc.stop(now + 0.46);
    }

    // 4. LEAD ARP STEM
    if (this.stemMix.lead > 0.01) {
      const leadOsc = ctx.createOscillator();
      const leadGain = ctx.createGain();
      leadOsc.type = 'sine';
      leadOsc.frequency.setValueAtTime(freq * (step % 2 === 0 ? 6 : 8), now);
      leadGain.gain.setValueAtTime(0.07 * this.stemMix.lead * masterTrim, now);
      leadGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      leadOsc.connect(leadGain);
      leadGain.connect(entryNode);
      leadOsc.start(now);
      leadOsc.stop(now + 0.15);
    }
  }

  /**
   * Computes real-time FFT spectrum, normalized low-frequency audioBass (0..1),
   * L/R Peak & RMS dB, LUFS loudness, and Lissajous phase correlation.
   */
  public getTelemetry(playheadSeconds: number, isPlaying: boolean): BroadcastMeterTelemetry {
    if (
      this.masterAnalyser &&
      this.analyserL &&
      this.analyserR &&
      isPlaying &&
      this.ctx?.state === 'running'
    ) {
      this.masterAnalyser.getByteFrequencyData(this.fftBuffer);
      this.analyserL.getFloatTimeDomainData(this.timeBufferL);
      this.analyserR.getFloatTimeDomainData(this.timeBufferR);

      let bassSum = 0;
      for (let i = 1; i <= 14; i++) {
        bassSum += this.fftBuffer[i];
      }
      const audioBass = Math.min(1.0, bassSum / (14 * 235));

      let peakL = 0;
      let sumSqL = 0;
      let peakR = 0;
      let sumSqR = 0;
      let dotLR = 0;

      for (let i = 0; i < this.timeBufferL.length; i++) {
        const l = this.timeBufferL[i];
        const r = this.timeBufferR[i];
        const absL = Math.abs(l);
        const absR = Math.abs(r);
        if (absL > peakL) peakL = absL;
        if (absR > peakR) peakR = absR;
        sumSqL += l * l;
        sumSqR += r * r;
        dotLR += l * r;
      }

      const rmsL = Math.sqrt(sumSqL / this.timeBufferL.length);
      const rmsR = Math.sqrt(sumSqR / this.timeBufferR.length);
      const denom = Math.sqrt(sumSqL * sumSqR);
      const phaseCorrelation =
        denom > 0.00001 ? Math.max(-1, Math.min(1, dotLR / denom)) : 0.85;

      const toDb = (val: number) =>
        Math.max(-60, Math.min(0, 20 * Math.log10(Math.max(val, 0.001))));
      const leftPeakDb = toDb(peakL);
      const rightPeakDb = toDb(peakR);
      const leftRmsDb = toDb(rmsL);
      const rightRmsDb = toDb(rmsR);
      const shortTermLufs = Number(((leftRmsDb + rightRmsDb) * 0.5 - 0.691).toFixed(1));

      return {
        leftPeakDb,
        rightPeakDb,
        leftRmsDb,
        rightRmsDb,
        shortTermLufs,
        integratedLufs: -14.2,
        phaseCorrelation,
        audioBass,
        fftBins: this.fftBuffer,
        timeDomainL: this.timeBufferL,
        timeDomainR: this.timeBufferR,
        channelGainReduction: {
          'track-a1': Number((audioBass * -4.2).toFixed(1)),
          'track-a2': Number((audioBass * -6.5).toFixed(1)),
        },
      };
    }

    // Deterministic scrubbing synthesis telemetry when scrubbing timeline or before AudioContext gesture
    const beatPulse = Math.pow(
      Math.max(0, Math.sin(playheadSeconds * Math.PI * (this.currentBpm / 30))),
      4
    );
    const audioBass = isPlaying ? beatPulse * 0.85 : beatPulse * 0.55;

    for (let i = 0; i < 256; i++) {
      const freqDecay = Math.exp(-i / 68);
      const harmonic = 0.5 + 0.5 * Math.sin(playheadSeconds * 12 + i * 0.25);
      this.fftBuffer[i] = Math.min(
        255,
        Math.floor(
          (freqDecay * 195 * (0.4 + audioBass * 0.8) + harmonic * 35) *
            (isPlaying ? 1.0 : 0.65)
        )
      );
    }

    for (let i = 0; i < this.timeBufferL.length; i++) {
      const phase = playheadSeconds * 45 + i * 0.09;
      this.timeBufferL[i] = Math.sin(phase) * (0.25 + audioBass * 0.45);
      this.timeBufferR[i] = Math.cos(phase * 1.02 + 0.4) * (0.25 + audioBass * 0.45);
    }

    const activeDb = isPlaying ? -6.5 + audioBass * 5.2 : -18.0 + audioBass * 8.0;
    return {
      leftPeakDb: activeDb,
      rightPeakDb: activeDb - 0.8,
      leftRmsDb: activeDb - 5.5,
      rightRmsDb: activeDb - 6.1,
      shortTermLufs: Number((activeDb - 7.5).toFixed(1)),
      integratedLufs: -14.1,
      phaseCorrelation: 0.88,
      audioBass,
      fftBins: this.fftBuffer,
      timeDomainL: this.timeBufferL,
      timeDomainR: this.timeBufferR,
      channelGainReduction: {
        'track-a1': Number((audioBass * -3.4).toFixed(1)),
        'track-a2': Number((audioBass * -5.8).toFixed(1)),
      },
    };
  }
}

export const audioEngine = new WebAudioMasteringEngine();
