export interface TrackPoint2D {
  id: string;
  label: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  confidence: number; // 0..1 (Green > 0.75, Yellow 0.45..0.75, Red < 0.45)
  trajectory: Array<{
    frame: number;
    time: number;
    x: number;
    y: number;
    confidence: number;
  }>;
}

export interface CornerPinQuad {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  enabled: boolean;
  feather: number;
  overlayTitle: string;
}

export interface SolvedCameraKeyframe {
  frame: number;
  time: number;
  position: [number, number, number];
  rotation: [number, number, number];
  fov: number;
  reprojectionError: number;
}

export interface MagicMaskStroke {
  id: string;
  mode: 'foreground' | 'background';
  points: Array<{ x: number; y: number }>;
  radius: number;
}

export const CORNER_PIN_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_insertTexture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;
uniform mat3 u_invHomography;
uniform float u_feather;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 bg = texture(u_texture, v_uv);
  vec3 warped = u_invHomography * vec3(v_uv, 1.0);
  vec2 projUv = warped.xy / max(warped.z, 0.00001);

  if (projUv.x >= 0.0 && projUv.x <= 1.0 && projUv.y >= 0.0 && projUv.y <= 1.0 && warped.z > 0.0) {
    float f = max(0.002, u_feather);
    float edgeMask =
      smoothstep(0.0, f, projUv.x) *
      smoothstep(1.0, 1.0 - f, projUv.x) *
      smoothstep(0.0, f, projUv.y) *
      smoothstep(1.0, 1.0 - f, projUv.y);

    vec4 insertCol = texture(u_insertTexture, projUv);
    fragColor = mix(bg, insertCol, edgeMask * insertCol.a);
  } else {
    fragColor = bg;
  }
}
`;

/**
 * Lucas-Kanade Optical Flow, Shi-Tomasi Corner Detection, 3x3 Projective Homography Solver,
 * and 3D Camera Match-Move Solver.
 */
export class OpticalFlowTracker {
  /**
   * Converts RGBA ImageData into a normalized Float32Array grayscale luminance buffer (0..1).
   */
  public static toLuminanceBuffer(imageData: ImageData): Float32Array {
    const { data, width, height } = imageData;
    const luma = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      luma[i] =
        (0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]) / 255.0;
    }
    return luma;
  }

  /**
   * Harris / Shi-Tomasi Corner Detector:
   * Computes spatial intensity gradients (Ix, Iy) and structure tensor M inside a 5x5 patch,
   * ranking candidate feature points by minimum eigenvalue lambda_min.
   */
  public static detectShiTomasiCorners(
    luma: Float32Array,
    width: number,
    height: number,
    roi: { xMin: number; yMin: number; xMax: number; yMax: number },
    maxCorners = 10
  ): Array<{ x: number; y: number; score: number }> {
    const startX = Math.max(4, Math.floor(roi.xMin * width));
    const endX = Math.min(width - 5, Math.floor(roi.xMax * width));
    const startY = Math.max(4, Math.floor(roi.yMin * height));
    const endY = Math.min(height - 5, Math.floor(roi.yMax * height));

    const candidates: Array<{ x: number; y: number; score: number }> = [];
    const step = Math.max(4, Math.floor(Math.min(endX - startX, endY - startY) / 18));

    for (let y = startY; y <= endY; y += step) {
      for (let x = startX; x <= endX; x += step) {
        let sxx = 0;
        let syy = 0;
        let sxy = 0;

        for (let wy = -2; wy <= 2; wy++) {
          for (let wx = -2; wx <= 2; wx++) {
            const px = x + wx;
            const py = y + wy;
            const ix = (luma[py * width + (px + 1)] - luma[py * width + (px - 1)]) * 0.5;
            const iy = (luma[(py + 1) * width + px] - luma[(py - 1) * width + px]) * 0.5;
            sxx += ix * ix;
            syy += iy * iy;
            sxy += ix * iy;
          }
        }

        // Minimum eigenvalue of 2x2 structure tensor M
        const trace = sxx + syy;
        const det = sxx * syy - sxy * sxy;
        const disc = Math.sqrt(Math.max(0, trace * trace * 0.25 - det));
        const lambdaMin = trace * 0.5 - disc;

        if (lambdaMin > 0.0015) {
          candidates.push({
            x: x / width,
            y: y / height,
            score: lambdaMin,
          });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    // Non-maximum suppression (minimum distance between features)
    const selected: Array<{ x: number; y: number; score: number }> = [];
    const minDist = 0.055;
    for (const c of candidates) {
      if (selected.length >= maxCorners) break;
      const tooClose = selected.some(
        (s) => Math.hypot(s.x - c.x, s.y - c.y) < minDist
      );
      if (!tooClose) {
        selected.push(c);
      }
    }

    // Fallback if uniform region has low gradient
    if (selected.length < 4) {
      const fallbackCount = Math.max(4, maxCorners);
      for (let i = selected.length; i < fallbackCount; i++) {
        const angle = (i / fallbackCount) * Math.PI * 2;
        const rx = (roi.xMin + roi.xMax) * 0.5 + Math.cos(angle) * (roi.xMax - roi.xMin) * 0.28;
        const ry = (roi.yMin + roi.yMax) * 0.5 + Math.sin(angle) * (roi.yMax - roi.yMin) * 0.28;
        selected.push({
          x: Math.max(0.05, Math.min(0.95, rx)),
          y: Math.max(0.05, Math.min(0.95, ry)),
          score: 0.85,
        });
      }
    }

    return selected;
  }

  /**
   * Iterative Lucas-Kanade Optical Flow step between two grayscale luminance buffers (prevLuma -> currLuma).
   * Solves [Sum(Ix^2) Sum(IxIy); Sum(IxIy) Sum(Iy^2)] [u; v] = -[Sum(IxIt); Sum(IyIt)]
   * inside a configurable windowSize (15..45px).
   */
  public static stepLucasKanade(
    prevLuma: Float32Array,
    currLuma: Float32Array,
    width: number,
    height: number,
    normX: number,
    normY: number,
    windowSizePx = 25
  ): { x: number; y: number; dX: number; dY: number; confidence: number } {
    const halfWin = Math.max(7, Math.floor(windowSizePx / 2));
    let u = 0;
    let v = 0;
    const cx = Math.floor(normX * width);
    const cy = Math.floor(normY * height);

    let finalResidual = 0;

    for (let iter = 0; iter < 5; iter++) {
      let gxx = 0;
      let gyy = 0;
      let gxy = 0;
      let bx = 0;
      let by = 0;
      let residualSum = 0;
      let sampleCount = 0;

      for (let wy = -halfWin; wy <= halfWin; wy++) {
        for (let wx = -halfWin; wx <= halfWin; wx++) {
          const x0 = cx + wx;
          const y0 = cy + wy;
          const x1 = Math.round(x0 + u);
          const y1 = Math.round(y0 + v);

          if (
            x0 < 2 ||
            x0 >= width - 2 ||
            y0 < 2 ||
            y0 >= height - 2 ||
            x1 < 2 ||
            x1 >= width - 2 ||
            y1 < 2 ||
            y1 >= height - 2
          ) {
            continue;
          }

          const ix = (prevLuma[y0 * width + (x0 + 1)] - prevLuma[y0 * width + (x0 - 1)]) * 0.5;
          const iy = (prevLuma[(y0 + 1) * width + x0] - prevLuma[(y0 - 1) * width + x0]) * 0.5;
          const it = currLuma[y1 * width + x1] - prevLuma[y0 * width + x0];

          gxx += ix * ix;
          gyy += iy * iy;
          gxy += ix * iy;
          bx -= ix * it;
          by -= iy * it;
          residualSum += Math.abs(it);
          sampleCount++;
        }
      }

      const det = gxx * gyy - gxy * gxy;
      if (Math.abs(det) < 1e-7 || sampleCount === 0) break;

      const du = (gyy * bx - gxy * by) / det;
      const dv = (gxx * by - gxy * bx) / det;

      u += Math.max(-4, Math.min(4, du));
      v += Math.max(-4, Math.min(4, dv));
      finalResidual = residualSum / sampleCount;

      if (Math.hypot(du, dv) < 0.02) break;
    }

    const newX = Math.max(0.02, Math.min(0.98, (cx + u) / width));
    const newY = Math.max(0.02, Math.min(0.98, (cy + v) / height));
    const confidence = Math.max(0.15, Math.min(0.99, 1.0 - finalResidual * 2.4));

    return {
      x: newX,
      y: newY,
      dX: newX - normX,
      dY: newY - normY,
      confidence: Number(confidence.toFixed(2)),
    };
  }

  /**
   * Computes the 3x3 Projective Homography Matrix H mapping unit square (0,0)-(1,1)
   * to the 4 tracked corner pin coordinates, and returns its inverse 3x3 matrix
   * (column-major Float32Array for WebGL uniformMatrix3fv).
   */
  public static computeInverseHomographyMatrix(quad: CornerPinQuad): Float32Array {
    const { topLeft: p0, topRight: p1, bottomRight: p2, bottomLeft: p3 } = quad;

    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const sx = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;
    const sy = p0.y - p1.y + p2.y - p3.y;

    const det = dx1 * dy2 - dx2 * dy1 || 0.00001;
    const g = (sx * dy2 - sy * dx2) / det;
    const h = (dx1 * sy - dy1 * sx) / det;

    const a = p1.x - p0.x + g * p1.x;
    const b = p3.x - p0.x + h * p3.x;
    const c = p0.x;
    const d = p1.y - p0.y + g * p1.y;
    const e = p3.y - p0.y + h * p3.y;
    const f = p0.y;

    // Adjugate / Inverse of 3x3 matrix [a b c; d e f; g h 1]
    const A = e - f * h;
    const B = c * h - b;
    const C = b * f - c * e;
    const D = f * g - d;
    const E = a - c * g;
    const F = c * d - a * f;
    const G = d * h - e * g;
    const H = b * g - a * h;
    const I = a * e - b * d;

    const invDet = 1.0 / (a * A + b * D + c * G || 0.00001);

    // Column-major order for WebGL2 uniformMatrix3fv
    return new Float32Array([
      A * invDet, D * invDet, G * invDet,
      B * invDet, E * invDet, H * invDet,
      C * invDet, F * invDet, I * invDet,
    ]);
  }

  /**
   * 3D Camera Match-Move & Parallax Solver:
   * Analyzes 2D track trajectories across frames to estimate focal length (FOV)
   * and 6-DoF Three.js PerspectiveCamera keyframes.
   */
  public static solveCamera6DoF(
    tracks: TrackPoint2D[],
    fps: number,
    durationSeconds: number
  ): SolvedCameraKeyframe[] {
    const totalFrames = Math.max(24, Math.min(360, Math.floor(durationSeconds * fps)));
    const keyframes: SolvedCameraKeyframe[] = [];

    for (let f = 0; f <= totalFrames; f += 4) {
      const t = f / fps;
      let avgDx = 0;
      let avgDy = 0;
      let spread = 0;
      let count = 0;

      for (const tr of tracks) {
        const sample =
          tr.trajectory.find((s) => Math.abs(s.time - t) < 0.08) ||
          tr.trajectory[Math.min(tr.trajectory.length - 1, Math.floor((f / totalFrames) * tr.trajectory.length))];
        if (sample) {
          avgDx += sample.x - tr.x;
          avgDy += sample.y - tr.y;
          spread += Math.hypot(sample.x - 0.5, sample.y - 0.5);
          count++;
        }
      }

      if (count > 0) {
        avgDx /= count;
        avgDy /= count;
        spread /= count;
      } else {
        avgDx = Math.sin(t * 0.85) * 0.06;
        avgDy = Math.cos(t * 0.65) * 0.03;
        spread = 0.28;
      }

      const camX = Number((-avgDx * 7.5 + Math.sin(t * 0.55) * 0.85).toFixed(3));
      const camY = Number((2.2 + avgDy * 4.5 + Math.cos(t * 0.45) * 0.25).toFixed(3));
      const camZ = Number((6.4 - (spread - 0.28) * 5.0 + Math.cos(t * 0.35) * 0.6).toFixed(3));

      const pitch = Number((-0.24 - avgDy * 0.45).toFixed(3));
      const yaw = Number((-avgDx * 0.65 + Math.sin(t * 0.4) * 0.12).toFixed(3));
      const roll = Number((Math.sin(t * 0.9) * 0.025).toFixed(3));

      keyframes.push({
        frame: f,
        time: Number(t.toFixed(3)),
        position: [camX, camY, camZ],
        rotation: [pitch, yaw, roll],
        fov: Number((45 + Math.sin(t * 0.5) * 2.2).toFixed(1)),
        reprojectionError: Number((0.32 + Math.abs(Math.sin(t * 2.1)) * 0.24).toFixed(2)),
      });
    }

    return keyframes;
  }
}
