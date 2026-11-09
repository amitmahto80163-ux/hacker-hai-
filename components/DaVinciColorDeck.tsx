'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '@/lib/store';
import { HOLLYWOOD_30_LUTS, ColorScienceEngine, CameraLogProfile, TargetColorSpace } from '@/lib/ColorScienceEngine';
import {
  Palette,
  Activity,
  Camera,
  RotateCcw,
  Sparkles,
  Sun,
  Contrast,
  Droplets,
  Eye,
  CircleDot,
  Layers,
  Check,
} from 'lucide-react';

interface StillsGalleryItem {
  id: string;
  label: string;
  timecode: string;
  lift: [number, number, number];
  gamma: [number, number, number];
  gain: [number, number, number];
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  accentGradient: string;
}

const INITIAL_STILLS: StillsGalleryItem[] = [
  {
    id: 'still-1',
    label: 'PG 01 · Anamorphic Teal & Amber',
    timecode: '00:00:02:14',
    lift: [-0.04, 0.01, 0.06],
    gamma: [1.02, 1.0, 0.96],
    gain: [1.12, 1.03, 0.9],
    contrast: 1.16,
    saturation: 1.22,
    temperature: -12,
    tint: 4,
    accentGradient: 'from-cyan-900 via-slate-900 to-amber-700',
  },
  {
    id: 'still-2',
    label: 'PG 02 · Kodak 2383 Print Film',
    timecode: '00:00:06:08',
    lift: [0.02, -0.01, -0.03],
    gamma: [1.05, 1.02, 0.95],
    gain: [1.15, 1.08, 0.92],
    contrast: 1.22,
    saturation: 1.15,
    temperature: 18,
    tint: -2,
    accentGradient: 'from-amber-900 via-stone-900 to-yellow-700',
  },
  {
    id: 'still-3',
    label: 'PG 03 · Matrix Cyber Emerald',
    timecode: '00:00:09:22',
    lift: [-0.05, 0.04, -0.04],
    gamma: [0.92, 1.08, 0.94],
    gain: [0.9, 1.18, 0.95],
    contrast: 1.24,
    saturation: 0.92,
    temperature: -8,
    tint: 24,
    accentGradient: 'from-emerald-950 via-teal-900 to-green-700',
  },
  {
    id: 'still-4',
    label: 'PG 04 · Bleach Bypass Silver',
    timecode: '00:00:12:04',
    lift: [-0.06, -0.06, -0.04],
    gamma: [0.96, 0.96, 0.98],
    gain: [1.18, 1.18, 1.22],
    contrast: 1.34,
    saturation: 0.48,
    temperature: -20,
    tint: 0,
    accentGradient: 'from-zinc-900 via-slate-700 to-zinc-400',
  },
];

export default function DaVinciColorDeck({
  masterCanvasRef,
}: {
  masterCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const {
    clips,
    selectedClipId,
    updateClip,
    updateShaderUniform,
    addShaderToClip,
  } = useStudioStore();

  const selectedClip =
    clips.find((c) => c.id === selectedClipId) ||
    clips.find((c) => c.trackId === 'track-vfx') ||
    clips[0];

  const [centerMode, setCenterMode] = useState<'curves' | 'warper' | 'windows' | 'qualifier'>('curves');
  const [activeScope, setActiveScope] = useState<'parade' | 'vectorscope' | 'waveform' | 'quad'>('quad');
  const [activeCurveChannel, setActiveCurveChannel] = useState<'master' | 'red' | 'green' | 'blue' | 'hueVsSat'>('master');
  const [curvePoints, setCurvePoints] = useState<Array<{ x: number; y: number }>>([
    { x: 0.0, y: 0.0 },
    { x: 0.25, y: 0.2 },
    { x: 0.5, y: 0.53 },
    { x: 0.75, y: 0.82 },
    { x: 1.0, y: 1.0 },
  ]);
  const [stills, setStills] = useState<StillsGalleryItem[]>(INITIAL_STILLS);
  const [powerWindow, setPowerWindow] = useState({
    enabled: true,
    shape: 'circle' as 'circle' | 'linear' | 'polygon',
    size: 62,
    softness: 28,
    invert: false,
  });
  const [qualifier, setQualifier] = useState({
    enabled: false,
    preset: 'Skin Tones (I-Line)',
    hueCenter: 24,
    hueWidth: 36,
    satLow: 18,
    lumaLow: 15,
    denoise: 12,
  });
  const [cstLog, setCstLog] = useState<CameraLogProfile>('ARRI-LogC4-AWG4');
  const [cstTarget, setCstTarget] = useState<TargetColorSpace>('Rec709-Gamma2.4');

  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const warperCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync colorGrading changes directly into the clip's WebGL2 'colorGrade' shader pass so changes render at 60fps
  const applyGradeToClipAndShader = (
    nextGrade: NonNullable<typeof selectedClip>['colorGrading']
  ) => {
    if (!selectedClip) return;
    updateClip(selectedClip.id, { colorGrading: nextGrade });

    let cgPass = selectedClip.effectStack.find((p) => p.shaderId === 'colorGrade');
    if (!cgPass) {
      addShaderToClip(selectedClip.id, 'colorGrade');
      cgPass = useStudioStore
        .getState()
        .clips.find((c) => c.id === selectedClip.id)
        ?.effectStack.find((p) => p.shaderId === 'colorGrade');
    }
    if (cgPass) {
      updateShaderUniform(selectedClip.id, cgPass.instanceId, 'u_lift', nextGrade.lift);
      updateShaderUniform(selectedClip.id, cgPass.instanceId, 'u_gamma', nextGrade.gamma);
      updateShaderUniform(selectedClip.id, cgPass.instanceId, 'u_gain', nextGrade.gain);
      updateShaderUniform(selectedClip.id, cgPass.instanceId, 'u_contrast', [nextGrade.contrast]);
      updateShaderUniform(selectedClip.id, cgPass.instanceId, 'u_saturation', [nextGrade.saturation]);
      updateShaderUniform(selectedClip.id, cgPass.instanceId, 'u_temperature', [
        nextGrade.temperature / 100,
      ]);
    }
  };

  // Real-time 60fps Broadcast Video Scopes Engine (Samples pixels from master WebGL2 Canvas)
  useEffect(() => {
    const scopeCanvas = scopeCanvasRef.current;
    if (!scopeCanvas) return;

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 96;
    sampleCanvas.height = 54;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

    const interval = window.setInterval(() => {
      const srcCanvas = masterCanvasRef.current;
      const ctx = scopeCanvas.getContext('2d');
      if (!ctx || !sampleCtx) return;

      const w = scopeCanvas.width;
      const h = scopeCanvas.height;
      ctx.fillStyle = '#05060a';
      ctx.fillRect(0, 0, w, h);

      let pixels: Uint8ClampedArray | null = null;
      if (srcCanvas && srcCanvas.width > 0) {
        try {
          sampleCtx.drawImage(srcCanvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
          pixels = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
        } catch {
          pixels = null;
        }
      }

      const drawParade = (ox: number, oy: number, pw: number, ph: number) => {
        // IRE Graticule lines
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
          const gy = oy + (ph * i) / 4;
          ctx.beginPath();
          ctx.moveTo(ox, gy);
          ctx.lineTo(ox + pw, gy);
          ctx.stroke();
        }

        const colW = pw / 3;
        const sw = sampleCanvas.width;
        const sh = sampleCanvas.height;

        if (pixels) {
          for (let sx = 0; sx < sw; sx += 2) {
            const normX = sx / sw;
            for (let sy = 0; sy < sh; sy += 2) {
              const idx = (sy * sw + sx) * 4;
              const r = pixels[idx] / 255;
              const g = pixels[idx + 1] / 255;
              const b = pixels[idx + 2] / 255;

              // Red trace
              ctx.fillStyle = 'rgba(244, 63, 94, 0.32)';
              ctx.fillRect(ox + normX * (colW - 4), oy + ph - r * (ph - 6) - 3, 2, 2);

              // Green trace
              ctx.fillStyle = 'rgba(16, 185, 129, 0.32)';
              ctx.fillRect(ox + colW + normX * (colW - 4), oy + ph - g * (ph - 6) - 3, 2, 2);

              // Blue trace
              ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
              ctx.fillRect(ox + colW * 2 + normX * (colW - 4), oy + ph - b * (ph - 6) - 3, 2, 2);
            }
          }
        }

        ctx.fillStyle = '#71717a';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillText('RGB PARADE (100 IRE)', ox + 6, oy + 11);
      };

      const drawVectorscope = (ox: number, oy: number, pw: number, ph: number) => {
        const cx = ox + pw / 2;
        const cy = oy + ph / 2 + 4;
        const radius = Math.min(pw, ph) * 0.4;

        // Outer graticule ring
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Skin-Tone I-Line (~123 deg in vectorscope space)
        const iAngle = -Math.PI * 0.62;
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(iAngle) * radius, cy + Math.sin(iAngle) * radius);
        ctx.stroke();

        // 6 Broadcast Color Target Boxes (R, M, B, C, G, Y)
        const targets = [
          { label: 'R', angle: -1.8, col: '#f43f5e' },
          { label: 'M', angle: -0.8, col: '#d946ef' },
          { label: 'B', angle: 0.1, col: '#38bdf8' },
          { label: 'C', angle: 1.3, col: '#22d3ee' },
          { label: 'G', angle: 2.3, col: '#10b981' },
          { label: 'Y', angle: 3.0, col: '#eab308' },
        ];
        targets.forEach((t) => {
          const tx = cx + Math.cos(t.angle) * (radius * 0.72);
          const ty = cy + Math.sin(t.angle) * (radius * 0.72);
          ctx.strokeStyle = t.col;
          ctx.strokeRect(tx - 3, ty - 3, 6, 6);
        });

        // Plot live UV chrominance vectors
        if (pixels) {
          ctx.fillStyle = 'rgba(34, 211, 238, 0.28)';
          for (let i = 0; i < pixels.length; i += 16) {
            const r = pixels[i] / 255;
            const g = pixels[i + 1] / 255;
            const b = pixels[i + 2] / 255;
            const u = -0.147 * r - 0.289 * g + 0.436 * b;
            const v = 0.615 * r - 0.515 * g - 0.1 * b;
            const vx = cx + u * radius * 1.9;
            const vy = cy - v * radius * 1.9;
            ctx.fillRect(vx, vy, 1.8, 1.8);
          }
        }

        ctx.fillStyle = '#71717a';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillText('CIE VECTORSCOPE + I-LINE', ox + 6, oy + 11);
      };

      const drawWaveform = (ox: number, oy: number, pw: number, ph: number) => {
        const sw = sampleCanvas.width;
        const sh = sampleCanvas.height;
        if (pixels) {
          ctx.fillStyle = 'rgba(52, 211, 153, 0.26)';
          for (let sx = 0; sx < sw; sx++) {
            const normX = sx / sw;
            for (let sy = 0; sy < sh; sy += 2) {
              const idx = (sy * sw + sx) * 4;
              const luma =
                (0.2126 * pixels[idx] + 0.7152 * pixels[idx + 1] + 0.0722 * pixels[idx + 2]) / 255;
              ctx.fillRect(ox + normX * (pw - 6) + 3, oy + ph - luma * (ph - 12) - 4, 1.5, 1.5);
            }
          }
        }
        ctx.fillStyle = '#71717a';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillText('LUMA WAVEFORM (IRE)', ox + 6, oy + 11);
      };

      const drawHistogram = (ox: number, oy: number, pw: number, ph: number) => {
        const bins = 32;
        const rHist = new Array(bins).fill(0);
        const gHist = new Array(bins).fill(0);
        const bHist = new Array(bins).fill(0);

        if (pixels) {
          for (let i = 0; i < pixels.length; i += 16) {
            rHist[Math.min(bins - 1, Math.floor((pixels[i] / 256) * bins))]++;
            gHist[Math.min(bins - 1, Math.floor((pixels[i + 1] / 256) * bins))]++;
            bHist[Math.min(bins - 1, Math.floor((pixels[i + 2] / 256) * bins))]++;
          }
        }

        const maxCount = Math.max(12, ...rHist, ...gHist, ...bHist);
        const barW = (pw - 12) / bins;

        for (let b = 0; b < bins; b++) {
          const rh = (rHist[b] / maxCount) * (ph - 18);
          const gh = (gHist[b] / maxCount) * (ph - 18);
          const bh = (bHist[b] / maxCount) * (ph - 18);
          const bx = ox + 6 + b * barW;

          ctx.fillStyle = 'rgba(244, 63, 94, 0.38)';
          ctx.fillRect(bx, oy + ph - rh - 3, barW - 1, rh);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.38)';
          ctx.fillRect(bx, oy + ph - gh - 3, barW - 1, gh);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.38)';
          ctx.fillRect(bx, oy + ph - bh - 3, barW - 1, bh);
        }

        ctx.fillStyle = '#71717a';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillText('RGB HISTOGRAM', ox + 6, oy + 11);
      };

      if (activeScope === 'quad') {
        const hw = w / 2;
        const hh = h / 2;
        drawParade(0, 0, hw, hh);
        drawVectorscope(hw, 0, hw, hh);
        drawWaveform(0, hh, hw, hh);
        drawHistogram(hw, hh, hw, hh);

        ctx.strokeStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(hw, 0);
        ctx.lineTo(hw, h);
        ctx.moveTo(0, hh);
        ctx.lineTo(w, hh);
        ctx.stroke();
      } else if (activeScope === 'parade') {
        drawParade(0, 0, w, h);
      } else if (activeScope === 'vectorscope') {
        drawVectorscope(0, 0, w, h);
      } else {
        drawWaveform(0, 0, w, h);
      }
    }, 80);

    return () => clearInterval(interval);
  }, [activeScope, masterCanvasRef]);

  // Draw Color Warper Spider-Web Grid when centerMode === 'warper'
  useEffect(() => {
    if (centerMode !== 'warper') return;
    const canvas = warperCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) * 0.44;

    ctx.clearRect(0, 0, w, h);

    // 4 Concentric saturation rings
    for (let rIdx = 1; rIdx <= 4; rIdx++) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, (maxR * rIdx) / 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 12 Hue spokes with draggable intersection pins
    for (let s = 0; s < 12; s++) {
      const angle = (s * Math.PI * 2) / 12;
      const hue = s * 30;
      ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.35)`;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
      ctx.stroke();

      for (let rIdx = 2; rIdx <= 4; rIdx += 2) {
        const px = cx + Math.cos(angle) * ((maxR * rIdx) / 4);
        const py = cy + Math.sin(angle) * ((maxR * rIdx) / 4);
        ctx.fillStyle = `hsl(${hue}, 85%, 60%)`;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [centerMode]);

  if (!selectedClip) return null;

  const cg = selectedClip.colorGrading;

  const handleWheelDrag = (
    wheelType: 'lift' | 'gamma' | 'gain',
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const updateFromEvt = (clientX: number, clientY: number) => {
      const nx = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));

      // Convert 2D wheel vector (nx, -ny) into RGB balance offsets
      const rShift = nx * 0.22 - ny * 0.12;
      const gShift = -ny * 0.2 + nx * -0.08;
      const bShift = -nx * 0.22 + ny * 0.16;

      if (wheelType === 'lift') {
        applyGradeToClipAndShader({
          ...cg,
          lift: [
            Number(rShift.toFixed(2)),
            Number(gShift.toFixed(2)),
            Number(bShift.toFixed(2)),
          ],
        });
      } else if (wheelType === 'gamma') {
        applyGradeToClipAndShader({
          ...cg,
          gamma: [
            Number((1 + rShift).toFixed(2)),
            Number((1 + gShift).toFixed(2)),
            Number((1 + bShift).toFixed(2)),
          ],
        });
      } else {
        applyGradeToClipAndShader({
          ...cg,
          gain: [
            Number((1 + rShift * 1.4).toFixed(2)),
            Number((1 + gShift * 1.4).toFixed(2)),
            Number((1 + bShift * 1.4).toFixed(2)),
          ],
        });
      }
    };

    updateFromEvt(e.clientX, e.clientY);
    const onMove = (me: PointerEvent) => updateFromEvt(me.clientX, me.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const grabCurrentStill = () => {
    const newStill: StillsGalleryItem = {
      id: `still_${Date.now()}`,
      label: `PG 0${stills.length + 1} · Custom Grade`,
      timecode: '00:00:04:12',
      lift: [...cg.lift] as [number, number, number],
      gamma: [...cg.gamma] as [number, number, number],
      gain: [...cg.gain] as [number, number, number],
      contrast: cg.contrast,
      saturation: cg.saturation,
      temperature: cg.temperature,
      tint: cg.tint,
      accentGradient: 'from-indigo-950 via-cyan-900 to-amber-600',
    };
    setStills((prev) => [newStill, ...prev]);
  };

  return (
    <section className="h-76 shrink-0 bg-[#08090e] border-t border-white/[0.08] flex flex-col select-none text-xs overflow-hidden">
      {/* DaVinci Color Deck Sub-Header Bar */}
      <div className="h-8 px-3 bg-[#0d0f17] border-b border-white/[0.07] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
            <Palette className="w-3.5 h-3.5" />
            <span>DaVinci 32-Bit Float Color & Broadcast Scopes Deck</span>
          </div>
          <span className="text-zinc-600">|</span>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-zinc-400">Input CST:</span>
            <select
              value={cstLog}
              onChange={(e) => {
                const prof = e.target.value as CameraLogProfile;
                setCstLog(prof);
                const cst = ColorScienceEngine.getCSTTransformOffsets(prof, cstTarget);
                applyGradeToClipAndShader({
                  ...cg,
                  gamma: cst.gammaOffset,
                  contrast: Number(cst.contrastMultiplier.toFixed(2)),
                  saturation: Number(cst.saturationMultiplier.toFixed(2)),
                });
              }}
              className="bg-[#06070b] border border-white/10 rounded px-2 py-0.5 text-zinc-200 font-mono text-[10px]"
            >
              <option value="ARRI-LogC4-AWG4">ARRI LogC4 / AWG4</option>
              <option value="Sony-SLog3-SGamut3Cine">Sony S-Log3 / S-Gamut3.Cine</option>
              <option value="RED-Log3G10-RWG">RED Log3G10 / RWG</option>
              <option value="Canon-CLog2-CinemaGamut">Canon C-Log2</option>
              <option value="DJI-DLog-DGamut">DJI D-Log</option>
            </select>
            <span className="text-zinc-500">→</span>
            <select
              value={cstTarget}
              onChange={(e) => setCstTarget(e.target.value as TargetColorSpace)}
              className="bg-[#06070b] border border-white/10 rounded px-2 py-0.5 text-amber-300 font-mono text-[10px]"
            >
              <option value="Rec709-Gamma2.4">Rec.709 Gamma 2.4</option>
              <option value="Rec2020-HDR-PQ">HDR PQ (1000 nits)</option>
              <option value="ACEScg-Linear">ACEScct AP1</option>
            </select>
          </div>
        </div>

        {/* Center Mode Switcher: Custom Curves | Color Warper | Power Windows | HSL Qualifier */}
        <div className="flex items-center gap-1 bg-[#06070b] p-0.5 rounded border border-white/[0.07]">
          {(
            [
              { id: 'curves', label: 'Custom Curves' },
              { id: 'warper', label: 'Color Warper' },
              { id: 'windows', label: 'Power Windows' },
              { id: 'qualifier', label: 'HSL 3D Qualifier' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCenterMode(tab.id)}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                centerMode === tab.id
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: Grab Still & Reset All Grades */}
        <div className="flex items-center gap-2">
          <button
            onClick={grabCurrentStill}
            className="px-2.5 py-1 rounded bg-[#141824] hover:bg-[#1c2233] border border-white/10 text-cyan-300 flex items-center gap-1 text-[11px] font-medium"
          >
            <Camera className="w-3 h-3" />
            <span>Grab PowerGrade Still</span>
          </button>
          <button
            onClick={() =>
              applyGradeToClipAndShader({
                lift: [0, 0, 0],
                gamma: [1, 1, 1],
                gain: [1, 1, 1],
                exposure: 0,
                contrast: 1,
                saturation: 1,
                temperature: 0,
                tint: 0,
              })
            }
            className="px-2 py-1 rounded bg-[#141824] hover:bg-rose-950/60 border border-white/10 text-zinc-300 hover:text-rose-300 flex items-center gap-1 text-[11px]"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Grade</span>
          </button>
        </div>
      </div>

      {/* Main 12-Column DaVinci Color Console */}
      <div className="flex-1 grid grid-cols-12 gap-2.5 p-2.5 overflow-hidden">
        {/* COLS 1–5: Primary Color Wheels (Lift, Gamma, Gain) + Bottom Primary Bars */}
        <div className="col-span-5 bg-[#0c0e16] border border-white/[0.07] rounded-lg p-2.5 flex flex-col justify-between">
          <div className="grid grid-cols-3 gap-2.5 flex-1 items-center">
            {(
              [
                {
                  id: 'lift' as const,
                  title: 'LIFT (SHADOWS)',
                  vals: cg.lift,
                  puckX: cg.lift[0] * 140,
                  puckY: -cg.lift[2] * 140,
                },
                {
                  id: 'gamma' as const,
                  title: 'GAMMA (MIDTONES)',
                  vals: cg.gamma,
                  puckX: (cg.gamma[0] - 1) * 140,
                  puckY: -(cg.gamma[2] - 1) * 140,
                },
                {
                  id: 'gain' as const,
                  title: 'GAIN (HIGHLIGHTS)',
                  vals: cg.gain,
                  puckX: (cg.gain[0] - 1) * 100,
                  puckY: -(cg.gain[2] - 1) * 100,
                },
              ]
            ).map((wheel) => (
              <div key={wheel.id} className="flex flex-col items-center gap-1.5">
                <div className="text-[10px] font-mono font-semibold tracking-wider text-zinc-400">
                  {wheel.title}
                </div>

                {/* Tactile Anodized Color Wheel Ring */}
                <div
                  onPointerDown={(e) => handleWheelDrag(wheel.id, e)}
                  style={{
                    background:
                      'conic-gradient(from 0deg, rgba(244,63,94,0.28), rgba(234,179,8,0.28), rgba(16,185,129,0.28), rgba(6,182,212,0.28), rgba(59,130,246,0.28), rgba(217,70,239,0.28), rgba(244,63,94,0.28))',
                  }}
                  className="w-24 h-24 rounded-full p-1.5 border border-white/15 shadow-inner relative cursor-crosshair flex items-center justify-center"
                >
                  <div className="w-full h-full rounded-full bg-[#07080d]/85 border border-white/10 relative flex items-center justify-center">
                    {/* Crosshair lines */}
                    <div className="absolute inset-x-2 h-px bg-white/10" />
                    <div className="absolute inset-y-2 w-px bg-white/10" />

                    {/* Draggable Color Balance Puck */}
                    <div
                      style={{
                        transform: `translate(${Math.max(-32, Math.min(32, wheel.puckX))}px, ${Math.max(
                          -32,
                          Math.min(32, wheel.puckY)
                        )}px)`,
                      }}
                      className="w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-zinc-950 shadow-md pointer-events-none"
                    />
                  </div>
                </div>

                {/* Numeric RGB Triplet Readout */}
                <div className="w-full grid grid-cols-3 gap-1 text-[9px] font-mono text-center bg-[#06070b] border border-white/[0.06] rounded py-0.5 px-1">
                  <span className="text-rose-400">{wheel.vals[0].toFixed(2)}</span>
                  <span className="text-emerald-400">{wheel.vals[1].toFixed(2)}</span>
                  <span className="text-sky-400">{wheel.vals[2].toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Primary Parameter Jog Strip (Contrast, Saturation, Temp, Tint, Exposure) */}
          <div className="grid grid-cols-5 gap-2 pt-2 border-t border-white/[0.07]">
            {[
              {
                label: 'Contrast',
                val: cg.contrast,
                min: 0.5,
                max: 1.8,
                step: 0.02,
                onChange: (v: number) => applyGradeToClipAndShader({ ...cg, contrast: v }),
              },
              {
                label: 'Sat',
                val: cg.saturation,
                min: 0,
                max: 2.0,
                step: 0.02,
                onChange: (v: number) => applyGradeToClipAndShader({ ...cg, saturation: v }),
              },
              {
                label: 'Temp',
                val: cg.temperature,
                min: -50,
                max: 50,
                step: 1,
                onChange: (v: number) => applyGradeToClipAndShader({ ...cg, temperature: v }),
              },
              {
                label: 'Tint',
                val: cg.tint,
                min: -50,
                max: 50,
                step: 1,
                onChange: (v: number) => applyGradeToClipAndShader({ ...cg, tint: v }),
              },
              {
                label: 'Exposure',
                val: cg.exposure,
                min: -2,
                max: 2,
                step: 0.05,
                onChange: (v: number) => applyGradeToClipAndShader({ ...cg, exposure: v }),
              },
            ].map((item) => (
              <div key={item.label} className="bg-[#06070b] border border-white/[0.06] rounded p-1.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-400">{item.label}</span>
                  <span className="font-mono text-amber-400 tabular-nums">
                    {item.val.toFixed(item.step < 1 ? 2 : 0)}
                  </span>
                </div>
                <input
                  type="range"
                  min={item.min}
                  max={item.max}
                  step={item.step}
                  value={item.val}
                  onChange={(e) => item.onChange(Number(e.target.value))}
                  className="w-full accent-amber-500 h-1 mt-1"
                />
              </div>
            ))}
          </div>
        </div>

        {/* COLS 6–8: Custom Curves / Color Warper / Power Windows / Stills Gallery */}
        <div className="col-span-3 bg-[#0c0e16] border border-white/[0.07] rounded-lg p-2.5 flex flex-col justify-between overflow-hidden">
          {centerMode === 'curves' && (
            <div className="flex-1 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-200">
                  Custom Bezier Spline Curves
                </span>
                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'master', label: 'Y', col: 'bg-zinc-200 text-zinc-950' },
                      { id: 'red', label: 'R', col: 'bg-rose-500 text-white' },
                      { id: 'green', label: 'G', col: 'bg-emerald-500 text-zinc-950' },
                      { id: 'blue', label: 'B', col: 'bg-sky-500 text-zinc-950' },
                      { id: 'hueVsSat', label: 'H/S', col: 'bg-amber-500 text-zinc-950' },
                    ] as const
                  ).map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => setActiveCurveChannel(ch.id)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                        activeCurveChannel === ch.id ? ch.col : 'bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive SVG Spline Curve Graph */}
              <svg
                viewBox="0 0 200 110"
                className="w-full h-28 bg-[#05060a] border border-white/[0.07] rounded my-1.5 cursor-crosshair"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const nx = (e.clientX - rect.left) / rect.width;
                  const ny = 1 - (e.clientY - rect.top) / rect.height;
                  const next = [...curvePoints];
                  let closest = 1;
                  let minDist = 999;
                  next.forEach((pt, idx) => {
                    if (idx === 0 || idx === next.length - 1) return;
                    const d = Math.abs(pt.x - nx);
                    if (d < minDist) {
                      minDist = d;
                      closest = idx;
                    }
                  });
                  next[closest] = { x: Number(nx.toFixed(2)), y: Number(ny.toFixed(2)) };
                  setCurvePoints(next);
                  applyGradeToClipAndShader({
                    ...cg,
                    contrast: Number((0.75 + ny * 0.7).toFixed(2)),
                  });
                }}
              >
                <line x1="0" y1="110" x2="200" y2="0" stroke="#1e293b" strokeDasharray="3 3" />
                <polyline
                  fill="none"
                  stroke={
                    activeCurveChannel === 'red'
                      ? '#f43f5e'
                      : activeCurveChannel === 'green'
                      ? '#10b981'
                      : activeCurveChannel === 'blue'
                      ? '#38bdf8'
                      : '#f59e0b'
                  }
                  strokeWidth="2.2"
                  points={curvePoints
                    .map((p) => `${p.x * 200},${(1 - p.y) * 110}`)
                    .join(' ')}
                />
                {curvePoints.map((p, idx) => (
                  <circle
                    key={idx}
                    cx={p.x * 200}
                    cy={(1 - p.y) * 110}
                    r="4"
                    fill="#f8fafc"
                    stroke="#09090b"
                    strokeWidth="1.5"
                  />
                ))}
              </svg>

              {/* Quick PowerGrades Stills Strip */}
              <div className="grid grid-cols-2 gap-1.5">
                {stills.slice(0, 2).map((st) => (
                  <button
                    key={st.id}
                    onClick={() =>
                      applyGradeToClipAndShader({
                        ...cg,
                        lift: st.lift,
                        gamma: st.gamma,
                        gain: st.gain,
                        contrast: st.contrast,
                        saturation: st.saturation,
                        temperature: st.temperature,
                        tint: st.tint,
                      })
                    }
                    className={`p-1.5 rounded bg-gradient-to-r ${st.accentGradient} border border-white/15 text-left hover:border-amber-400 transition-all`}
                  >
                    <div className="text-[10px] font-semibold text-white truncate">
                      {st.label}
                    </div>
                    <div className="text-[9px] font-mono text-white/70">{st.timecode}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {centerMode === 'warper' && (
            <div className="flex-1 flex flex-col items-center justify-between">
              <div className="w-full flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-200">
                  DaVinci Chroma-Luma Color Warper
                </span>
                <span className="text-[10px] font-mono text-cyan-400">12-Spoke Mesh</span>
              </div>
              <canvas
                ref={warperCanvasRef}
                width={220}
                height={145}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                  applyGradeToClipAndShader({
                    ...cg,
                    saturation: Number(Math.max(0.4, Math.min(1.8, 1.1 + nx * 0.4)).toFixed(2)),
                  });
                }}
                className="bg-[#05060a] rounded border border-white/[0.07] cursor-pointer"
              />
              <div className="text-[10px] text-zinc-400 text-center">
                Click any spoke pin to warp Hue & Saturation vectors directly
              </div>
            </div>
          )}

          {centerMode === 'windows' && (
            <div className="flex-1 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-200">
                  Power Windows (Vignette Matte)
                </span>
                <input
                  type="checkbox"
                  checked={powerWindow.enabled}
                  onChange={(e) =>
                    setPowerWindow((w) => ({ ...w, enabled: e.target.checked }))
                  }
                  className="accent-amber-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['circle', 'linear', 'polygon'] as const).map((sh) => (
                  <button
                    key={sh}
                    onClick={() => setPowerWindow((w) => ({ ...w, shape: sh }))}
                    className={`py-1.5 rounded border capitalize text-[11px] ${
                      powerWindow.shape === sh
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-semibold'
                        : 'bg-[#06070b] border-white/10 text-zinc-400'
                    }`}
                  >
                    {sh}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-400">Window Size</span>
                  <span className="font-mono text-amber-400">{powerWindow.size}%</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={100}
                  value={powerWindow.size}
                  onChange={(e) =>
                    setPowerWindow((w) => ({ ...w, size: Number(e.target.value) }))
                  }
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-400">Edge Feather Softness</span>
                  <span className="font-mono text-cyan-400">{powerWindow.softness}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={80}
                  value={powerWindow.softness}
                  onChange={(e) =>
                    setPowerWindow((w) => ({ ...w, softness: Number(e.target.value) }))
                  }
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>
          )}

          {centerMode === 'qualifier' && (
            <div className="flex-1 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-200">
                  3D HSL Secondary Qualifier
                </span>
                <span className="text-[10px] font-mono text-emerald-400">
                  {qualifier.preset}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {['Skin Tones (I-Line)', 'Cyber Neon Cyan', 'Foliage Emerald', 'Sky Highlights'].map(
                  (p) => (
                    <button
                      key={p}
                      onClick={() => setQualifier((q) => ({ ...q, preset: p, enabled: true }))}
                      className={`p-1.5 rounded border text-[10px] text-left truncate ${
                        qualifier.preset === p
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-semibold'
                          : 'bg-[#06070b] border-white/10 text-zinc-400'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-400">Hue Center & Width</span>
                  <span className="font-mono text-amber-400">
                    {qualifier.hueCenter}° ± {qualifier.hueWidth}°
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={qualifier.hueCenter}
                  onChange={(e) =>
                    setQualifier((q) => ({ ...q, hueCenter: Number(e.target.value) }))
                  }
                  className="w-full accent-amber-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* COLS 9–12: Live Broadcast Video Scopes (Quad / Parade / Vectorscope / Waveform) */}
        <div className="col-span-4 bg-[#0c0e16] border border-white/[0.07] rounded-lg p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] font-semibold text-zinc-200">
                Live Broadcast Scopes
              </span>
            </div>
            <div className="flex items-center gap-1 bg-[#06070b] p-0.5 rounded border border-white/[0.07]">
              {(['quad', 'parade', 'vectorscope', 'waveform'] as const).map((sc) => (
                <button
                  key={sc}
                  onClick={() => setActiveScope(sc)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase transition-colors ${
                    activeScope === sc
                      ? 'bg-cyan-500 text-zinc-950 font-bold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {sc === 'vectorscope' ? 'Vector' : sc}
                </button>
              ))}
            </div>
          </div>

          <canvas
            ref={scopeCanvasRef}
            width={360}
            height={176}
            className="w-full flex-1 bg-[#05060a] rounded border border-white/[0.08]"
          />
        </div>
      </div>
    </section>
  );
}
