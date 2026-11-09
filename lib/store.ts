import { create } from 'zustand';
import {
  DEFAULT_CUSTOM_SHADER_TEMPLATE,
  PRODUCTION_SHADERS,
  ShaderDefinition,
  ShaderDiagnosticError,
  parseCustomUniforms,
} from './shaders';
import { ActiveShaderPass } from './shaderCompositorEngine';
import { KeyframePoint } from './playbackEngine';
import { BeatMarker } from './BeatDetectionEngine';
import { ChannelStripConfig, MasterBusConfig } from './audioEngine';
import {
  CornerPinQuad,
  MagicMaskStroke,
  SolvedCameraKeyframe,
  TrackPoint2D,
} from './OpticalFlowTracker';

export type WorkspaceMode =
  | 'edit'
  | '3d'
  | 'vfx'
  | 'color'
  | 'shader-ide'
  | 'color-audio'
  | 'ai-director';

export type TimelineTool = 'select' | 'razor' | 'slip' | 'track-point' | 'magic-mask';

export type BlendMode = 'normal' | 'screen' | 'multiply' | 'overlay' | 'add';

export type TransitionType = 'none' | 'cross-dissolve' | 'dip-to-black' | 'glitch-wipe' | 'zoom-blur';

export interface KineticWord {
  word: string;
  start: number;
  end: number;
  isKeyword: boolean;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  type: 'video' | '3d-scene' | 'particle-vfx' | 'adjustment' | 'text' | 'audio';
  startTime: number;
  duration: number;
  trimIn: number;
  color: string;
  blendMode: BlendMode;
  opacity: number;
  transform: {
    positionX: number;
    positionY: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    anchorX: number;
    anchorY: number;
  };
  transitionIn: TransitionType;
  transitionDuration: number;
  // Text / Kinetic Caption properties
  textContent?: string;
  fontSize?: number;
  textColor?: string;
  accentColor?: string;
  kineticWords?: KineticWord[];
  // Particle / Visual Maker properties
  particleConfig?: {
    count: number;
    velocity: number;
    gravity: number;
    turbulence: number;
    colorStart: string;
    colorEnd: string;
    audioReactive: boolean;
    visualizerMode: 'nebula-particles' | 'fft-spectrum-bars' | 'circular-waveform' | 'cyber-grid';
  };
  // Color Grading wheels
  colorGrading: {
    lift: [number, number, number];
    gamma: [number, number, number];
    gain: [number, number, number];
    exposure: number;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
  };
  // Multi-Pass WebGL2 Shader Stack on this clip
  effectStack: ActiveShaderPass[];
  // Keyframe curves (keyed by property path e.g. 'opacity', 'transform.scaleX', 'uniform.u_intensity')
  keyframes: Record<string, KeyframePoint[]>;
  // Local uploaded media URL if user imported a file
  mediaUrl?: string;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | '3d' | 'vfx' | 'text' | 'audio';
  locked: boolean;
  muted: boolean;
  solo: boolean;
  visible: boolean;
  height: number;
}

export type Primitive3DType =
  | 'chrono-drone'
  | 'cinema-camera-rig'
  | 'orbital-monolith'
  | 'cube'
  | 'sphere'
  | 'cylinder'
  | 'torus'
  | 'text3d'
  | 'procedural-lathe';

export interface Scene3DObject {
  id: string;
  name: string;
  primitive: Primitive3DType;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  material: {
    color: string;
    roughness: number;
    metalness: number;
    emissive: string;
    emissiveIntensity: number;
    transmission: number;
    clearcoat: number;
    wireframe: boolean;
  };
  modifiers: {
    subdivision: number;
    twist: number;
    bend: number;
    wave: number;
  };
  pinnedTrackPointId?: string | null;
  keyframes: Record<string, KeyframePoint[]>;
}

export type NodePortColor = 'gold' | 'green' | 'blue' | 'red';

export type CompositorNodeType =
  | 'MediaIn'
  | 'Render3DIn'
  | 'FastNoise'
  | 'PolygonMask'
  | 'DeltaKeyer'
  | 'ShaderFX'
  | 'Transform2D'
  | 'ColorCorrector'
  | 'Merge'
  | 'MediaOut';

export interface CompositorNode {
  id: string;
  type: CompositorNodeType;
  label: string;
  x: number;
  y: number;
  bypassed: boolean;
  shaderId?: string;
  params: Record<string, number | string | boolean | number[]>;
}

export interface CompositorEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  toPort: 'bg' | 'fg' | 'mask'; // gold='bg', green='fg', blue='mask'
}

interface UndoSnapshot {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  sceneObjects: Scene3DObject[];
  nodes: CompositorNode[];
  edges: CompositorEdge[];
}

export interface AetherStudioState {
  // Workspace & UI
  workspace: WorkspaceMode;
  activeTool: TimelineTool;
  resolution: '1080p' | '4K';
  fps: 24 | 30 | 60;
  duration: number;
  inPoint: number;
  outPoint: number;
  loopPlayback: boolean;
  timelineZoom: number;
  showKeyframeDopeSheet: boolean;
  showSafeGuides: boolean;
  viewportZoom: number;
  exportModalOpen: boolean;

  // 3D Stage Settings
  transformGizmoMode: 'translate' | 'rotate' | 'scale';
  shadingMode: 'rendered' | 'solid' | 'wireframe';
  composite3DOver2D: 'over' | 'behind';
  explodedViewFactor: number;
  studioLightPreset: 'cinema-warm-cool' | 'cyberpunk-neon' | 'anodized-studio';
  groundPlaneCalibrated: boolean;
  shadowCatcherOpacity: number;
  cameraRigKeyframes: SolvedCameraKeyframe[];

  // Selection
  selectedClipId: string | null;
  selectedObject3DId: string | null;
  selectedNodeId: string | null;
  viewerLeftNodeId: string | null;
  viewerRightNodeId: string | null;
  abWipePosition: number; // 0..100%
  abWipeEnabled: boolean;

  // Data Entities
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  sceneObjects: Scene3DObject[];
  customShaders: ShaderDefinition[];
  activeIdeShaderId: string;
  ideCode: string;
  ideAutoCompile: boolean;
  ideDiagnostics: ShaderDiagnosticError[];

  // Node Graph
  nodes: CompositorNode[];
  edges: CompositorEdge[];

  // Audio Mastering & Beat Engine
  channelStrips: Record<string, ChannelStripConfig>;
  masterBus: MasterBusConfig;
  beatMarkers: BeatMarker[];
  detectedBpm: number;

  // Motion Tracking, Corner Pin & Magic Mask
  trackPoints: TrackPoint2D[];
  trackerSearchWindow: number;
  cornerPin: CornerPinQuad;
  magicMaskStrokes: MagicMaskStroke[];
  magicMaskEnabled: boolean;
  magicMaskFeather: number;

  // Undo / Redo History
  past: UndoSnapshot[];
  future: UndoSnapshot[];

  // Actions
  setWorkspace: (ws: WorkspaceMode) => void;
  setActiveTool: (tool: TimelineTool) => void;
  setProjectConfig: (cfg: Partial<{ resolution: '1080p' | '4K'; fps: 24 | 30 | 60; duration: number; inPoint: number; outPoint: number; loopPlayback: boolean }>) => void;
  setTimelineZoom: (z: number) => void;
  setShowKeyframeDopeSheet: (show: boolean) => void;
  setShowSafeGuides: (show: boolean) => void;
  setViewportZoom: (z: number) => void;
  setExportModalOpen: (open: boolean) => void;

  // 3D Actions
  setTransformGizmoMode: (m: 'translate' | 'rotate' | 'scale') => void;
  setShadingMode: (m: 'rendered' | 'solid' | 'wireframe') => void;
  setComposite3DOver2D: (mode: 'over' | 'behind') => void;
  setExplodedViewFactor: (v: number) => void;
  setStudioLightPreset: (p: 'cinema-warm-cool' | 'cyberpunk-neon' | 'anodized-studio') => void;
  selectObject3D: (id: string | null) => void;
  spawnObject3D: (primitive: Primitive3DType) => void;
  updateObject3D: (id: string, patch: Partial<Scene3DObject>) => void;
  deleteObject3D: (id: string) => void;
  calibrate3DGroundPlane: () => void;
  setCameraRigKeyframes: (kfs: SolvedCameraKeyframe[]) => void;

  // Timeline & Clip Actions
  selectClip: (id: string | null) => void;
  updateClip: (id: string, patch: Partial<TimelineClip>) => void;
  splitClipAtTime: (clipId: string, splitTime: number) => void;
  deleteClip: (clipId: string) => void;
  addTrack: (type: TimelineTrack['type']) => void;
  toggleTrackFlag: (trackId: string, flag: 'locked' | 'muted' | 'solo' | 'visible') => void;
  addClipToTrack: (trackId: string, clipPartial: Partial<TimelineClip>) => void;
  insertKeyframe: (clipId: string, propPath: string, time: number, value: number) => void;

  // Shader Stack & IDE Actions
  addShaderToClip: (clipId: string, shaderId: string) => void;
  removeShaderFromClip: (clipId: string, instanceId: string) => void;
  toggleShaderOnClip: (clipId: string, instanceId: string) => void;
  reorderShaderOnClip: (clipId: string, fromIdx: number, toIdx: number) => void;
  updateShaderUniform: (clipId: string, instanceId: string, uniformName: string, values: number[]) => void;
  toggleShaderAudioLink: (clipId: string, instanceId: string, uniformName: string) => void;
  setIdeCode: (code: string) => void;
  setIdeAutoCompile: (auto: boolean) => void;
  setIdeDiagnostics: (errors: ShaderDiagnosticError[]) => void;
  saveCustomShader: (shader: ShaderDefinition) => void;

  // Node Graph Actions
  selectNode: (id: string | null) => void;
  setViewerNode: (slot: 1 | 2, nodeId: string | null) => void;
  setAbWipe: (enabled: boolean, pos?: number) => void;
  addCompositorNode: (type: CompositorNodeType, x?: number, y?: number, shaderId?: string) => void;
  updateCompositorNode: (id: string, patch: Partial<CompositorNode>) => void;
  deleteCompositorNode: (id: string) => void;
  connectNodes: (fromNodeId: string, toNodeId: string, toPort: 'bg' | 'fg' | 'mask') => boolean;
  disconnectEdge: (edgeId: string) => void;

  // Audio & Beat Actions
  updateChannelStrip: (trackId: string, patch: Partial<ChannelStripConfig>) => void;
  updateMasterBus: (patch: Partial<MasterBusConfig>) => void;
  setBeatMarkers: (markers: BeatMarker[], bpm: number) => void;
  applyBeatSyncMontage: (everyNBeats: number, addDownbeatTransitions: boolean) => void;

  // Motion Tracking & Magic Mask Actions
  setTrackPoints: (pts: TrackPoint2D[]) => void;
  updateTrackPointPosition: (id: string, x: number, y: number) => void;
  setTrackerSearchWindow: (size: number) => void;
  updateCornerPin: (patch: Partial<CornerPinQuad>) => void;
  addMagicMaskStroke: (stroke: MagicMaskStroke) => void;
  clearMagicMaskStrokes: () => void;
  setMagicMaskEnabled: (enabled: boolean) => void;
  sandwich3DBehindSubject: () => void;

  // History
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
}

let passSeqCounter = 1;
const createDefaultEffectPass = (shaderId: string, deterministicKey?: string): ActiveShaderPass => {
  const def = PRODUCTION_SHADERS.find((s) => s.id === shaderId) || PRODUCTION_SHADERS[0];
  const uniformValues: Record<string, number[]> = {};
  const audioLinkedUniforms: Record<string, boolean> = {};
  for (const u of def.uniforms) {
    uniformValues[u.name] = [...u.defaultValue];
    audioLinkedUniforms[u.name] = false;
  }
  return {
    instanceId: deterministicKey || `fx_${shaderId}_init_${passSeqCounter++}`,
    shaderId: def.id,
    name: def.name,
    enabled: true,
    fragmentSource: def.fragmentSource,
    uniformValues,
    audioLinkedUniforms,
  };
};

const INITIAL_TRACKS: TimelineTrack[] = [
  { id: 'track-text', name: 'V4 · Kinetic Titles & HUD', type: 'text', locked: false, muted: false, solo: false, visible: true, height: 52 },
  { id: 'track-vfx', name: 'V3 · WebGL2 Shader Adjustment', type: 'vfx', locked: false, muted: false, solo: false, visible: true, height: 52 },
  { id: 'track-3d', name: 'V2 · Three.js 3D Stage Pass', type: '3d', locked: false, muted: false, solo: false, visible: true, height: 58 },
  { id: 'track-video', name: 'V1 · Visual Maker & Cinema Plate', type: 'video', locked: false, muted: false, solo: false, visible: true, height: 58 },
  { id: 'track-a1', name: 'A1 · Cyberpunk Synth & Sub-Bass', type: 'audio', locked: false, muted: false, solo: false, visible: true, height: 54 },
  { id: 'track-a2', name: 'A2 · Voiceover & Foley Stem', type: 'audio', locked: false, muted: false, solo: false, visible: true, height: 50 },
];

const INITIAL_CLIPS: TimelineClip[] = [
  {
    id: 'clip-title-1',
    trackId: 'track-text',
    name: 'AETHER // CHRONO DRONE SEQUENCE',
    type: 'text',
    startTime: 0.5,
    duration: 14.5,
    trimIn: 0,
    color: '#d97706',
    blendMode: 'normal',
    opacity: 1,
    transform: { positionX: 0, positionY: -220, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    transitionIn: 'cross-dissolve',
    transitionDuration: 0.6,
    textContent: 'AETHERSTUDIO PRO · 3D & VFX COMPOSITOR',
    fontSize: 34,
    textColor: '#f8fafc',
    accentColor: '#f59e0b',
    kineticWords: [
      { word: 'AETHERSTUDIO', start: 0.5, end: 2.2, isKeyword: true },
      { word: 'REAL-TIME', start: 2.2, end: 4.0, isKeyword: false },
      { word: 'WEBGL2', start: 4.0, end: 6.2, isKeyword: true },
      { word: '3D STAGE', start: 6.2, end: 9.0, isKeyword: true },
      { word: '& VFX COMPOSITOR', start: 9.0, end: 15.0, isKeyword: false },
    ],
    colorGrading: {
      lift: [0, 0, 0],
      gamma: [1, 1, 1],
      gain: [1, 1, 1],
      exposure: 0,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      tint: 0,
    },
    effectStack: [],
    keyframes: {
      opacity: [
        { id: 'kf_1', time: 0.5, value: 0, easing: 'easeOut' },
        { id: 'kf_2', time: 1.4, value: 1, easing: 'bezier' },
        { id: 'kf_3', time: 14.2, value: 1, easing: 'linear' },
        { id: 'kf_4', time: 15.0, value: 0, easing: 'easeIn' },
      ],
    },
  },
  {
    id: 'clip-adj-vfx',
    trackId: 'track-vfx',
    name: 'Master Optical & Color Grade Stack',
    type: 'adjustment',
    startTime: 0,
    duration: 16,
    trimIn: 0,
    color: '#0891b2',
    blendMode: 'normal',
    opacity: 1,
    transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    transitionIn: 'none',
    transitionDuration: 0,
    colorGrading: {
      lift: [0, 0, 0.02],
      gamma: [1, 1, 1],
      gain: [1.04, 1.01, 0.98],
      exposure: 0.1,
      contrast: 1.08,
      saturation: 1.14,
      temperature: -4,
      tint: 2,
    },
    effectStack: [
      (() => {
        const bloom = createDefaultEffectPass('bloom');
        bloom.audioLinkedUniforms['u_intensity'] = true;
        return bloom;
      })(),
      createDefaultEffectPass('chromatic'),
      createDefaultEffectPass('splitTone'),
      createDefaultEffectPass('filmGrain'),
    ],
    keyframes: {
      'uniform.u_intensity': [
        { id: 'kf_b1', time: 0, value: 1.15, easing: 'bezier' },
        { id: 'kf_b2', time: 8, value: 1.75, easing: 'bezier' },
        { id: 'kf_b3', time: 16, value: 1.25, easing: 'easeOut' },
      ],
    },
  },
  {
    id: 'clip-3d-main',
    trackId: 'track-3d',
    name: '3D Stage · Chrono-Mecha Rig & Orbital Camera',
    type: '3d-scene',
    startTime: 0,
    duration: 16,
    trimIn: 0,
    color: '#4f46e5',
    blendMode: 'normal',
    opacity: 1,
    transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    transitionIn: 'none',
    transitionDuration: 0,
    colorGrading: {
      lift: [0, 0, 0],
      gamma: [1, 1, 1],
      gain: [1, 1, 1],
      exposure: 0,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      tint: 0,
    },
    effectStack: [],
    keyframes: {
      'camera.orbitAngle': [
        { id: 'kf_c1', time: 0, value: 0, easing: 'bezier' },
        { id: 'kf_c2', time: 8, value: 3.14, easing: 'bezier' },
        { id: 'kf_c3', time: 16, value: 6.28, easing: 'bezier' },
      ],
    },
  },
  {
    id: 'clip-visual-maker',
    trackId: 'track-video',
    name: 'Procedural Particle Nebula & FFT Horizon Plate',
    type: 'particle-vfx',
    startTime: 0,
    duration: 16,
    trimIn: 0,
    color: '#059669',
    blendMode: 'normal',
    opacity: 1,
    transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    transitionIn: 'dip-to-black',
    transitionDuration: 0.5,
    particleConfig: {
      count: 140,
      velocity: 1.6,
      gravity: -0.15,
      turbulence: 1.4,
      colorStart: '#06b6d4',
      colorEnd: '#f59e0b',
      audioReactive: true,
      visualizerMode: 'nebula-particles',
    },
    colorGrading: {
      lift: [0, 0, 0],
      gamma: [1, 1, 1],
      gain: [1, 1, 1],
      exposure: 0,
      contrast: 1.05,
      saturation: 1.1,
      temperature: 0,
      tint: 0,
    },
    effectStack: [],
    keyframes: {},
  },
  {
    id: 'clip-audio-synth',
    trackId: 'track-a1',
    name: '124 BPM Cyberpunk Sub-Bass & Kick Master Stem',
    type: 'audio',
    startTime: 0,
    duration: 16,
    trimIn: 0,
    color: '#0d9488',
    blendMode: 'normal',
    opacity: 1,
    transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    transitionIn: 'none',
    transitionDuration: 0,
    colorGrading: {
      lift: [0, 0, 0],
      gamma: [1, 1, 1],
      gain: [1, 1, 1],
      exposure: 0,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      tint: 0,
    },
    effectStack: [],
    keyframes: {},
  },
  {
    id: 'clip-audio-vo',
    trackId: 'track-a2',
    name: 'Director Telemetry Voiceover & Atmos',
    type: 'audio',
    startTime: 1.0,
    duration: 13.5,
    trimIn: 0,
    color: '#2563eb',
    blendMode: 'normal',
    opacity: 1,
    transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    transitionIn: 'none',
    transitionDuration: 0,
    colorGrading: {
      lift: [0, 0, 0],
      gamma: [1, 1, 1],
      gain: [1, 1, 1],
      exposure: 0,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      tint: 0,
    },
    effectStack: [],
    keyframes: {},
  },
];

const INITIAL_SCENE_OBJECTS: Scene3DObject[] = [
  {
    id: 'obj-chrono-drone',
    name: 'Chrono-Mecha Turbine Core Rig',
    primitive: 'chrono-drone',
    visible: true,
    position: [0, 0, 0],
    rotation: [0, 0.4, 0],
    scale: [1, 1, 1],
    material: {
      color: '#e2e8f0',
      roughness: 0.18,
      metalness: 0.92,
      emissive: '#06b6d4',
      emissiveIntensity: 0.45,
      transmission: 0.0,
      clearcoat: 0.85,
      wireframe: false,
    },
    modifiers: {
      subdivision: 2,
      twist: 0,
      bend: 0,
      wave: 0,
    },
    pinnedTrackPointId: null,
    keyframes: {},
  },
  {
    id: 'obj-orbital-monolith',
    name: 'Orbital Relay Ring Assembly',
    primitive: 'orbital-monolith',
    visible: true,
    position: [-2.4, 0, -1.2],
    rotation: [0.1, 0.8, 0],
    scale: [0.85, 0.85, 0.85],
    material: {
      color: '#f59e0b',
      roughness: 0.22,
      metalness: 0.88,
      emissive: '#f59e0b',
      emissiveIntensity: 0.25,
      transmission: 0.15,
      clearcoat: 1.0,
      wireframe: false,
    },
    modifiers: {
      subdivision: 1,
      twist: 0.15,
      bend: 0,
      wave: 0,
    },
    pinnedTrackPointId: null,
    keyframes: {},
  },
  {
    id: 'obj-cinema-lens',
    name: 'Anamorphic Optical Sensor Unit',
    primitive: 'cinema-camera-rig',
    visible: true,
    position: [2.3, 0, -0.8],
    rotation: [0, -0.6, 0],
    scale: [0.8, 0.8, 0.8],
    material: {
      color: '#94a3b8',
      roughness: 0.25,
      metalness: 0.85,
      emissive: '#38bdf8',
      emissiveIntensity: 0.35,
      transmission: 0.4,
      clearcoat: 0.9,
      wireframe: false,
    },
    modifiers: {
      subdivision: 1,
      twist: 0,
      bend: 0,
      wave: 0,
    },
    pinnedTrackPointId: null,
    keyframes: {},
  },
];

const INITIAL_NODES: CompositorNode[] = [
  {
    id: 'node-mediain',
    type: 'MediaIn',
    label: 'MediaIn1 (Visual Plate)',
    x: 80,
    y: 110,
    bypassed: false,
    params: { sourceTrack: 'track-video', exposure: 1.0 },
  },
  {
    id: 'node-render3d',
    type: 'Render3DIn',
    label: 'Render3DPass (Three.js Stage)',
    x: 80,
    y: 260,
    bypassed: false,
    params: { includeDepth: true, ambientBoost: 1.1 },
  },
  {
    id: 'node-mask',
    type: 'PolygonMask',
    label: 'BSplineMask1 (Vignette Matte)',
    x: 350,
    y: 350,
    bypassed: false,
    params: { feather: 0.22, invert: false, radius: 0.44 },
  },
  {
    id: 'node-merge',
    type: 'Merge',
    label: 'Merge1 (3D Over 2D Plate)',
    x: 360,
    y: 165,
    bypassed: false,
    params: { blendMode: 'Over', mix: 1.0 },
  },
  {
    id: 'node-shaderfx',
    type: 'ShaderFX',
    label: 'ShaderFX (HDR Dual-Filter Bloom)',
    x: 640,
    y: 165,
    bypassed: false,
    shaderId: 'bloom',
    params: { u_threshold: 0.62, u_intensity: 1.35, u_radius: 3.2 },
  },
  {
    id: 'node-color',
    type: 'ColorCorrector',
    label: 'ColorCorrector1 (ASC-CDL)',
    x: 910,
    y: 165,
    bypassed: false,
    shaderId: 'colorGrade',
    params: { contrast: 1.08, saturation: 1.15 },
  },
  {
    id: 'node-mediaout',
    type: 'MediaOut',
    label: 'MediaOut1 (Master Bus)',
    x: 1170,
    y: 165,
    bypassed: false,
    params: {},
  },
];

const INITIAL_EDGES: CompositorEdge[] = [
  { id: 'edge-1', fromNodeId: 'node-mediain', toNodeId: 'node-merge', toPort: 'bg' },
  { id: 'edge-2', fromNodeId: 'node-render3d', toNodeId: 'node-merge', toPort: 'fg' },
  { id: 'edge-3', fromNodeId: 'node-merge', toNodeId: 'node-shaderfx', toPort: 'bg' },
  { id: 'edge-4', fromNodeId: 'node-mask', toNodeId: 'node-shaderfx', toPort: 'mask' },
  { id: 'edge-5', fromNodeId: 'node-shaderfx', toNodeId: 'node-color', toPort: 'bg' },
  { id: 'edge-6', fromNodeId: 'node-color', toNodeId: 'node-mediaout', toPort: 'bg' },
];

const createDefaultChannelStrip = (trackId: string): ChannelStripConfig => ({
  trackId,
  inputGainDb: 0,
  pan: 0,
  mute: false,
  solo: false,
  polarityInvert: false,
  eqBands: [
    { id: 'low', label: '80Hz Low-Shelf', type: 'lowshelf', frequency: 80, gain: 2.0, Q: 0.8 },
    { id: 'lowMid', label: '400Hz Low-Mid', type: 'peaking', frequency: 400, gain: -1.2, Q: 1.2 },
    { id: 'highMid', label: '2.5kHz Presence', type: 'peaking', frequency: 2500, gain: 1.8, Q: 1.4 },
    { id: 'high', label: '10kHz Air Shelf', type: 'highshelf', frequency: 10000, gain: 2.5, Q: 0.7 },
  ],
  compressor: {
    threshold: -18,
    ratio: 4.0,
    attack: 0.008,
    release: 0.14,
    knee: 6,
  },
});

const INITIAL_TRACK_POINTS: TrackPoint2D[] = [
  {
    id: 'tp-1',
    label: 'Track 01 · Turbine Core Pivot',
    x: 0.5,
    y: 0.48,
    confidence: 0.96,
    trajectory: Array.from({ length: 48 }, (_, i) => ({
      frame: i * 10,
      time: Number((i * 0.333).toFixed(2)),
      x: 0.5 + Math.sin(i * 0.25) * 0.04,
      y: 0.48 + Math.cos(i * 0.25) * 0.025,
      confidence: 0.94,
    })),
  },
  {
    id: 'tp-2',
    label: 'Track 02 · Left Relay Wing',
    x: 0.32,
    y: 0.54,
    confidence: 0.91,
    trajectory: Array.from({ length: 48 }, (_, i) => ({
      frame: i * 10,
      time: Number((i * 0.333).toFixed(2)),
      x: 0.32 + Math.cos(i * 0.22) * 0.035,
      y: 0.54 + Math.sin(i * 0.22) * 0.02,
      confidence: 0.91,
    })),
  },
  {
    id: 'tp-3',
    label: 'Track 03 · Ground Deck Horizon',
    x: 0.68,
    y: 0.64,
    confidence: 0.89,
    trajectory: Array.from({ length: 48 }, (_, i) => ({
      frame: i * 10,
      time: Number((i * 0.333).toFixed(2)),
      x: 0.68 - Math.sin(i * 0.2) * 0.03,
      y: 0.64 + Math.cos(i * 0.2) * 0.015,
      confidence: 0.89,
    })),
  },
];

export const useStudioStore = create<AetherStudioState>((set, get) => ({
  workspace: 'edit',
  activeTool: 'select',
  resolution: '1080p',
  fps: 30,
  duration: 16,
  inPoint: 0,
  outPoint: 16,
  loopPlayback: true,
  timelineZoom: 64, // pixels per second
  showKeyframeDopeSheet: false,
  showSafeGuides: true,
  viewportZoom: 100,
  exportModalOpen: false,

  transformGizmoMode: 'translate',
  shadingMode: 'rendered',
  composite3DOver2D: 'over',
  explodedViewFactor: 0,
  studioLightPreset: 'cinema-warm-cool',
  groundPlaneCalibrated: true,
  shadowCatcherOpacity: 0.45,
  cameraRigKeyframes: [],

  selectedClipId: 'clip-adj-vfx',
  selectedObject3DId: 'obj-chrono-drone',
  selectedNodeId: 'node-shaderfx',
  viewerLeftNodeId: 'node-merge',
  viewerRightNodeId: 'node-mediaout',
  abWipePosition: 50,
  abWipeEnabled: false,

  tracks: INITIAL_TRACKS,
  clips: INITIAL_CLIPS,
  sceneObjects: INITIAL_SCENE_OBJECTS,
  customShaders: [
    {
      id: 'custom_cyber_refraction',
      name: 'Cyber Prism Lens Ripple (Custom)',
      fileName: 'cyberRipple.frag',
      category: 'Procedural',
      description: 'Audio-reactive radial lens ripple and neon prism dispersion.',
      fragmentSource: DEFAULT_CUSTOM_SHADER_TEMPLATE,
      uniforms: parseCustomUniforms(DEFAULT_CUSTOM_SHADER_TEMPLATE),
      isCustom: true,
    },
  ],
  activeIdeShaderId: 'custom_cyber_refraction',
  ideCode: DEFAULT_CUSTOM_SHADER_TEMPLATE,
  ideAutoCompile: true,
  ideDiagnostics: [],

  nodes: INITIAL_NODES,
  edges: INITIAL_EDGES,

  channelStrips: {
    'track-a1': createDefaultChannelStrip('track-a1'),
    'track-a2': createDefaultChannelStrip('track-a2'),
    'track-video': createDefaultChannelStrip('track-video'),
  },
  masterBus: {
    gainDb: 0.0,
    limiterEnabled: true,
    limiterThreshold: -1.0,
    stereoWidth: 1.15,
    reverbSend: 0.18,
    eqBands: [
      { id: 'm-low', label: 'Low Shelf', type: 'lowshelf', frequency: 85, gain: 2.4, Q: 0.75 },
      { id: 'm-lmid', label: 'Low Mid', type: 'peaking', frequency: 380, gain: -1.5, Q: 1.1 },
      { id: 'm-hmid', label: 'High Mid', type: 'peaking', frequency: 2800, gain: 2.1, Q: 1.3 },
      { id: 'm-high', label: 'Air Shelf', type: 'highshelf', frequency: 11000, gain: 3.0, Q: 0.7 },
    ],
  },
  beatMarkers: Array.from({ length: 32 }, (_, idx) => ({
    id: `init_beat_${idx}`,
    time: Number((idx * (60 / 124)).toFixed(3)),
    strength: idx % 4 === 0 ? 0.95 : 0.65,
    isDownbeat: idx % 4 === 0,
  })),
  detectedBpm: 124,

  trackPoints: INITIAL_TRACK_POINTS,
  trackerSearchWindow: 25,
  cornerPin: {
    topLeft: { x: 0.68, y: 0.14 },
    topRight: { x: 0.93, y: 0.17 },
    bottomRight: { x: 0.91, y: 0.42 },
    bottomLeft: { x: 0.66, y: 0.39 },
    enabled: false,
    feather: 0.02,
    overlayTitle: 'TELEMETRY HUD // FEED 04',
  },
  magicMaskStrokes: [],
  magicMaskEnabled: false,
  magicMaskFeather: 8,

  past: [],
  future: [],

  pushHistory: () => {
    const s = get();
    const snapshot: UndoSnapshot = {
      tracks: structuredClone(s.tracks),
      clips: structuredClone(s.clips),
      sceneObjects: structuredClone(s.sceneObjects),
      nodes: structuredClone(s.nodes),
      edges: structuredClone(s.edges),
    };
    set({
      past: [...s.past.slice(-24), snapshot],
      future: [],
    });
  },

  undo: () => {
    const { past, future, tracks, clips, sceneObjects, nodes, edges } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const currentSnapshot: UndoSnapshot = {
      tracks: structuredClone(tracks),
      clips: structuredClone(clips),
      sceneObjects: structuredClone(sceneObjects),
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    };
    set({
      tracks: previous.tracks,
      clips: previous.clips,
      sceneObjects: previous.sceneObjects,
      nodes: previous.nodes,
      edges: previous.edges,
      past: past.slice(0, -1),
      future: [currentSnapshot, ...future.slice(0, 24)],
    });
  },

  redo: () => {
    const { past, future, tracks, clips, sceneObjects, nodes, edges } = get();
    if (future.length === 0) return;
    const next = future[0];
    const currentSnapshot: UndoSnapshot = {
      tracks: structuredClone(tracks),
      clips: structuredClone(clips),
      sceneObjects: structuredClone(sceneObjects),
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    };
    set({
      tracks: next.tracks,
      clips: next.clips,
      sceneObjects: next.sceneObjects,
      nodes: next.nodes,
      edges: next.edges,
      past: [...past, currentSnapshot],
      future: future.slice(1),
    });
  },

  setWorkspace: (workspace) => set({ workspace }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setProjectConfig: (cfg) => set((state) => ({ ...state, ...cfg })),
  setTimelineZoom: (timelineZoom) => set({ timelineZoom: Math.max(20, Math.min(200, timelineZoom)) }),
  setShowKeyframeDopeSheet: (showKeyframeDopeSheet) => set({ showKeyframeDopeSheet }),
  setShowSafeGuides: (showSafeGuides) => set({ showSafeGuides }),
  setViewportZoom: (viewportZoom) => set({ viewportZoom: Math.max(25, Math.min(400, viewportZoom)) }),
  setExportModalOpen: (exportModalOpen) => set({ exportModalOpen }),

  setTransformGizmoMode: (transformGizmoMode) => set({ transformGizmoMode }),
  setShadingMode: (shadingMode) => set({ shadingMode }),
  setComposite3DOver2D: (composite3DOver2D) => set({ composite3DOver2D }),
  setExplodedViewFactor: (explodedViewFactor) => set({ explodedViewFactor }),
  setStudioLightPreset: (studioLightPreset) => set({ studioLightPreset }),
  selectObject3D: (selectedObject3DId) => set({ selectedObject3DId }),

  spawnObject3D: (primitive) => {
    get().pushHistory();
    const id = `obj_${primitive}_${Math.random().toString(36).slice(2, 6)}`;
    const count = get().sceneObjects.length;
    const angle = count * 1.1;
    const newObj: Scene3DObject = {
      id,
      name: `${primitive.toUpperCase()} #${count + 1}`,
      primitive,
      visible: true,
      position: [Number((Math.cos(angle) * 1.8).toFixed(2)), 0, Number((Math.sin(angle) * 1.8).toFixed(2))],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      material: {
        color: '#38bdf8',
        roughness: 0.2,
        metalness: 0.85,
        emissive: '#0284c7',
        emissiveIntensity: 0.25,
        transmission: primitive === 'sphere' ? 0.5 : 0,
        clearcoat: 0.9,
        wireframe: false,
      },
      modifiers: {
        subdivision: 1,
        twist: 0,
        bend: 0,
        wave: 0,
      },
      pinnedTrackPointId: null,
      keyframes: {},
    };
    set((state) => ({
      sceneObjects: [...state.sceneObjects, newObj],
      selectedObject3DId: id,
    }));
  },

  updateObject3D: (id, patch) =>
    set((state) => ({
      sceneObjects: state.sceneObjects.map((obj) =>
        obj.id === id ? { ...obj, ...patch } : obj
      ),
    })),

  deleteObject3D: (id) => {
    get().pushHistory();
    set((state) => ({
      sceneObjects: state.sceneObjects.filter((o) => o.id !== id),
      selectedObject3DId: state.selectedObject3DId === id ? null : state.selectedObject3DId,
    }));
  },

  calibrate3DGroundPlane: () =>
    set({
      groundPlaneCalibrated: true,
      shadowCatcherOpacity: 0.55,
    }),

  setCameraRigKeyframes: (cameraRigKeyframes) => set({ cameraRigKeyframes }),

  selectClip: (selectedClipId) => set({ selectedClipId }),

  updateClip: (id, patch) =>
    set((state) => ({
      clips: state.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  splitClipAtTime: (clipId, splitTime) => {
    const clip = get().clips.find((c) => c.id === clipId);
    if (!clip) return;
    if (splitTime <= clip.startTime + 0.15 || splitTime >= clip.startTime + clip.duration - 0.15) {
      return;
    }
    get().pushHistory();
    const firstDuration = Number((splitTime - clip.startTime).toFixed(3));
    const secondDuration = Number((clip.duration - firstDuration).toFixed(3));

    const secondClip: TimelineClip = {
      ...structuredClone(clip),
      id: `${clip.id}_part_${Math.random().toString(36).slice(2, 5)}`,
      name: `${clip.name} (Split)`,
      startTime: Number(splitTime.toFixed(3)),
      duration: secondDuration,
      trimIn: Number((clip.trimIn + firstDuration).toFixed(3)),
    };

    set((state) => ({
      clips: [
        ...state.clips.map((c) =>
          c.id === clipId ? { ...c, duration: firstDuration } : c
        ),
        secondClip,
      ],
      selectedClipId: secondClip.id,
    }));
  },

  deleteClip: (clipId) => {
    get().pushHistory();
    set((state) => ({
      clips: state.clips.filter((c) => c.id !== clipId),
      selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
    }));
  },

  addTrack: (type) => {
    get().pushHistory();
    const id = `track_${type}_${Math.random().toString(36).slice(2, 6)}`;
    const count = get().tracks.filter((t) => t.type === type).length + 1;
    const prefix = type === 'audio' ? 'A' : 'V';
    const newTrack: TimelineTrack = {
      id,
      name: `${prefix}${get().tracks.length + 1} · ${type.toUpperCase()} Track ${count}`,
      type,
      locked: false,
      muted: false,
      solo: false,
      visible: true,
      height: 52,
    };
    set((state) => ({
      tracks: [newTrack, ...state.tracks],
      channelStrips:
        type === 'audio' || type === 'video'
          ? { ...state.channelStrips, [id]: createDefaultChannelStrip(id) }
          : state.channelStrips,
    }));
  },

  toggleTrackFlag: (trackId, flag) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, [flag]: !t[flag] } : t
      ),
    })),

  addClipToTrack: (trackId, clipPartial) => {
    get().pushHistory();
    const id = `clip_${Math.random().toString(36).slice(2, 7)}`;
    const defaultClip: TimelineClip = {
      id,
      trackId,
      name: clipPartial.name || 'New Timeline Clip',
      type: clipPartial.type || 'video',
      startTime: clipPartial.startTime ?? 0,
      duration: clipPartial.duration ?? 6,
      trimIn: 0,
      color: clipPartial.color || '#0284c7',
      blendMode: 'normal',
      opacity: 1,
      transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
      transitionIn: 'cross-dissolve',
      transitionDuration: 0.4,
      colorGrading: {
        lift: [0, 0, 0],
        gamma: [1, 1, 1],
        gain: [1, 1, 1],
        exposure: 0,
        contrast: 1,
        saturation: 1,
        temperature: 0,
        tint: 0,
      },
      effectStack: [],
      keyframes: {},
      ...clipPartial,
    };
    set((state) => ({
      clips: [...state.clips, defaultClip],
      selectedClipId: id,
    }));
  },

  insertKeyframe: (clipId, propPath, time, value) => {
    set((state) => ({
      clips: state.clips.map((c) => {
        if (c.id !== clipId) return c;
        const existing = c.keyframes[propPath] || [];
        const filtered = existing.filter((k) => Math.abs(k.time - time) > 0.04);
        const updated: KeyframePoint[] = [
          ...filtered,
          {
            id: `kf_${Math.random().toString(36).slice(2, 7)}`,
            time: Number(time.toFixed(2)),
            value: Number(value.toFixed(4)),
            easing: 'bezier' as const,
          },
        ].sort((a, b) => a.time - b.time);
        return {
          ...c,
          keyframes: {
            ...c.keyframes,
            [propPath]: updated,
          },
        };
      }),
    }));
  },

  addShaderToClip: (clipId, shaderId) => {
    const allShaders = [...PRODUCTION_SHADERS, ...get().customShaders];
    const def = allShaders.find((s) => s.id === shaderId);
    if (!def) return;
    get().pushHistory();

    const uniformValues: Record<string, number[]> = {};
    const audioLinkedUniforms: Record<string, boolean> = {};
    for (const u of def.uniforms) {
      uniformValues[u.name] = [...u.defaultValue];
      audioLinkedUniforms[u.name] = false;
    }

    const pass: ActiveShaderPass = {
      instanceId: `fx_${shaderId}_${Math.random().toString(36).slice(2, 7)}`,
      shaderId: def.id,
      name: def.name,
      enabled: true,
      fragmentSource: def.fragmentSource,
      uniformValues,
      audioLinkedUniforms,
    };

    set((state) => ({
      clips: state.clips.map((c) =>
        c.id === clipId ? { ...c, effectStack: [...c.effectStack, pass] } : c
      ),
    }));
  },

  removeShaderFromClip: (clipId, instanceId) => {
    get().pushHistory();
    set((state) => ({
      clips: state.clips.map((c) =>
        c.id === clipId
          ? { ...c, effectStack: c.effectStack.filter((p) => p.instanceId !== instanceId) }
          : c
      ),
    }));
  },

  toggleShaderOnClip: (clipId, instanceId) =>
    set((state) => ({
      clips: state.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              effectStack: c.effectStack.map((p) =>
                p.instanceId === instanceId ? { ...p, enabled: !p.enabled } : p
              ),
            }
          : c
      ),
    })),

  reorderShaderOnClip: (clipId, fromIdx, toIdx) =>
    set((state) => ({
      clips: state.clips.map((c) => {
        if (c.id !== clipId) return c;
        const list = [...c.effectStack];
        if (fromIdx < 0 || fromIdx >= list.length || toIdx < 0 || toIdx >= list.length) {
          return c;
        }
        const [moved] = list.splice(fromIdx, 1);
        list.splice(toIdx, 0, moved);
        return { ...c, effectStack: list };
      }),
    })),

  updateShaderUniform: (clipId, instanceId, uniformName, values) =>
    set((state) => ({
      clips: state.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              effectStack: c.effectStack.map((p) =>
                p.instanceId === instanceId
                  ? {
                      ...p,
                      uniformValues: {
                        ...p.uniformValues,
                        [uniformName]: values,
                      },
                    }
                  : p
              ),
            }
          : c
      ),
    })),

  toggleShaderAudioLink: (clipId, instanceId, uniformName) =>
    set((state) => ({
      clips: state.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              effectStack: c.effectStack.map((p) =>
                p.instanceId === instanceId
                  ? {
                      ...p,
                      audioLinkedUniforms: {
                        ...p.audioLinkedUniforms,
                        [uniformName]: !p.audioLinkedUniforms[uniformName],
                      },
                    }
                  : p
              ),
            }
          : c
      ),
    })),

  setIdeCode: (ideCode) => set({ ideCode }),
  setIdeAutoCompile: (ideAutoCompile) => set({ ideAutoCompile }),
  setIdeDiagnostics: (ideDiagnostics) => set({ ideDiagnostics }),

  saveCustomShader: (shader) =>
    set((state) => {
      const exists = state.customShaders.some((s) => s.id === shader.id);
      const updatedCustom = exists
        ? state.customShaders.map((s) => (s.id === shader.id ? shader : s))
        : [...state.customShaders, shader];

      // Also hot-reload any active clip effect pass using this shaderId
      const updatedClips = state.clips.map((clip) => ({
        ...clip,
        effectStack: clip.effectStack.map((pass) => {
          if (pass.shaderId !== shader.id) return pass;
          const nextUniforms = { ...pass.uniformValues };
          for (const u of shader.uniforms) {
            if (!nextUniforms[u.name]) {
              nextUniforms[u.name] = [...u.defaultValue];
            }
          }
          return {
            ...pass,
            name: shader.name,
            fragmentSource: shader.fragmentSource,
            uniformValues: nextUniforms,
          };
        }),
      }));

      return {
        customShaders: updatedCustom,
        activeIdeShaderId: shader.id,
        ideCode: shader.fragmentSource,
        clips: updatedClips,
      };
    }),

  selectNode: (selectedNodeId) => set({ selectedNodeId }),
  setViewerNode: (slot, nodeId) =>
    set(slot === 1 ? { viewerLeftNodeId: nodeId } : { viewerRightNodeId: nodeId }),
  setAbWipe: (abWipeEnabled, pos) =>
    set((s) => ({
      abWipeEnabled,
      abWipePosition: pos !== undefined ? pos : s.abWipePosition,
    })),

  addCompositorNode: (type, x, y, shaderId) => {
    get().pushHistory();
    const id = `node_${type.toLowerCase()}_${Math.random().toString(36).slice(2, 6)}`;
    const count = get().nodes.length + 1;
    const newNode: CompositorNode = {
      id,
      type,
      label: shaderId ? `ShaderFX (${shaderId})` : `${type}${count}`,
      x: x ?? 280 + (count % 5) * 140,
      y: y ?? 140 + (count % 3) * 90,
      bypassed: false,
      shaderId: shaderId || (type === 'ShaderFX' ? 'bloom' : undefined),
      params:
        type === 'Merge'
          ? { blendMode: 'Over', mix: 1.0 }
          : type === 'PolygonMask'
          ? { feather: 0.18, invert: false, radius: 0.42 }
          : type === 'DeltaKeyer'
          ? { similarity: 0.32, smoothness: 0.1, spillSuppression: 0.65 }
          : type === 'Transform2D'
          ? { translateX: 0, translateY: 0, scale: 1.0, rotate: 0 }
          : {},
    };
    set((state) => ({
      nodes: [...state.nodes, newNode],
      selectedNodeId: id,
    }));
  },

  updateCompositorNode: (id, patch) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    })),

  deleteCompositorNode: (id) => {
    if (id === 'node-mediaout') return; // Prevent deleting master output node
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    }));
  },

  connectNodes: (fromNodeId, toNodeId, toPort) => {
    if (fromNodeId === toNodeId) return false;
    const { edges } = get();

    // Cycle detection via DFS: check if fromNodeId is reachable from toNodeId
    const visited = new Set<string>();
    const stack = [toNodeId];
    while (stack.length > 0) {
      const curr = stack.pop()!;
      if (curr === fromNodeId) {
        return false; // Circular dependency prevented!
      }
      if (visited.has(curr)) continue;
      visited.add(curr);
      for (const edge of edges) {
        if (edge.fromNodeId === curr) {
          stack.push(edge.toNodeId);
        }
      }
    }

    get().pushHistory();
    // Replace any existing wire connected to the same target port
    const filtered = edges.filter(
      (e) => !(e.toNodeId === toNodeId && e.toPort === toPort)
    );
    const newEdge: CompositorEdge = {
      id: `edge_${Math.random().toString(36).slice(2, 7)}`,
      fromNodeId,
      toNodeId,
      toPort,
    };
    set({ edges: [...filtered, newEdge] });
    return true;
  },

  disconnectEdge: (edgeId) => {
    get().pushHistory();
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== edgeId),
    }));
  },

  updateChannelStrip: (trackId, patch) =>
    set((state) => ({
      channelStrips: {
        ...state.channelStrips,
        [trackId]: {
          ...(state.channelStrips[trackId] || createDefaultChannelStrip(trackId)),
          ...patch,
        },
      },
    })),

  updateMasterBus: (patch) =>
    set((state) => ({
      masterBus: { ...state.masterBus, ...patch },
    })),

  setBeatMarkers: (beatMarkers, detectedBpm) => set({ beatMarkers, detectedBpm }),

  applyBeatSyncMontage: (everyNBeats, addDownbeatTransitions) => {
    const { beatMarkers, clips } = get();
    if (beatMarkers.length < 2) return;
    get().pushHistory();

    const step = Math.max(1, everyNBeats);
    const selectedMarkers = beatMarkers.filter((_, idx) => idx % step === 0);
    if (selectedMarkers.length < 2) return;

    const newMontageClips: TimelineClip[] = [];
    const palette = ['#059669', '#0284c7', '#7c3aed', '#d97706', '#e11d48'];
    const modes: Array<'nebula-particles' | 'fft-spectrum-bars' | 'circular-waveform' | 'cyber-grid'> = [
      'nebula-particles',
      'fft-spectrum-bars',
      'circular-waveform',
      'cyber-grid',
    ];

    for (let i = 0; i < Math.min(selectedMarkers.length - 1, 12); i++) {
      const m0 = selectedMarkers[i];
      const m1 = selectedMarkers[i + 1];
      const dur = Number(Math.max(0.25, m1.time - m0.time).toFixed(3));
      const passList: ActiveShaderPass[] = [];
      if (addDownbeatTransitions && m0.isDownbeat) {
        const zoomPass = createDefaultEffectPass('zoomBlur');
        zoomPass.uniformValues['u_blurStrength'] = [0.24];
        passList.push(zoomPass);
      }

      newMontageClips.push({
        id: `clip_montage_${i}_${Math.random().toString(36).slice(2, 5)}`,
        trackId: 'track-video',
        name: `Beat Cut #${i + 1} (${modes[i % modes.length]})`,
        type: 'particle-vfx',
        startTime: m0.time,
        duration: dur,
        trimIn: 0,
        color: palette[i % palette.length],
        blendMode: 'normal',
        opacity: 1,
        transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
        transitionIn: addDownbeatTransitions ? 'zoom-blur' : 'cross-dissolve',
        transitionDuration: 0.14,
        particleConfig: {
          count: 120 + (i % 3) * 40,
          velocity: 1.8,
          gravity: -0.1,
          turbulence: 1.5,
          colorStart: palette[i % palette.length],
          colorEnd: '#f59e0b',
          audioReactive: true,
          visualizerMode: modes[i % modes.length],
        },
        colorGrading: {
          lift: [0, 0, 0],
          gamma: [1, 1, 1],
          gain: [1, 1, 1],
          exposure: 0,
          contrast: 1.08,
          saturation: 1.15,
          temperature: 0,
          tint: 0,
        },
        effectStack: passList,
        keyframes: {},
      });
    }

    set({
      clips: [
        ...clips.filter((c) => c.trackId !== 'track-video'),
        ...newMontageClips,
      ],
      selectedClipId: newMontageClips[0]?.id || null,
    });
  },

  setTrackPoints: (trackPoints) => set({ trackPoints }),

  updateTrackPointPosition: (id, x, y) =>
    set((state) => ({
      trackPoints: state.trackPoints.map((tp) =>
        tp.id === id ? { ...tp, x, y } : tp
      ),
    })),

  setTrackerSearchWindow: (trackerSearchWindow) => set({ trackerSearchWindow }),

  updateCornerPin: (patch) =>
    set((state) => ({
      cornerPin: { ...state.cornerPin, ...patch },
    })),

  addMagicMaskStroke: (stroke) =>
    set((state) => ({
      magicMaskStrokes: [...state.magicMaskStrokes, stroke],
      magicMaskEnabled: true,
    })),

  clearMagicMaskStrokes: () => set({ magicMaskStrokes: [], magicMaskEnabled: false }),

  setMagicMaskEnabled: (magicMaskEnabled) => set({ magicMaskEnabled }),

  sandwich3DBehindSubject: () => {
    get().pushHistory();
    set((state) => ({
      composite3DOver2D: 'behind',
      magicMaskEnabled: true,
      magicMaskStrokes:
        state.magicMaskStrokes.length > 0
          ? state.magicMaskStrokes
          : [
              {
                id: 'auto_fg_stroke',
                mode: 'foreground',
                points: [
                  { x: 0.45, y: 0.35 },
                  { x: 0.5, y: 0.5 },
                  { x: 0.55, y: 0.65 },
                ],
                radius: 18,
              },
            ],
    }));
  },
}));
