'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useStudioStore, TimelineClip } from '@/lib/store';
import { playbackEngine, HighFrequencyPlaybackEngine, EasingMode } from '@/lib/playbackEngine';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Scissors,
  MousePointer,
  Repeat,
  Plus,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Activity,
  Users,
} from 'lucide-react';

export default function TimelinePanel() {
  const {
    tracks,
    clips,
    selectedClipId,
    selectClip,
    updateClip,
    splitClipAtTime,
    deleteClip,
    activeTool,
    setActiveTool,
    duration,
    fps,
    loopPlayback,
    setProjectConfig,
    timelineZoom,
    setTimelineZoom,
    showKeyframeDopeSheet,
    setShowKeyframeDopeSheet,
    toggleTrackFlag,
    addTrack,
    beatMarkers,
    detectedBpm,
  } = useStudioStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [followDirectorMode, setFollowDirectorMode] = useState(false);
  const playheadLineRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const timecodeReadoutRef = useRef<HTMLSpanElement | null>(null);

  // Dragging clip state
  const [draggingClip, setDraggingClip] = useState<{
    id: string;
    mode: 'move' | 'trim-left' | 'trim-right';
    startX: number;
    origStart: number;
    origDuration: number;
  } | null>(null);

  // Subscribe to 60fps playbackEngine directly via ref to move playhead without React re-renders
  useEffect(() => {
    playbackEngine.configure({
      duration,
      fps,
      loopEnabled: loopPlayback,
    });
    const unsub = playbackEngine.subscribe((timeSec, playing) => {
      setIsPlaying(playing);
      if (playheadLineRef.current) {
        playheadLineRef.current.style.transform = `translateX(${timeSec * timelineZoom}px)`;
      }
      if (timecodeReadoutRef.current) {
        timecodeReadoutRef.current.textContent = HighFrequencyPlaybackEngine.formatTimecode(
          timeSec,
          fps
        );
      }
    });
    return unsub;
  }, [duration, fps, loopPlayback, timelineZoom]);

  // Global J / K / L, Space, V, B, I, O, Undo/Redo Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          useStudioStore.getState().redo();
        } else {
          useStudioStore.getState().undo();
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        playbackEngine.togglePlay();
      } else if (e.key.toLowerCase() === 'j') {
        playbackEngine.shuttleJKL('j');
      } else if (e.key.toLowerCase() === 'k') {
        playbackEngine.shuttleJKL('k');
      } else if (e.key.toLowerCase() === 'l') {
        playbackEngine.shuttleJKL('l');
      } else if (e.key.toLowerCase() === 'v') {
        setActiveTool('select');
      } else if (e.key.toLowerCase() === 'b') {
        setActiveTool('razor');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) {
          deleteClip(selectedClipId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, deleteClip, setActiveTool]);

  // Handle clip drag move / trim
  useEffect(() => {
    if (!draggingClip) return;
    const onPointerMove = (e: PointerEvent) => {
      const dxSec = (e.clientX - draggingClip.startX) / timelineZoom;
      if (draggingClip.mode === 'move') {
        let nextStart = Math.max(0, draggingClip.origStart + dxSec);
        // Magnetic snap to closest beat marker within 0.08s
        for (const bm of beatMarkers) {
          if (Math.abs(bm.time - nextStart) < 0.08) {
            nextStart = bm.time;
            break;
          }
        }
        updateClip(draggingClip.id, { startTime: Number(nextStart.toFixed(3)) });
      } else if (draggingClip.mode === 'trim-right') {
        const nextDur = Math.max(0.4, draggingClip.origDuration + dxSec);
        updateClip(draggingClip.id, { duration: Number(nextDur.toFixed(3)) });
      } else if (draggingClip.mode === 'trim-left') {
        const delta = Math.min(draggingClip.origDuration - 0.4, Math.max(-draggingClip.origStart, dxSec));
        updateClip(draggingClip.id, {
          startTime: Number((draggingClip.origStart + delta).toFixed(3)),
          duration: Number((draggingClip.origDuration - delta).toFixed(3)),
        });
      }
    };
    const onPointerUp = () => setDraggingClip(null);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [draggingClip, timelineZoom, beatMarkers, updateClip]);

  const handleRulerScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const updateFromClientX = (clientX: number) => {
      const x = Math.max(0, clientX - rect.left);
      playbackEngine.seek(x / timelineZoom);
    };
    updateFromClientX(e.clientX);

    const onMove = (moveEvt: PointerEvent) => updateFromClientX(moveEvt.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const selectedClip: TimelineClip | undefined = clips.find((c) => c.id === selectedClipId);

  return (
    <section className="h-64 shrink-0 bg-[#06070b] border-t border-white/[0.08] flex flex-col select-none">
      {/* Timeline Transport & Tool Header */}
      <div className="h-8 px-3 bg-[#0c0e16] border-b border-white/[0.08] flex items-center justify-between gap-4 text-xs shrink-0">
        {/* Left: Playback Transport & Timecode */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#06070b] border border-white/10 rounded p-0.5">
            <button
              onClick={() => playbackEngine.seek(0)}
              className="p-1 text-zinc-400 hover:text-zinc-100"
              title="Jump to Start"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => playbackEngine.togglePlay()}
              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold flex items-center gap-1 shadow-xs"
              title="Play / Pause (Space or J/K/L)"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
            <button
              onClick={() => playbackEngine.stepFrames(1)}
              className="p-1 text-zinc-400 hover:text-zinc-100"
              title="Step Forward 1 Frame"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => setProjectConfig({ loopPlayback: !loopPlayback })}
            className={`p-1.5 rounded border transition-colors ${
              loopPlayback
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                : 'bg-[#06070b] border-white/[0.08] text-zinc-500'
            }`}
            title="Loop Playback"
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          <span
            ref={timecodeReadoutRef}
            className="font-mono text-xs tabular-nums text-amber-400 bg-[#05060a] border border-white/10 px-2.5 py-1 rounded shadow-inner"
          >
            00:00:00:00
          </span>

          <span className="text-[11px] font-mono text-cyan-400 hidden sm:inline">
            {detectedBpm} BPM · {beatMarkers.length} Beat Locks
          </span>
        </div>

        {/* Center: DaVinci Resolve Editing Tools (Select [V], Blade Razor [B], Dynamic Trim/Slip [T], Curve Dope Sheet) */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-[#06070b] border border-white/10 rounded p-0.5">
            <button
              onClick={() => setActiveTool('select')}
              className={`px-2 py-1 rounded flex items-center gap-1 transition-colors whitespace-nowrap ${
                activeTool === 'select'
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Select (V)</span>
            </button>
            <button
              onClick={() => setActiveTool('slip')}
              className={`px-2 py-1 rounded flex items-center gap-1 transition-colors whitespace-nowrap ${
                activeTool === 'slip'
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <span>Trim / Slip (T)</span>
            </button>
            <button
              onClick={() => setActiveTool('razor')}
              className={`px-2 py-1 rounded flex items-center gap-1 transition-colors whitespace-nowrap ${
                activeTool === 'razor'
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Blade (B)</span>
            </button>
          </div>

          <button
            onClick={() => setShowKeyframeDopeSheet(!showKeyframeDopeSheet)}
            className={`px-2.5 py-1 rounded border flex items-center gap-1 transition-colors whitespace-nowrap ${
              showKeyframeDopeSheet
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-medium'
                : 'bg-[#06070b] border-white/[0.08] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Spline Curves</span>
          </button>

          <button
            onClick={() => addTrack('video')}
            className="px-2 py-1 rounded bg-[#06070b] hover:bg-[#141824] border border-white/[0.08] text-zinc-300 flex items-center gap-1 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Add Track</span>
          </button>
        </div>

        {/* Right: Multiplayer Presence & Timeline Zoom */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setFollowDirectorMode(!followDirectorMode)}
            className={`hidden lg:flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors whitespace-nowrap ${
              followDirectorMode
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-[#06070b] border-white/[0.08] text-zinc-400'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span>{followDirectorMode ? 'Following Sarah (Director)' : '2 Peers Online (CRDT)'}</span>
          </button>

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 text-[11px]">Zoom</span>
            <input
              type="range"
              min={32}
              max={140}
              value={timelineZoom}
              onChange={(e) => setTimelineZoom(Number(e.target.value))}
              className="w-20 accent-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Main Timeline Tracks or Keyframe Curve Editor */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Track Headers Column */}
        <div className="w-56 shrink-0 bg-[#0b0d14] border-r border-white/[0.08] flex flex-col min-h-0">
          <div className="h-5 px-3 border-b border-white/[0.08] bg-[#07080d] flex items-center justify-between text-[10px] font-mono text-zinc-400 shrink-0">
            <span>TRACK PATCH BAY</span>
            <span className="text-sky-400">SMART CACHE: ON</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.06]">
            {tracks.map((tr) => (
              <div
                key={tr.id}
                style={{ height: `${tr.height}px` }}
                className="px-2.5 flex items-center justify-between gap-1 bg-[#0b0d14] hover:bg-[#111520] transition-colors"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`w-1.5 h-3.5 rounded-xs shrink-0 ${
                      tr.type === 'audio'
                        ? 'bg-emerald-500'
                        : tr.type === '3d'
                        ? 'bg-indigo-500'
                        : tr.type === 'vfx'
                        ? 'bg-cyan-400'
                        : 'bg-amber-500'
                    }`}
                  />
                  <span className="text-[11px] font-medium text-zinc-200 truncate">
                    {tr.name}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => toggleTrackFlag(tr.id, 'locked')}
                    className={`p-1 rounded ${
                      tr.locked ? 'text-amber-400 bg-amber-500/15' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    title="Lock Track"
                  >
                    {tr.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => toggleTrackFlag(tr.id, 'muted')}
                    className={`p-1 rounded ${
                      tr.muted ? 'text-rose-400 bg-rose-500/15' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    title="Mute Track"
                  >
                    {tr.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => toggleTrackFlag(tr.id, 'visible')}
                    className={`p-1 rounded ${
                      !tr.visible ? 'text-zinc-600' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Toggle Track Visibility"
                  >
                    {tr.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Scrollable Timeline Ruler & Track Lanes */}
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto relative bg-[#05060a]">
          <div
            style={{ width: `${Math.max(1100, duration * timelineZoom + 120)}px` }}
            className="relative min-h-full"
          >
            {/* DaVinci-Style Smart Render Cache Bar + Timecode Ruler + Cyan Beat Markers */}
            <div
              ref={rulerRef}
              onPointerDown={handleRulerScrub}
              className="h-5 bg-[#090b12] border-b border-white/[0.08] relative cursor-ew-resize sticky top-0 z-20"
            >
              {/* Blue Smart Frame Cache Bar */}
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-sky-500 via-cyan-400 to-sky-500 opacity-85" />

              {/* Second Ticks */}
              {Array.from({ length: duration + 1 }, (_, sec) => (
                <div
                  key={sec}
                  style={{ left: `${sec * timelineZoom}px` }}
                  className="absolute top-0.5 bottom-0 border-l border-white/15 pl-1 text-[9px] font-mono text-zinc-400 tabular-nums"
                >
                  00:{String(sec).padStart(2, '0')}:00
                </div>
              ))}

              {/* Cyan Beat Markers (◆) */}
              {beatMarkers.map((bm) => (
                <div
                  key={bm.id}
                  style={{ left: `${bm.time * timelineZoom}px` }}
                  title={`Beat @ ${bm.time}s`}
                  className={`absolute bottom-0 -translate-x-1/2 text-[8px] pointer-events-none ${
                    bm.isDownbeat ? 'text-cyan-400 font-bold' : 'text-cyan-500/50'
                  }`}
                >
                  ◆
                </div>
              ))}
            </div>

            {/* Track Lanes */}
            <div className="divide-y divide-white/[0.05] relative">
              {tracks.map((tr) => {
                const trackClips = clips.filter((c) => c.trackId === tr.id);
                return (
                  <div
                    key={tr.id}
                    style={{ height: `${tr.height}px` }}
                    className="relative bg-[#070910]/90"
                  >
                    {trackClips.map((clip) => {
                      const isSelected = clip.id === selectedClipId;
                      const leftPx = clip.startTime * timelineZoom;
                      const widthPx = Math.max(24, clip.duration * timelineZoom);

                      return (
                        <div
                          key={clip.id}
                          style={{
                            left: `${leftPx}px`,
                            width: `${widthPx}px`,
                            backgroundColor: `${clip.color}22`,
                            borderColor: isSelected ? '#f59e0b' : `${clip.color}aa`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeTool === 'razor') {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const clickOffsetSec = (e.clientX - rect.left) / timelineZoom;
                              splitClipAtTime(clip.id, clip.startTime + clickOffsetSec);
                            } else {
                              selectClip(clip.id);
                            }
                          }}
                          onPointerDown={(e) => {
                            if (tr.locked || activeTool === 'razor') return;
                            selectClip(clip.id);
                            setDraggingClip({
                              id: clip.id,
                              mode: 'move',
                              startX: e.clientX,
                              origStart: clip.startTime,
                              origDuration: clip.duration,
                            });
                          }}
                          className={`absolute top-[2px] bottom-[2px] rounded border flex flex-col justify-between overflow-hidden cursor-grab active:cursor-grabbing transition-shadow ${
                            isSelected ? 'ring-1 ring-amber-400 shadow-lg z-10' : ''
                          }`}
                        >
                          {/* Subtle Filmstrip / Frame Grid Background Pattern for Video & 3D Clips */}
                          {clip.type !== 'audio' && (
                            <div
                              className="absolute inset-0 opacity-15 pointer-events-none"
                              style={{
                                backgroundImage:
                                  'repeating-linear-gradient(90deg, transparent, transparent 28px, rgba(255,255,255,0.18) 28px, rgba(255,255,255,0.18) 29px)',
                              }}
                            />
                          )}

                          {/* Left Trim Handle */}
                          <div
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              if (tr.locked) return;
                              setDraggingClip({
                                id: clip.id,
                                mode: 'trim-left',
                                startX: e.clientX,
                                origStart: clip.startTime,
                                origDuration: clip.duration,
                              });
                            }}
                            className="absolute left-0 top-0 bottom-0 w-1.5 bg-white/10 hover:bg-amber-400/70 cursor-ew-resize z-10"
                          />

                          {/* Right Trim Handle */}
                          <div
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              if (tr.locked) return;
                              setDraggingClip({
                                id: clip.id,
                                mode: 'trim-right',
                                startX: e.clientX,
                                origStart: clip.startTime,
                                origDuration: clip.duration,
                              });
                            }}
                            className="absolute right-0 top-0 bottom-0 w-1.5 bg-white/10 hover:bg-amber-400/70 cursor-ew-resize z-10"
                          />

                          {/* Top DaVinci Clip Header Ribbon */}
                          <div
                            style={{ backgroundColor: `${clip.color}42` }}
                            className="px-2 py-0.5 border-b border-white/10 flex items-center justify-between gap-1.5 pointer-events-none relative z-1"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                style={{ backgroundColor: clip.color }}
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                              />
                              <span className="text-[10px] font-semibold text-zinc-100 truncate">
                                {clip.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 font-mono text-[9px]">
                              {clip.effectStack.length > 0 && (
                                <span className="px-1 rounded bg-amber-500/30 border border-amber-400/40 text-amber-200 font-bold">
                                  FX:{clip.effectStack.length}
                                </span>
                              )}
                              <span className="text-zinc-300/90">{clip.duration.toFixed(1)}s</span>
                            </div>
                          </div>

                          {/* Audio Waveform or Keyframe Automation Line */}
                          {clip.type === 'audio' ? (
                            <div className="flex items-end gap-[2px] h-3.5 px-2 pb-0.5 opacity-80 pointer-events-none relative z-1">
                              {Array.from({ length: 44 }, (_, i) => (
                                <div
                                  key={i}
                                  style={{
                                    height: `${22 + Math.abs(Math.sin(i * 0.75 + clip.startTime)) * 78}%`,
                                    backgroundColor: clip.color,
                                  }}
                                  className="flex-1 rounded-t-xs"
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="relative h-3 px-2 flex items-center pointer-events-none z-1">
                              {/* Automation Spline Guide Line */}
                              <div className="w-full h-px bg-white/15" />
                              {Object.values(clip.keyframes)
                                .flat()
                                .map((kf) => (
                                  <span
                                    key={kf.id}
                                    style={{
                                      left: `${((kf.time - clip.startTime) / clip.duration) * 100}%`,
                                    }}
                                    className="absolute text-[9px] text-amber-400 -translate-x-1/2"
                                  >
                                    ◆
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Keyframe Dope Sheet / Easing Drawer Overlay */}
            {showKeyframeDopeSheet && selectedClip && (
              <div className="sticky left-0 right-0 bottom-0 bg-zinc-900/95 border-t border-zinc-700 p-2.5 z-30 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-amber-400">
                    Keyframe Curve Editor: {selectedClip.name}
                  </span>
                  <span className="text-zinc-400">
                    ({Object.keys(selectedClip.keyframes).length} Animated Channels)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-400">Curve Easing Preset:</span>
                  {(['linear', 'easeIn', 'easeOut', 'bezier'] as EasingMode[]).map((ease) => (
                    <button
                      key={ease}
                      onClick={() => {
                        const nextKf = { ...selectedClip.keyframes };
                        for (const key of Object.keys(nextKf)) {
                          nextKf[key] = nextKf[key].map((pt) => ({ ...pt, easing: ease }));
                        }
                        updateClip(selectedClip.id, { keyframes: nextKf });
                      }}
                      className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 text-zinc-200 capitalize text-[11px]"
                    >
                      {ease}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* High-Frequency 60fps Playhead Needle */}
            <div
              ref={playheadLineRef}
              className="absolute top-0 bottom-0 left-0 w-0.5 bg-amber-500 pointer-events-none z-30"
            >
              <div className="w-3 h-3 -ml-[5px] bg-amber-500 rotate-45 rounded-xs" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
