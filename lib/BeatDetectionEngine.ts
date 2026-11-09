export interface BeatMarker {
  id: string;
  time: number;
  strength: number;
  isDownbeat: boolean;
}

export interface BeatAnalysisResult {
  bpm: number;
  markers: BeatMarker[];
  energyEnvelope: Float32Array;
}

/**
 * Algorithmic Sub-Band Energy Flux Beat Detection Engine using OfflineAudioContext
 * Filters low-end kick/bass transients (<150Hz), computes 1024-sample RMS windows,
 * and identifies onset peaks above a rolling local average with a 200ms cooldown.
 */
export class BeatDetectionEngine {
  /**
   * Generates a deterministic procedural stereo AudioBuffer representing the timeline's
   * cyberpunk synth score + kick drum + dialogue transients so OfflineAudioContext
   * analysis and mixdown work immediately out of the box or with imported audio.
   */
  public static async synthesizeTimelineMasterBuffer(
    durationSeconds: number,
    sampleRate = 48000,
    bpm = 124
  ): Promise<AudioBuffer> {
    const totalSamples = Math.max(sampleRate, Math.floor(durationSeconds * sampleRate));
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

    const left = new Float32Array(totalSamples);
    const right = new Float32Array(totalSamples);

    const beatInterval = 60 / bpm;
    const notes = [55.0, 65.41, 73.42, 82.41]; // A1, C2, D2, E2

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const beatIndex = Math.floor(t / beatInterval);
      const beatPhase = (t % beatInterval) / beatInterval;

      // 1. Punchy 4-on-the-floor Kick Drum (< 150Hz sub-bass transient)
      const kickFreq = 135 * Math.exp(-beatPhase * 18) + 44;
      const kickEnv = Math.exp(-beatPhase * 7.5);
      const kick = Math.sin(2 * Math.PI * kickFreq * beatPhase * beatInterval) * kickEnv * 0.72;

      // 2. Off-beat Snare / Hi-hat transient
      const subBeatPhase = (t % (beatInterval * 0.5)) / (beatInterval * 0.5);
      const hatEnv = Math.exp(-subBeatPhase * 22);
      const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const snare = beatIndex % 2 === 1 && beatPhase < 0.25 ? noise * Math.exp(-beatPhase * 14) * 0.32 : 0;
      const hat = noise * hatEnv * 0.12;

      // 3. Sawtooth Synth Bassline
      const baseNote = notes[beatIndex % notes.length];
      const saw = 2 * ((t * baseNote) - Math.floor(0.5 + t * baseNote));
      const bassEnv = 0.35 + 0.65 * Math.exp(-subBeatPhase * 4.0);
      const bass = saw * bassEnv * 0.26;

      // 4. Shimmering Stereo Arpeggio Pad
      const arpNote = baseNote * 4 * (1 + ((Math.floor(t * 8) % 3) * 0.25));
      const arpL = Math.sin(2 * Math.PI * arpNote * t) * 0.14;
      const arpR = Math.cos(2 * Math.PI * (arpNote * 1.003) * t) * 0.14;

      left[i] = Math.max(-0.98, Math.min(0.98, kick + snare + hat + bass + arpL));
      right[i] = Math.max(-0.98, Math.min(0.98, kick + snare + hat + bass + arpR));
    }

    const rawBuffer = offlineCtx.createBuffer(2, totalSamples, sampleRate);
    rawBuffer.copyToChannel(left, 0);
    rawBuffer.copyToChannel(right, 1);

    const source = offlineCtx.createBufferSource();
    source.buffer = rawBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    return await offlineCtx.startRendering();
  }

  /**
   * Runs Sub-Band Energy Flux Analysis via OfflineAudioContext with a 150Hz low-pass BiquadFilterNode.
   */
  public static async analyzeAudioBuffer(
    sourceBuffer: AudioBuffer,
    sensitivityThreshold = 1.45,
    cooldownSeconds = 0.22
  ): Promise<BeatAnalysisResult> {
    const sampleRate = sourceBuffer.sampleRate;
    const totalSamples = sourceBuffer.length;

    // Pass through 150Hz Low-Pass BiquadFilterNode in OfflineAudioContext
    const offlineCtx = new OfflineAudioContext(1, totalSamples, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = sourceBuffer;

    const lowpass = offlineCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 150;
    lowpass.Q.value = 0.85;

    source.connect(lowpass);
    lowpass.connect(offlineCtx.destination);
    source.start(0);

    const filteredBuffer = await offlineCtx.startRendering();
    const channelData = filteredBuffer.getChannelData(0);

    const windowSize = 1024;
    const numWindows = Math.floor(totalSamples / windowSize);
    const rmsWindows = new Float32Array(numWindows);

    for (let w = 0; w < numWindows; w++) {
      let sumSq = 0;
      const offset = w * windowSize;
      for (let s = 0; s < windowSize; s++) {
        const sample = channelData[offset + s];
        sumSq += sample * sample;
      }
      rmsWindows[w] = Math.sqrt(sumSq / windowSize);
    }

    // Rolling local average across ~43 windows (~0.9s)
    const historyRadius = 21;
    const markers: BeatMarker[] = [];
    let lastBeatTime = -cooldownSeconds;
    let beatCounter = 0;

    for (let w = 1; w < numWindows - 1; w++) {
      const currentEnergy = rmsWindows[w];
      // Must be a local peak
      if (currentEnergy < rmsWindows[w - 1] || currentEnergy < rmsWindows[w + 1]) {
        continue;
      }

      let localSum = 0;
      let count = 0;
      const startW = Math.max(0, w - historyRadius);
      const endW = Math.min(numWindows - 1, w + historyRadius);
      for (let k = startW; k <= endW; k++) {
        localSum += rmsWindows[k];
        count++;
      }
      const localAvg = localSum / Math.max(1, count);

      const timeSec = (w * windowSize) / sampleRate;
      if (
        currentEnergy > localAvg * sensitivityThreshold &&
        currentEnergy > 0.04 &&
        timeSec - lastBeatTime >= cooldownSeconds
      ) {
        const normalizedStrength = Math.min(1.0, currentEnergy / Math.max(0.01, localAvg * 2.2));
        markers.push({
          id: `beat_${beatCounter}_${Math.round(timeSec * 1000)}`,
          time: Number(timeSec.toFixed(3)),
          strength: Number(normalizedStrength.toFixed(2)),
          isDownbeat: beatCounter % 4 === 0,
        });
        lastBeatTime = timeSec;
        beatCounter++;
      }
    }

    // Estimate BPM from median inter-onset interval
    let estimatedBpm = 124;
    if (markers.length >= 4) {
      const intervals: number[] = [];
      for (let i = 1; i < markers.length; i++) {
        const dt = markers[i].time - markers[i - 1].time;
        if (dt >= 0.25 && dt <= 1.2) {
          intervals.push(dt);
        }
      }
      if (intervals.length > 0) {
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)];
        const rawBpm = 60 / medianInterval;
        estimatedBpm = Math.round(rawBpm < 75 ? rawBpm * 2 : rawBpm > 175 ? rawBpm / 2 : rawBpm);
      }
    }

    return {
      bpm: estimatedBpm,
      markers,
      energyEnvelope: rmsWindows,
    };
  }
}
