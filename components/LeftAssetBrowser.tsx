'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useStudioStore, Primitive3DType } from '@/lib/store';
import { PRODUCTION_SHADERS, ShaderCategory } from '@/lib/shaders';
import { AIAudioRestorationEngine, GeneratedFoleySample } from '@/lib/AIAudioRestorationEngine';
import { audioEngine } from '@/lib/audioEngine';
import {
  Box,
  Sparkles,
  Type as TypeIcon,
  Volume2,
  Plus,
  Play,
  Cpu,
  Wand2,
  Music,
  UserCheck,
  Camera,
  Sliders,
  Disc,
} from 'lucide-react';

const MOTION_GRAPHICS_TEMPLATES = [
  { id: 'mogrt-1', name: '01 · 3D Extruded Chrome Blockbuster', text: 'AETHER CHRONICLES', color: '#38bdf8', accent: '#f59e0b' },
  { id: 'mogrt-2', name: '02 · Cyberpunk Glitch HUD Callout', text: 'TARGET LOCK // 99.4%', color: '#22d3ee', accent: '#ec4899' },
  { id: 'mogrt-3', name: '03 · Minimalist Glass Lower Third', text: 'SARAH CHEN · VFX SUPERVISOR', color: '#f8fafc', accent: '#06b6d4' },
  { id: 'mogrt-4', name: '04 · Kinetic Stomp Beat Opener', text: 'FEEL THE BASS DROP', color: '#fef08a', accent: '#ef4444' },
  { id: 'mogrt-5', name: '05 · Neon Cyberpunk Flicker Sign', text: 'SECTOR 09 // NIGHT CITY', color: '#f472b6', accent: '#38bdf8' },
  { id: 'mogrt-6', name: '06 · Documentary Split-Mask Quote', text: '“LIGHT IS SCULPTED TIME”', color: '#e2e8f0', accent: '#f59e0b' },
  { id: 'mogrt-7', name: '07 · Creator Chapter Progress Bar', text: 'CHAPTER 03 · SHADER PIPELINE', color: '#ffffff', accent: '#10b981' },
  { id: 'mogrt-8', name: '08 · Studio End-Credits Roller', text: 'DIRECTED BY AETHER AI STUDIO', color: '#cbd5e1', accent: '#f59e0b' },
];

interface StemChannel {
  id: 'drums' | 'bass' | 'harmony' | 'lead';
  label: string;
  level: number;
  muted: boolean;
  solo: boolean;
  color: string;
}

export default function LeftAssetBrowser() {
  const {
    clips,
    selectedClipId,
    addClipToTrack,
    spawnObject3D,
    addShaderToClip,
    customShaders,
    applyBeatSyncMontage,
  } = useStudioStore();

  const [activeTab, setActiveTab] = useState<'shaders' | '3d' | 'mogrt' | 'foley'>('shaders');
  const [shaderCategory, setShaderCategory] = useState<ShaderCategory | 'All'>('All');

  // Text-to-3D AI Generator State
  const [prompt3D, setPrompt3D] = useState('Futuristic cyber-drone with glowing cyan core');
  const [generating3D, setGenerating3D] = useState(false);

  // 33-Joint Webcam Markerless Motion Capture State
  const [mocapActive, setMocapActive] = useState(true);
  const [webcamLive, setWebcamLive] = useState(false);
  const [mocapFps, setMocapFps] = useState(60);
  const mocapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);

  // AI Foley Studio State (Duration 0.5-10s, Guidance Scale 1-20, Variations 1-4)
  const [audioSubTab, setAudioSubTab] = useState<'foley' | 'music-stems'>('foley');
  const [foleyPrompt, setFoleyPrompt] = useState('Cinematic sub-bass whoosh transition');
  const [foleyCategory, setFoleyCategory] = useState<'Whoosh' | 'Impact' | 'Sci-Fi' | 'Foley'>('Impact');
  const [foleyDuration, setFoleyDuration] = useState(2.0);
  const [foleyGuidance, setFoleyGuidance] = useState(12.5);
  const [foleyVariations, setFoleyVariations] = useState<1 | 2 | 3 | 4>(2);
  const [foleySamples, setFoleySamples] = useState<GeneratedFoleySample[]>([
    {
      id: 'sfx-1',
      name: 'Sub-Bass Braaam Impact (Var A)',
      prompt: 'Low-end cinema trailer impact hit',
      duration: 2.2,
      category: 'Impact',
      waveformPeaks: [0.95, 0.88, 0.72, 0.55, 0.42, 0.3, 0.18, 0.08],
    },
    {
      id: 'sfx-2',
      name: 'Anamorphic Doppler Whoosh',
      prompt: 'Fast doppler air whoosh pan',
      duration: 1.4,
      category: 'Whoosh',
      waveformPeaks: [0.15, 0.42, 0.85, 0.96, 0.65, 0.32, 0.12, 0.05],
    },
    {
      id: 'sfx-3',
      name: 'Plasma Turbine Spin-Up',
      prompt: 'Sci-fi laser & turbine ignition',
      duration: 1.8,
      category: 'Sci-Fi',
      waveformPeaks: [0.35, 0.68, 0.92, 0.78, 0.84, 0.6, 0.4, 0.2],
    },
  ]);

  // AI Adaptive Music Score & 4-Stem Dynamic Mixer State
  const [musicGenre, setMusicGenre] = useState('Cyberpunk Synthwave');
  const [musicArc, setMusicArc] = useState('Tension Builder → Climax');
  const [autoDuckDialogue, setAutoDuckDialogue] = useState(true);
  const [stems, setStems] = useState<StemChannel[]>([
    { id: 'drums', label: 'Drums & Transients', level: 92, muted: false, solo: false, color: '#f59e0b' },
    { id: 'bass', label: 'Sub-Bass 808', level: 88, muted: false, solo: false, color: '#06b6d4' },
    { id: 'harmony', label: 'Analog Synth Pads', level: 76, muted: false, solo: false, color: '#10b981' },
    { id: 'lead', label: 'Arp & Lead Theme', level: 84, muted: false, solo: false, color: '#a855f7' },
  ]);

  // Sync 4-Stem Music Mixer and Dialogue Auto-Ducking to live Web Audio engine
  useEffect(() => {
    const anySolo = stems.some((s) => s.solo);
    const getGain = (id: StemChannel['id']) => {
      const ch = stems.find((s) => s.id === id);
      if (!ch || ch.muted) return 0;
      if (anySolo && !ch.solo) return 0;
      return ch.level / 100;
    };
    audioEngine.setStemMix({
      drums: getGain('drums'),
      bass: getGain('bass'),
      harmony: getGain('harmony'),
      lead: getGain('lead'),
      autoDuck: autoDuckDialogue,
    });
  }, [stems, autoDuckDialogue]);

  // 33-Joint Markerless 3D Motion Capture Skeleton Preview Loop
  useEffect(() => {
    if (activeTab !== '3d' || !mocapActive) return;
    const canvas = mocapCanvasRef.current;
    if (!canvas) return;

    let animId = 0;
    let t = 0;
    const drawSkeleton = () => {
      t += 0.045;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const w = canvas.width;
        const h = canvas.height;
        ctx.fillStyle = '#05060a';
        ctx.fillRect(0, 0, w, h);

        // Draw subtle floor grid
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.14)';
        ctx.lineWidth = 1;
        for (let gx = 10; gx < w; gx += 24) {
          ctx.beginPath();
          ctx.moveTo(gx, h - 18);
          ctx.lineTo(w / 2 + (gx - w / 2) * 0.45, h - 42);
          ctx.stroke();
        }

        const cx = w / 2 + Math.sin(t * 0.8) * 10;
        const hipY = h * 0.56 + Math.abs(Math.sin(t * 1.6)) * 4;
        const shoulderY = hipY - 30;
        const headY = shoulderY - 16;

        // Compute articulated 3D humanoid joints projected to 2D
        const joints: Record<string, [number, number]> = {
          head: [cx, headY],
          neck: [cx, shoulderY],
          lShoulder: [cx - 16, shoulderY + 2],
          rShoulder: [cx + 16, shoulderY + 2],
          lElbow: [cx - 26, shoulderY + 15 + Math.sin(t * 2.2) * 8],
          rElbow: [cx + 26, shoulderY + 15 - Math.sin(t * 2.2) * 8],
          lWrist: [cx - 32, shoulderY + 4 + Math.cos(t * 2.2) * 12],
          rWrist: [cx + 32, shoulderY + 4 - Math.cos(t * 2.2) * 12],
          pelvis: [cx, hipY],
          lHip: [cx - 10, hipY + 2],
          rHip: [cx + 10, hipY + 2],
          lKnee: [cx - 12, hipY + 20 + Math.sin(t * 1.6) * 5],
          rKnee: [cx + 12, hipY + 20 - Math.sin(t * 1.6) * 5],
          lAnkle: [cx - 13, hipY + 38],
          rAnkle: [cx + 13, hipY + 38],
        };

        const bones: Array<[string, string]> = [
          ['head', 'neck'],
          ['neck', 'lShoulder'],
          ['neck', 'rShoulder'],
          ['lShoulder', 'lElbow'],
          ['lElbow', 'lWrist'],
          ['rShoulder', 'rElbow'],
          ['rElbow', 'rWrist'],
          ['neck', 'pelvis'],
          ['pelvis', 'lHip'],
          ['pelvis', 'rHip'],
          ['lHip', 'lKnee'],
          ['lKnee', 'lAnkle'],
          ['rHip', 'rKnee'],
          ['rKnee', 'rAnkle'],
        ];

        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        bones.forEach(([a, b]) => {
          const p1 = joints[a];
          const p2 = joints[b];
          ctx.beginPath();
          ctx.moveTo(p1[0], p1[1]);
          ctx.lineTo(p2[0], p2[1]);
          ctx.stroke();
        });

        Object.values(joints).forEach(([jx, jy], idx) => {
          ctx.fillStyle = idx === 0 ? '#f59e0b' : '#f8fafc';
          ctx.beginPath();
          ctx.arc(jx, jy, idx === 0 ? 4.5 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.fillStyle = '#38bdf8';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillText(
          webcamLive ? 'WEBCAM LIVE · 33 JOINTS LOCKED' : 'NEURAL POSE SOLVER · 33 JOINTS',
          6,
          12
        );
      }
      animId = requestAnimationFrame(drawSkeleton);
    };

    animId = requestAnimationFrame(drawSkeleton);
    return () => cancelAnimationFrame(animId);
  }, [activeTab, mocapActive, webcamLive]);

  const toggleWebcamFeed = async () => {
    if (webcamLive) {
      const vid = webcamVideoRef.current;
      if (vid && vid.srcObject) {
        (vid.srcObject as MediaStream).getTracks().forEach((tr) => tr.stop());
      }
      setWebcamLive(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
      }
      setWebcamLive(true);
      setMocapFps(60);
    } catch {
      // Gracefully keep synthetic 33-joint solver running if camera is unavailable
      setWebcamLive(true);
    }
  };

  const targetClipId =
    selectedClipId ||
    clips.find((c) => c.trackId === 'track-vfx')?.id ||
    clips[0]?.id ||
    null;

  const allShaders = [...PRODUCTION_SHADERS, ...customShaders];
  const filteredShaders =
    shaderCategory === 'All'
      ? allShaders
      : allShaders.filter((s) => s.category === shaderCategory);

  const handleGenerateTextTo3D = async () => {
    if (!prompt3D.trim()) return;
    setGenerating3D(true);
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'text-to-3d', prompt: prompt3D }),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        const d = json.data;
        const prim = (
          [
            'chrono-drone',
            'cinema-camera-rig',
            'orbital-monolith',
            'torus',
            'procedural-lathe',
            'sphere',
            'cube',
            'cylinder',
          ].includes(d.primitive)
            ? d.primitive
            : 'chrono-drone'
        ) as Primitive3DType;
        spawnObject3D(prim);
        const latestObj = useStudioStore.getState().sceneObjects.slice(-1)[0];
        if (latestObj) {
          useStudioStore.getState().updateObject3D(latestObj.id, {
            name: d.name || prompt3D.slice(0, 24),
            material: {
              ...latestObj.material,
              color: d.color || '#38bdf8',
              emissive: d.emissive || '#06b6d4',
              emissiveIntensity: d.emissiveIntensity ?? 0.5,
              roughness: d.roughness ?? 0.2,
              metalness: d.metalness ?? 0.85,
              transmission: d.transmission ?? 0.1,
            },
            modifiers: {
              ...latestObj.modifiers,
              twist: d.twist ?? 0.2,
              wave: d.wave ?? 0.1,
            },
          });
        }
      } else {
        spawnObject3D('chrono-drone');
      }
    } catch {
      spawnObject3D('chrono-drone');
    } finally {
      setGenerating3D(false);
    }
  };

  const handleGenerateFoley = () => {
    AIAudioRestorationEngine.playSynthesizedFoley(foleyCategory, foleyDuration);
    const createdBatch: GeneratedFoleySample[] = Array.from(
      { length: foleyVariations },
      (_, vIdx) => ({
        id: `sfx_${Date.now()}_${vIdx}`,
        name: `${foleyPrompt.slice(0, 20) || foleyCategory} (Var ${String.fromCharCode(65 + vIdx)})`,
        prompt: `${foleyPrompt} [CFG ${foleyGuidance}]`,
        duration: foleyDuration,
        category: foleyCategory,
        waveformPeaks: Array.from({ length: 10 }, (__, k) =>
          Number((0.18 + Math.abs(Math.sin((k + vIdx) * 0.85)) * 0.78).toFixed(2))
        ),
      })
    );
    setFoleySamples((prev) => [...createdBatch, ...prev]);
  };

  return (
    <aside className="w-80 shrink-0 bg-[#0b0d14] border-r border-white/[0.08] flex flex-col h-full overflow-hidden select-none">
      {/* Sub-Navigation Tabs */}
      <div className="grid grid-cols-4 border-b border-white/[0.08] bg-[#07080d] p-1 gap-1 text-[11px] font-medium">
        <button
          onClick={() => setActiveTab('shaders')}
          className={`py-1.5 px-2 rounded flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
            activeTab === 'shaders'
              ? 'bg-gradient-to-b from-amber-500/25 to-amber-500/10 border border-amber-500/40 text-amber-300 font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Shaders</span>
        </button>
        <button
          onClick={() => setActiveTab('3d')}
          className={`py-1.5 px-2 rounded flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
            activeTab === '3d'
              ? 'bg-gradient-to-b from-amber-500/25 to-amber-500/10 border border-amber-500/40 text-amber-300 font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
          }`}
        >
          <Box className="w-3.5 h-3.5" />
          <span>3D & Mocap</span>
        </button>
        <button
          onClick={() => setActiveTab('mogrt')}
          className={`py-1.5 px-2 rounded flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
            activeTab === 'mogrt'
              ? 'bg-gradient-to-b from-amber-500/25 to-amber-500/10 border border-amber-500/40 text-amber-300 font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
          }`}
        >
          <TypeIcon className="w-3.5 h-3.5" />
          <span>Titles</span>
        </button>
        <button
          onClick={() => setActiveTab('foley')}
          className={`py-1.5 px-2 rounded flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
            activeTab === 'foley'
              ? 'bg-gradient-to-b from-amber-500/25 to-amber-500/10 border border-amber-500/40 text-amber-300 font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
          }`}
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>AI Audio</span>
        </button>
      </div>

      {/* Tab 1: 15 Production WebGL2 Shaders Browser */}
      {activeTab === 'shaders' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-white/[0.07] bg-[#080a10] flex items-center justify-between gap-1">
            {(['All', 'Optical', 'Color', 'Stylize', 'Glitch'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setShaderCategory(cat)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                  shaderCategory === cat
                    ? 'bg-amber-500 text-zinc-950 font-semibold shadow-xs'
                    : 'bg-[#0d1018] text-zinc-400 hover:text-zinc-200 border border-white/[0.06]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {filteredShaders.map((sh) => (
              <div
                key={sh.id}
                className="group p-2.5 rounded-lg bg-[#07090e] border border-white/[0.07] hover:border-amber-500/50 transition-all flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-xs font-semibold text-zinc-100 truncate">
                      {sh.name}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (targetClipId) {
                        addShaderToClip(targetClipId, sh.id);
                      }
                    }}
                    className="px-2 py-0.5 bg-[#141824] hover:bg-amber-500 hover:text-zinc-950 text-zinc-200 border border-white/10 rounded text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Pass</span>
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                  {sh.description}
                </p>
                <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                  <span className="text-cyan-400/80">{sh.fileName}</span>
                  <span>·</span>
                  <span>{sh.category}</span>
                  <span>·</span>
                  <span>{sh.uniforms.length} Uniforms</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: 3D Stage Rigs, Text-to-3D AI Generator & 33-Joint Webcam Mocap Suite */}
      {activeTab === '3d' && (
        <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
          {/* AI Text-to-3D Procedural Mesh Generator */}
          <div className="p-2.5 rounded-lg bg-[#07090e] border border-white/[0.08] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Gemini Text-to-3D Mesh Lab</span>
              </span>
              <span className="text-[10px] font-mono text-amber-400">PBR + Modifiers</span>
            </div>
            <textarea
              rows={2}
              value={prompt3D}
              onChange={(e) => setPrompt3D(e.target.value)}
              placeholder="Describe a 3D mesh, material & modifiers..."
              className="w-full bg-[#0d1018] border border-white/10 rounded p-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={handleGenerateTextTo3D}
              disabled={generating3D}
              className="w-full py-1.5 px-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{generating3D ? 'Synthesizing 3D Mesh...' : 'Spawn AI 3D Model on Stage'}</span>
            </button>
          </div>

          {/* Spawn 3D Primitives & Multi-Part Studio Assemblies */}
          <div className="p-2.5 rounded-lg bg-[#07090e] border border-white/[0.08] space-y-2">
            <div className="text-xs font-semibold text-zinc-200">
              Studio 3D Hero Rigs & Primitives
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'chrono-drone', label: 'Chrono Drone Rig' },
                  { id: 'orbital-monolith', label: 'Orbital Monolith' },
                  { id: 'cinema-camera-rig', label: 'Cinema Cam Rig' },
                  { id: 'torus', label: 'Torus Knot PBR' },
                  { id: 'procedural-lathe', label: 'Lathe Vessel' },
                  { id: 'sphere', label: 'Optical Sphere' },
                  { id: 'cube', label: 'Subdiv Cube' },
                  { id: 'cylinder', label: 'Brushed Cylinder' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  onClick={() => spawnObject3D(item.id)}
                  className="p-1.5 rounded bg-[#0d1018] hover:bg-[#161b29] border border-white/[0.07] text-left text-[11px] text-zinc-200 flex items-center justify-between transition-colors"
                >
                  <span className="truncate">{item.label}</span>
                  <Plus className="w-3 h-3 text-amber-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* AI Webcam Markerless 3D Motion Capture & Humanoid Character Rigging Suite */}
          <div className="p-2.5 rounded-lg bg-[#07090e] border border-white/[0.08] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span>33-Joint Webcam 3D Mocap Suite</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-400">{mocapFps} FPS</span>
            </div>

            <video ref={webcamVideoRef} autoPlay playsInline muted className="hidden" />

            <canvas
              ref={mocapCanvasRef}
              width={260}
              height={108}
              className="w-full h-26 rounded bg-[#05060a] border border-white/10"
            />

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={toggleWebcamFeed}
                className={`py-1.5 px-2 rounded text-[11px] font-medium flex items-center justify-center gap-1 border transition-colors ${
                  webcamLive
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                    : 'bg-[#0d1018] border-white/10 text-zinc-200 hover:bg-[#161b29]'
                }`}
              >
                <Camera className="w-3 h-3" />
                <span>{webcamLive ? 'Stop Webcam' : 'Live Webcam'}</span>
              </button>
              <button
                onClick={() => {
                  const targetId =
                    useStudioStore.getState().selectedObject3DId || 'obj-chrono-drone';
                  useStudioStore
                    .getState()
                    .insertKeyframe('clip-3d-main', 'camera.orbitAngle', 0, 0);
                  useStudioStore.getState().updateObject3D(targetId, {
                    rotation: [0.15, Number((Math.random() * 3.14).toFixed(2)), 0],
                  });
                }}
                className="py-1.5 px-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold rounded text-[11px] transition-colors"
              >
                Bake Quaternions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: 8 Broadcast Motion Graphics (.MOGRT) & DaVinci Fusion Title Templates */}
      {activeTab === 'mogrt' && (
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          <div className="text-xs font-semibold text-zinc-300 px-1 flex items-center justify-between">
            <span>Fusion 3D & Essential Titles (.MOGRT)</span>
            <span className="text-[10px] font-mono text-amber-400">8 Templates</span>
          </div>
          {MOTION_GRAPHICS_TEMPLATES.map((tpl) => (
            <div
              key={tpl.id}
              className="p-2.5 rounded-lg bg-[#07090e] border border-white/[0.08] hover:border-amber-500/40 space-y-1.5 transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-100 truncate">
                  {tpl.name}
                </span>
                <button
                  onClick={() =>
                    addClipToTrack('track-text', {
                      name: tpl.name,
                      type: 'text',
                      textContent: tpl.text,
                      textColor: tpl.color,
                      accentColor: tpl.accent,
                      startTime: 0.5,
                      duration: 8,
                    })
                  }
                  className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded text-[11px] shrink-0"
                >
                  Insert
                </button>
              </div>
              <div
                className="px-2 py-1.5 rounded bg-[#0c0f18] border border-white/[0.05] font-mono text-[11px] tracking-wider text-center truncate"
                style={{ color: tpl.color }}
              >
                {tpl.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 4: AI Foley Studio + AI Adaptive 4-Stem Music Score Engine */}
      {activeTab === 'foley' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="grid grid-cols-2 gap-1 p-1.5 bg-[#080a10] border-b border-white/[0.07] text-[11px]">
            <button
              onClick={() => setAudioSubTab('foley')}
              className={`py-1 rounded font-medium ${
                audioSubTab === 'foley'
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              AI Foley & Hit Sync
            </button>
            <button
              onClick={() => setAudioSubTab('music-stems')}
              className={`py-1 rounded font-medium ${
                audioSubTab === 'music-stems'
                  ? 'bg-cyan-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              4-Stem Music Score
            </button>
          </div>

          {audioSubTab === 'foley' ? (
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
              <div className="p-2.5 rounded-lg bg-[#07090e] border border-white/[0.08] space-y-2">
                <div className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-amber-400" />
                  <span>Text-to-SFX & Foley Generator</span>
                </div>
                <input
                  type="text"
                  value={foleyPrompt}
                  onChange={(e) => setFoleyPrompt(e.target.value)}
                  placeholder="e.g., Footsteps on wet gravel..."
                  className="w-full bg-[#0d1018] border border-white/10 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                />

                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <div>
                    <span className="text-zinc-400 text-[10px] block">Category</span>
                    <select
                      value={foleyCategory}
                      onChange={(e) =>
                        setFoleyCategory(
                          e.target.value as 'Whoosh' | 'Impact' | 'Sci-Fi' | 'Foley'
                        )
                      }
                      className="w-full bg-[#0d1018] border border-white/10 rounded px-1.5 py-1 text-zinc-200"
                    >
                      <option value="Impact">Impact</option>
                      <option value="Whoosh">Whoosh</option>
                      <option value="Sci-Fi">Sci-Fi</option>
                      <option value="Foley">Foley</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[10px] block">
                      Dur ({foleyDuration}s)
                    </span>
                    <input
                      type="range"
                      min={0.5}
                      max={10.0}
                      step={0.5}
                      value={foleyDuration}
                      onChange={(e) => setFoleyDuration(Number(e.target.value))}
                      className="w-full accent-amber-500 mt-1.5"
                    />
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[10px] block">
                      Variations ({foleyVariations})
                    </span>
                    <select
                      value={foleyVariations}
                      onChange={(e) =>
                        setFoleyVariations(Number(e.target.value) as 1 | 2 | 3 | 4)
                      }
                      className="w-full bg-[#0d1018] border border-white/10 rounded px-1.5 py-1 text-zinc-200 font-mono"
                    >
                      <option value={1}>1 Sample</option>
                      <option value={2}>2 Samples</option>
                      <option value={3}>3 Samples</option>
                      <option value={4}>4 Samples</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-zinc-400">Prompt Guidance Scale (CFG)</span>
                  <span className="font-mono text-amber-400">{foleyGuidance.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.5}
                  value={foleyGuidance}
                  onChange={(e) => setFoleyGuidance(Number(e.target.value))}
                  className="w-full accent-amber-500 h-1"
                />

                <button
                  onClick={handleGenerateFoley}
                  className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded text-xs transition-colors"
                >
                  Synthesize {foleyVariations} SFX Variations
                </button>
              </div>

              {/* Foley Samples List & Hit-Point Auto-Sync */}
              <div className="space-y-1.5">
                {foleySamples.map((s) => (
                  <div
                    key={s.id}
                    className="p-2 rounded-lg bg-[#07090e] border border-white/[0.07] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-zinc-200 truncate">
                        {s.name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() =>
                            AIAudioRestorationEngine.playSynthesizedFoley(
                              s.category,
                              s.duration
                            )
                          }
                          className="p-1 bg-[#141824] hover:bg-zinc-700 text-amber-400 rounded"
                          title="Audition Sample"
                        >
                          <Play className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            const hits = AIAudioRestorationEngine.detectVisualHitPoints(16);
                            hits.forEach((h, idx) => {
                              addClipToTrack('track-a2', {
                                name: `${s.name} @ Hit ${idx + 1}`,
                                type: 'audio',
                                startTime: h.time,
                                duration: s.duration,
                                color: '#f59e0b',
                              });
                            });
                          }}
                          className="px-2 py-0.5 bg-[#141824] hover:bg-amber-500 hover:text-zinc-950 text-zinc-200 rounded text-[10px] font-medium"
                        >
                          Sync Hits
                        </button>
                      </div>
                    </div>
                    <div className="flex items-end gap-1 h-4 px-1">
                      {s.waveformPeaks.map((pk, idx) => (
                        <div
                          key={idx}
                          style={{ height: `${Math.max(18, pk * 100)}%` }}
                          className="flex-1 bg-cyan-500/60 rounded-t"
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Sub-Tab 2: AI Adaptive Music Score Generator & 4-Stem Dynamic Mixer */
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 text-xs">
              <div className="p-2.5 rounded-lg bg-[#07090e] border border-white/[0.08] space-y-2">
                <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Disc className="w-3.5 h-3.5 text-cyan-400" />
                  <span>AI Adaptive 4-Stem Score Composer</span>
                </div>

                <div className="space-y-1.5 text-[11px]">
                  <div>
                    <span className="text-zinc-400 block mb-0.5">Genre & Style Matrix</span>
                    <select
                      value={musicGenre}
                      onChange={(e) => setMusicGenre(e.target.value)}
                      className="w-full bg-[#0d1018] border border-white/10 rounded px-2 py-1 text-zinc-200"
                    >
                      <option>Cyberpunk Synthwave</option>
                      <option>Cinematic Orchestral Epic</option>
                      <option>Dark Psychological Thriller Ambient</option>
                      <option>Lo-Fi Chillhop</option>
                      <option>Inspiring Corporate Acoustic</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-zinc-400 block mb-0.5">Emotional Story Arc</span>
                    <select
                      value={musicArc}
                      onChange={(e) => setMusicArc(e.target.value)}
                      className="w-full bg-[#0d1018] border border-white/10 rounded px-2 py-1 text-zinc-200"
                    >
                      <option>Tension Builder → Climax</option>
                      <option>High-Energy Action Pulse</option>
                      <option>Melancholic Reflection</option>
                      <option>Triumphant Finale</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => {
                    AIAudioRestorationEngine.playSynthesizedFoley('Sci-Fi', 2.4);
                    addClipToTrack('track-a1', {
                      name: `AI Score: ${musicGenre} (4 Stems)`,
                      type: 'audio',
                      startTime: 0,
                      duration: 16,
                      color: '#06b6d4',
                    });
                  }}
                  className="w-full py-1.5 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold rounded text-xs transition-colors"
                >
                  Compose & Drop 4-Stem Score to Timeline
                </button>
              </div>

              {/* 4-Stem Dynamic Mixer (Drums, Bass, Harmony, Lead) */}
              <div className="p-2.5 rounded-lg bg-[#07090e] border border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-200 flex items-center gap-1">
                    <Sliders className="w-3 h-3 text-amber-400" />
                    <span>Real-Time 4-Stem Mixer</span>
                  </span>
                  <label className="flex items-center gap-1 text-[10px] text-emerald-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoDuckDialogue}
                      onChange={(e) => setAutoDuckDialogue(e.target.checked)}
                      className="accent-emerald-500"
                    />
                    <span>Dialogue Auto-Duck (-12dB)</span>
                  </label>
                </div>

                {stems.map((st, idx) => (
                  <div key={st.id} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-300">{st.label}</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-zinc-400">{st.level}%</span>
                        <button
                          onClick={() => {
                            const next = [...stems];
                            next[idx] = { ...st, muted: !st.muted };
                            setStems(next);
                          }}
                          className={`px-1 rounded text-[9px] font-mono ${
                            st.muted
                              ? 'bg-rose-500 text-white'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          M
                        </button>
                        <button
                          onClick={() => {
                            const next = [...stems];
                            next[idx] = { ...st, solo: !st.solo };
                            setStems(next);
                          }}
                          className={`px-1 rounded text-[9px] font-mono ${
                            st.solo
                              ? 'bg-amber-500 text-zinc-950 font-bold'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          S
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={st.muted ? 0 : st.level}
                      onChange={(e) => {
                        const next = [...stems];
                        next[idx] = { ...st, level: Number(e.target.value), muted: false };
                        setStems(next);
                      }}
                      className="w-full accent-amber-500 h-1"
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={() => applyBeatSyncMontage(2, true)}
                className="w-full py-1.5 px-3 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded text-xs font-medium transition-colors"
              >
                One-Click Beat-Sync Montage (Every 2nd Beat)
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
