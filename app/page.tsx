'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStudioStore, WorkspaceMode } from '@/lib/store';
import ViewportStage from '@/components/ViewportStage';
import LeftAssetBrowser from '@/components/LeftAssetBrowser';
import RightInspector from '@/components/RightInspector';
import TimelinePanel from '@/components/TimelinePanel';
import DaVinciColorDeck from '@/components/DaVinciColorDeck';
import {
  NodeGraphCompositor,
  ShaderCodeEditor,
  AudioMasteringConsole,
  AIDirectorSuite,
  RenderExportModal,
} from '@/components/WorkspacePanels';
import { ProjectPersistenceManager } from '@/lib/ProjectPersistenceManager';
import {
  Undo2,
  Redo2,
  Save,
  Film,
  GitBranch,
  Palette,
  Code2,
  Sliders,
  Sparkles,
  Rocket,
} from 'lucide-react';

const emptySubscribe = () => () => {};

export default function AetherStudioProPage() {
  const {
    workspace,
    setWorkspace,
    resolution,
    fps,
    duration,
    setProjectConfig,
    setExportModalOpen,
    undo,
    redo,
    past,
    future,
    tracks,
    clips,
    sceneObjects,
    nodes,
    edges,
    customShaders,
  } = useStudioStore();

  const masterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [vaultSavedLabel, setVaultSavedLabel] = useState('Vault Synced');
  const isHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // Auto-save to IndexedDB Vault every 15 seconds
  useEffect(() => {
    const timer = window.setInterval(() => {
      ProjectPersistenceManager.saveSnapshot({
        id: 'latest_autosave',
        timestamp: Date.now(),
        label: 'Auto-Save Vault Snapshot',
        payload: {
          resolution,
          fps,
          duration,
          tracks,
          clips,
          sceneObjects,
          nodes,
          edges,
          customShaders,
        },
      });
      setVaultSavedLabel('Vault Auto-Saved');
    }, 15000);
    return () => clearInterval(timer);
  }, [resolution, fps, duration, tracks, clips, sceneObjects, nodes, edges, customShaders]);

  // Top Bar 5-Link Navigation Contract
  const workspaceTabs: Array<{ id: WorkspaceMode; label: string }> = [
    { id: 'edit', label: 'Edit & Timeline' },
    { id: 'vfx', label: 'Fusion Node VFX' },
    { id: 'color', label: 'DaVinci Color' },
    { id: 'color-audio', label: 'Fairlight Audio' },
    { id: 'ai-director', label: 'AI Director Suite' },
  ];

  // DaVinci Resolve Signature Bottom Studio Page Ribbon
  const davinciBottomPages: Array<{
    id: WorkspaceMode | 'deliver';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'edit', label: 'Cut & Edit', icon: Film },
    { id: 'vfx', label: 'Fusion VFX', icon: GitBranch },
    { id: 'color', label: 'Color Wheels & Scopes', icon: Palette },
    { id: 'shader-ide', label: 'GLSL Shader IDE', icon: Code2 },
    { id: 'color-audio', label: 'Fairlight DAW', icon: Sliders },
    { id: 'ai-director', label: 'AI Director', icon: Sparkles },
    { id: 'deliver', label: 'Deliver Render', icon: Rocket },
  ];

  return (
    <main className="w-screen h-screen bg-[#06070b] text-zinc-100 flex flex-col overflow-hidden select-none">
      {/* Top Bar Contract: Zone 1 (Brand Wordmark) — Zone 2 (5 Workspace Nav Links) — Zone 3 (1 Primary Action) */}
      <header className="h-11 px-5 bg-[#090b11] border-b border-white/[0.08] flex items-center justify-between gap-8 shrink-0">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#studio"
          className="text-base font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0"
        >
          AetherStudio Pro
        </a>

        {/* Zone 2: 5 Single-Line Workspace Navigation Links */}
        <nav className="flex items-center gap-6 text-xs font-medium text-zinc-400">
          {workspaceTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setWorkspace(tab.id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                workspace === tab.id
                  ? 'text-amber-400 border-amber-400 font-semibold'
                  : 'border-transparent hover:text-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => setExportModalOpen(true)}
            className="px-4 py-1.5 text-xs font-semibold text-zinc-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 rounded-md shadow-sm transition-all whitespace-nowrap shrink-0"
          >
            Export Master Render
          </button>
        </div>
      </header>

      {/* Secondary Studio Project Utility Sub-Toolbar (Undo/Redo, Resolution/FPS, Shader IDE Quick Switch, .aether Project Save) */}
      <div className="h-8 px-4 bg-[#0c0e16] border-b border-white/[0.07] flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={past.length === 0}
            className="px-2 py-0.5 rounded bg-[#06070b] hover:bg-zinc-800 disabled:opacity-35 border border-white/10 text-zinc-300 flex items-center gap-1 whitespace-nowrap"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3 h-3" />
            <span>Undo</span>
          </button>
          <button
            onClick={redo}
            disabled={future.length === 0}
            className="px-2 py-0.5 rounded bg-[#06070b] hover:bg-zinc-800 disabled:opacity-35 border border-white/10 text-zinc-300 flex items-center gap-1 whitespace-nowrap"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-3 h-3" />
            <span>Redo</span>
          </button>

          <span className="text-zinc-700">|</span>

          <select
            value={resolution}
            onChange={(e) => setProjectConfig({ resolution: e.target.value as '1080p' | '4K' })}
            className="bg-[#06070b] border border-white/10 rounded px-2 py-0.5 text-zinc-300 font-mono text-[11px]"
          >
            <option value="1080p">1920×1080 (1080p HD)</option>
            <option value="4K">3840×2160 (4K DCI Master)</option>
          </select>

          <select
            value={fps}
            onChange={(e) => setProjectConfig({ fps: Number(e.target.value) as 24 | 30 | 60 })}
            className="bg-[#06070b] border border-white/10 rounded px-2 py-0.5 text-zinc-300 font-mono text-[11px]"
          >
            <option value={24}>24 fps Cinema</option>
            <option value={30}>30 fps Broadcast</option>
            <option value={60}>60 fps High-Frame</option>
          </select>

          <button
            onClick={() => setWorkspace('shader-ide')}
            className={`px-2.5 py-0.5 rounded border text-[11px] font-mono flex items-center gap-1 transition-colors ${
              workspace === 'shader-ide'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-semibold'
                : 'bg-[#06070b] border-white/10 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-3 h-3 text-cyan-400" />
            <span>Live GLSL Shader IDE</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-emerald-400/90">{vaultSavedLabel}</span>
          <button
            onClick={() =>
              ProjectPersistenceManager.exportAetherFile({
                id: `export_${Date.now()}`,
                timestamp: Date.now(),
                label: 'Manual Project Export',
                payload: {
                  resolution,
                  fps,
                  duration,
                  tracks,
                  clips,
                  sceneObjects,
                  nodes,
                  edges,
                  customShaders,
                },
              })
            }
            className="px-2.5 py-0.5 rounded bg-[#06070b] hover:bg-zinc-800 border border-white/10 text-zinc-200 flex items-center gap-1 whitespace-nowrap"
          >
            <Save className="w-3 h-3 text-amber-400" />
            <span>Save .aether Project</span>
          </button>
        </div>
      </div>

      {/* Center 3-Column Dockable Studio Area: Left Asset Browser | Center Dual Viewport | Right Inspector */}
      {isHydrated ? (
        <>
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <LeftAssetBrowser />
            <ViewportStage masterCanvasRef={masterCanvasRef} />
            <RightInspector />
          </div>

          {/* Lower Studio Deck: Switches Dynamically Across All DaVinci Resolve + AetherStudio Pages */}
          {workspace === 'vfx' && <NodeGraphCompositor />}
          {workspace === 'color' && <DaVinciColorDeck masterCanvasRef={masterCanvasRef} />}
          {workspace === 'shader-ide' && <ShaderCodeEditor />}
          {workspace === 'color-audio' && <AudioMasteringConsole />}
          {workspace === 'ai-director' && <AIDirectorSuite />}
          {workspace === 'edit' || workspace === '3d' ? <TimelinePanel /> : null}

          {/* Signature DaVinci Resolve Studio 7-Page Bottom Switcher Dock */}
          <footer className="h-8 px-4 bg-[#07080d] border-t border-white/[0.08] flex items-center justify-between text-[11px] shrink-0">
            <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
              <span className="text-emerald-400">● GPU WEBGL2 FBO ACTIVE</span>
              <span>·</span>
              <span>THREE.JS R170</span>
              <span>·</span>
              <span>DA VINCI YRGB 32-BIT FLOAT</span>
            </div>

            <div className="flex items-center gap-1">
              {davinciBottomPages.map((pg) => {
                const Icon = pg.icon;
                const isActive = workspace === pg.id;
                return (
                  <button
                    key={pg.id}
                    onClick={() => {
                      if (pg.id === 'deliver') {
                        setExportModalOpen(true);
                      } else {
                        setWorkspace(pg.id);
                      }
                    }}
                    className={`px-3 py-1 rounded flex items-center gap-1.5 transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-gradient-to-t from-amber-500/25 to-amber-500/10 border border-amber-500/50 text-amber-300 font-semibold shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{pg.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="font-mono text-[10px] text-zinc-500 hidden xl:block">
              J/K/L SHUTTLE · [1/2] VIEWERS · [G/R/S] GIZMO
            </div>
          </footer>

          {/* Frame-Accurate WebCodecs & OfflineAudioContext Render Export Modal */}
          <RenderExportModal masterCanvasRef={masterCanvasRef} />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-[#06070b] text-xs font-mono text-zinc-400">
          Initializing WebGL2 Multi-Pass FBO & Three.js 3D Stage...
        </div>
      )}
    </main>
  );
}
