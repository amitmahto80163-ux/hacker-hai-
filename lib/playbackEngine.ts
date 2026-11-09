export type EasingMode = 'linear' | 'easeIn' | 'easeOut' | 'bezier';

export interface KeyframePoint {
  id: string;
  time: number; // seconds
  value: number;
  easing: EasingMode;
}

type PlayheadListener = (timeSeconds: number, isPlaying: boolean) => void;

/**
 * High-Frequency 60fps Playhead & Scrubbing Clock
 * Decouples real-time playhead updates from full React component tree re-renders
 * using direct pub/sub listeners and requestAnimationFrame.
 */
class HighFrequencyPlaybackEngine {
  private currentTime = 0;
  private duration = 16;
  private fps = 30;
  private isPlaying = false;
  private playbackRate = 1; // Supports J (-1, -2, -4), K (0), L (1, 2, 4)
  private loopEnabled = true;
  private inPoint = 0;
  private outPoint = 16;

  private rafId: number | null = null;
  private lastFrameTimestamp = 0;
  private listeners = new Set<PlayheadListener>();

  public getTime(): number {
    return this.currentTime;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getPlaybackRate(): number {
    return this.playbackRate;
  }

  public configure(opts: {
    duration?: number;
    fps?: number;
    loopEnabled?: boolean;
    inPoint?: number;
    outPoint?: number;
  }) {
    if (opts.duration !== undefined) this.duration = Math.max(1, opts.duration);
    if (opts.fps !== undefined) this.fps = opts.fps;
    if (opts.loopEnabled !== undefined) this.loopEnabled = opts.loopEnabled;
    if (opts.inPoint !== undefined) this.inPoint = Math.max(0, opts.inPoint);
    if (opts.outPoint !== undefined) this.outPoint = Math.min(this.duration, opts.outPoint);
  }

  public seek(timeSeconds: number) {
    this.currentTime = Math.max(0, Math.min(this.duration, timeSeconds));
    this.notify();
  }

  public stepFrames(deltaFrames: number) {
    this.pause();
    const frameDuration = 1 / this.fps;
    this.seek(this.currentTime + deltaFrames * frameDuration);
  }

  public play(rate = 1) {
    this.playbackRate = rate;
    if (this.isPlaying) {
      this.notify();
      return;
    }
    this.isPlaying = true;
    this.lastFrameTimestamp = performance.now();
    this.tick(this.lastFrameTimestamp);
    this.notify();
  }

  public pause() {
    this.isPlaying = false;
    this.playbackRate = 0;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.notify();
  }

  public togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play(1);
    }
  }

  /**
   * J / K / L Studio Shuttle Control
   */
  public shuttleJKL(key: 'j' | 'k' | 'l') {
    if (key === 'k') {
      this.pause();
      return;
    }
    if (key === 'l') {
      const nextRate = !this.isPlaying || this.playbackRate < 0
        ? 1
        : this.playbackRate === 1
        ? 2
        : this.playbackRate === 2
        ? 4
        : 1;
      this.play(nextRate);
    } else if (key === 'j') {
      const nextRate = !this.isPlaying || this.playbackRate > 0
        ? -1
        : this.playbackRate === -1
        ? -2
        : this.playbackRate === -2
        ? -4
        : -1;
      this.play(nextRate);
    }
  }

  private tick = (now: number) => {
    if (!this.isPlaying) return;
    const dt = Math.min(0.1, (now - this.lastFrameTimestamp) / 1000);
    this.lastFrameTimestamp = now;

    let nextTime = this.currentTime + dt * this.playbackRate;
    const minBound = this.inPoint > 0 ? this.inPoint : 0;
    const maxBound = this.outPoint > minBound ? this.outPoint : this.duration;

    if (nextTime >= maxBound) {
      if (this.loopEnabled) {
        nextTime = minBound;
      } else {
        nextTime = maxBound;
        this.pause();
        return;
      }
    } else if (nextTime < minBound) {
      if (this.loopEnabled) {
        nextTime = maxBound;
      } else {
        nextTime = minBound;
        this.pause();
        return;
      }
    }

    this.currentTime = nextTime;
    this.notify();
    this.rafId = requestAnimationFrame(this.tick);
  };

  public subscribe(listener: PlayheadListener): () => void {
    this.listeners.add(listener);
    listener(this.currentTime, this.isPlaying);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.currentTime, this.isPlaying);
    }
  }

  /**
   * Formats seconds into SMPTE Timecode HH:MM:SS:FF
   */
  public static formatTimecode(seconds: number, fps = 30): string {
    const safeSec = Math.max(0, seconds);
    const totalFrames = Math.floor(safeSec * fps);
    const ff = totalFrames % fps;
    const totalSeconds = Math.floor(safeSec);
    const ss = totalSeconds % 60;
    const mm = Math.floor(totalSeconds / 60) % 60;
    const hh = Math.floor(totalSeconds / 3600);

    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
  }

  /**
   * Evaluates a keyframe curve at time t using Linear, Ease-In, Ease-Out, or Cubic Bezier interpolation.
   */
  public static evaluateKeyframes(
    keyframes: KeyframePoint[] | undefined,
    time: number,
    fallbackValue: number
  ): number {
    if (!keyframes || keyframes.length === 0) return fallbackValue;
    const sorted = [...keyframes].sort((a, b) => a.time - b.time);
    if (time <= sorted[0].time) return sorted[0].value;
    if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;

    for (let i = 0; i < sorted.length - 1; i++) {
      const k0 = sorted[i];
      const k1 = sorted[i + 1];
      if (time >= k0.time && time <= k1.time) {
        const span = Math.max(0.0001, k1.time - k0.time);
        const rawT = (time - k0.time) / span;
        let easedT = rawT;

        if (k0.easing === 'easeIn') {
          easedT = rawT * rawT;
        } else if (k0.easing === 'easeOut') {
          easedT = 1 - (1 - rawT) * (1 - rawT);
        } else if (k0.easing === 'bezier') {
          easedT = rawT * rawT * (3 - 2 * rawT);
        }

        return k0.value + (k1.value - k0.value) * easedT;
      }
    }

    return fallbackValue;
  }
}

export const playbackEngine = new HighFrequencyPlaybackEngine();
export { HighFrequencyPlaybackEngine };
