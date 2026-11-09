'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { useStudioStore, Scene3DObject } from '@/lib/store';
import { playbackEngine, HighFrequencyPlaybackEngine } from '@/lib/playbackEngine';
import { ShaderCompositorEngine } from '@/lib/shaderCompositorEngine';
import { audioEngine } from '@/lib/audioEngine';
import {
  CameraIcon,
  Move,
  RotateCw,
  Maximize2,
  Eye,
  Grid,
  Sparkles,
  SplitSquareVertical,
  Crosshair,
  Tv,
  Layers,
  Wand2,
} from 'lucide-react';

export interface ParticlePresetConfig {
  id: string;
  name: string;
  mode: 'fire-embers' | 'hologram-matrix' | 'blizzard-storm' | 'golden-stardust' | 'bass-shockwave' | 'portal-disintegrate';
  colorStart: string;
  colorEnd: string;
  speed: number;
  turbulence: number;
}

export const PARTICLE_PRESETS: ParticlePresetConfig[] = [
  { id: 'p-fire', name: 'Cinematic Fire & Embers', mode: 'fire-embers', colorStart: '#ffedd5', colorEnd: '#ea580c', speed: 1.8, turbulence: 1.6 },
  { id: 'p-holo', name: 'Sci-Fi Hologram Matrix', mode: 'hologram-matrix', colorStart: '#22d3ee', colorEnd: '#a855f7', speed: 1.2, turbulence: 0.4 },
  { id: 'p-snow', name: 'Atmospheric Blizzard Storm', mode: 'blizzard-storm', colorStart: '#f8fafc', colorEnd: '#38bdf8', speed: 2.2, turbulence: 1.1 },
  { id: 'p-gold', name: 'Golden Award Stardust', mode: 'golden-stardust', colorStart: '#fef08a', colorEnd: '#ca8a04', speed: 1.0, turbulence: 1.3 },
  { id: 'p-bass', name: 'Audio Bass Shockwave Ring', mode: 'bass-shockwave', colorStart: '#f43f5e', colorEnd: '#f59e0b', speed: 2.6, turbulence: 2.0 },
  { id: 'p-portal', name: 'Portal Mesh Disintegration', mode: 'portal-disintegrate', colorStart: '#34d399', colorEnd: '#0284c7', speed: 1.5, turbulence: 2.4 },
];

/**
 * Builds composite 5-10 part procedural Three.js hero models following the Three.js skill guidelines:
 * Primary silhouette + Secondary read + Accent detail, varied roughness/metalness, bottom-center grounded pivot.
 */
function buildProcedural3DGroup(obj: Scene3DObject): THREE.Group {
  const group = new THREE.Group();
  group.name = obj.id;

  const primaryMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(obj.material.color),
    roughness: obj.material.roughness,
    metalness: obj.material.metalness,
    clearcoat: obj.material.clearcoat,
    transmission: obj.material.transmission,
    transparent: obj.material.transmission > 0.05,
    opacity: obj.material.transmission > 0.05 ? 0.85 : 1.0,
    wireframe: obj.material.wireframe,
  });

  const secondaryMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1e293b'),
    roughness: Math.min(1, obj.material.roughness + 0.3),
    metalness: Math.max(0.1, obj.material.metalness - 0.25),
    wireframe: obj.material.wireframe,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(obj.material.emissive),
    emissive: new THREE.Color(obj.material.emissive),
    emissiveIntensity: obj.material.emissiveIntensity * 2.2,
    roughness: 0.15,
    metalness: 0.5,
    wireframe: obj.material.wireframe,
  });

  if (obj.primitive === 'chrono-drone') {
    // 1. Primary Chassis Hull (Octagonal turbine core)
    const coreGeo = new THREE.CylinderGeometry(0.75, 0.85, 0.65, 8);
    const coreMesh = new THREE.Mesh(coreGeo, primaryMat);
    coreMesh.position.y = 1.1;
    coreMesh.castShadow = true;
    coreMesh.receiveShadow = true;
    group.add(coreMesh);

    // 2. Outer Gimbal Gyro Ring
    const ringGeo = new THREE.TorusGeometry(1.15, 0.08, 16, 48);
    const ringMesh = new THREE.Mesh(ringGeo, secondaryMat);
    ringMesh.position.y = 1.1;
    ringMesh.rotation.x = Math.PI * 0.35;
    ringMesh.castShadow = true;
    group.add(ringMesh);

    // 3. Secondary Inner Stabilizer Ring
    const innerRingGeo = new THREE.TorusGeometry(0.95, 0.045, 12, 36);
    const innerRing = new THREE.Mesh(innerRingGeo, accentMat);
    innerRing.position.y = 1.1;
    innerRing.rotation.y = Math.PI * 0.25;
    group.add(innerRing);

    // 4. Optical Sapphire Sensor Eye
    const lensGeo = new THREE.SphereGeometry(0.38, 24, 24);
    const lensMesh = new THREE.Mesh(lensGeo, accentMat);
    lensMesh.position.set(0, 1.1, 0.62);
    group.add(lensMesh);

    // 5. 4 Articulated Thruster Pods
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const podGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.55, 12);
      const pod = new THREE.Mesh(podGeo, secondaryMat);
      pod.position.set(Math.cos(angle) * 1.1, 0.85, Math.sin(angle) * 1.1);
      pod.castShadow = true;
      group.add(pod);
    }

    // 6. Grounded Pedestal Base
    const baseGeo = new THREE.CylinderGeometry(0.5, 0.7, 0.16, 16);
    const baseMesh = new THREE.Mesh(baseGeo, secondaryMat);
    baseMesh.position.y = 0.08;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);
  } else if (obj.primitive === 'orbital-monolith') {
    const pillarGeo = new THREE.BoxGeometry(0.75, 2.1, 0.45);
    const pillar = new THREE.Mesh(pillarGeo, primaryMat);
    pillar.position.y = 1.05;
    pillar.castShadow = true;
    group.add(pillar);

    const haloGeo = new THREE.TorusGeometry(0.72, 0.05, 16, 40);
    const halo = new THREE.Mesh(haloGeo, accentMat);
    halo.position.set(0, 1.55, 0);
    group.add(halo);

    for (const side of [-1, 1]) {
      const wingGeo = new THREE.BoxGeometry(0.85, 1.3, 0.06);
      const wing = new THREE.Mesh(wingGeo, secondaryMat);
      wing.position.set(side * 0.9, 1.15, 0);
      wing.castShadow = true;
      group.add(wing);
    }
  } else if (obj.primitive === 'cinema-camera-rig') {
    const bodyGeo = new THREE.BoxGeometry(0.8, 0.72, 1.05);
    const body = new THREE.Mesh(bodyGeo, secondaryMat);
    body.position.y = 0.85;
    body.castShadow = true;
    group.add(body);

    const barrelGeo = new THREE.CylinderGeometry(0.3, 0.34, 0.65, 24);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, primaryMat);
    barrel.position.set(0, 0.85, 0.75);
    barrel.castShadow = true;
    group.add(barrel);

    const glassGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.08, 24);
    glassGeo.rotateX(Math.PI / 2);
    const glass = new THREE.Mesh(glassGeo, accentMat);
    glass.position.set(0, 0.85, 1.06);
    group.add(glass);

    const tripodGeo = new THREE.CylinderGeometry(0.12, 0.45, 0.5, 12);
    const tripod = new THREE.Mesh(tripodGeo, secondaryMat);
    tripod.position.y = 0.25;
    group.add(tripod);
  } else {
    let geo: THREE.BufferGeometry;
    switch (obj.primitive) {
      case 'sphere':
        geo = new THREE.SphereGeometry(0.85, 32, 32);
        break;
      case 'cylinder':
        geo = new THREE.CylinderGeometry(0.65, 0.65, 1.6, 28);
        break;
      case 'torus':
        geo = new THREE.TorusKnotGeometry(0.65, 0.2, 80, 20);
        break;
      case 'procedural-lathe': {
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i <= 12; i++) {
          const t = i / 12;
          pts.push(new THREE.Vector2(0.35 + Math.sin(t * Math.PI * 2) * 0.25, t * 1.6));
        }
        geo = new THREE.LatheGeometry(pts, 28);
        break;
      }
      default:
        geo = new THREE.BoxGeometry(1.2, 1.2, 1.2, 8, 8, 8);
    }

    // Apply vertex deformation modifiers (Twist / Wave) if set
    if (obj.modifiers.twist !== 0 || obj.modifiers.wave !== 0) {
      const posAttr = geo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < posAttr.count; i++) {
        v.fromBufferAttribute(posAttr, i);
        if (obj.modifiers.twist !== 0) {
          const angle = v.y * obj.modifiers.twist;
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const nx = v.x * cosA - v.z * sinA;
          const nz = v.x * sinA + v.z * cosA;
          v.x = nx;
          v.z = nz;
        }
        if (obj.modifiers.wave !== 0) {
          v.x += Math.sin(v.y * 4.0) * obj.modifiers.wave * 0.25;
        }
        posAttr.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
    }

    const mesh = new THREE.Mesh(geo, primaryMat);
    mesh.position.y = 0.9;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  group.position.set(obj.position[0], obj.position[1], obj.position[2]);
  group.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2]);
  group.scale.set(obj.scale[0], obj.scale[1], obj.scale[2]);
  group.visible = obj.visible;

  return group;
}

export default function ViewportStage({
  masterCanvasRef,
}: {
  masterCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const {
    workspace,
    activeTool,
    clips,
    tracks,
    sceneObjects,
    selectedObject3DId,
    selectObject3D,
    updateObject3D,
    transformGizmoMode,
    setTransformGizmoMode,
    shadingMode,
    setShadingMode,
    composite3DOver2D,
    setComposite3DOver2D,
    explodedViewFactor,
    setExplodedViewFactor,
    studioLightPreset,
    groundPlaneCalibrated,
    shadowCatcherOpacity,
    showSafeGuides,
    setShowSafeGuides,
    viewportZoom,
    setViewportZoom,
    abWipeEnabled,
    abWipePosition,
    setAbWipe,
    trackPoints,
    updateTrackPointPosition,
    cornerPin,
    updateCornerPin,
    magicMaskEnabled,
    magicMaskStrokes,
    addMagicMaskStroke,
    beatMarkers,
  } = useStudioStore();

  const [multiCamMode, setMultiCamMode] = useState(false);
  const [activeCamAngle, setActiveCamAngle] = useState<1 | 2 | 3 | 4>(1);
  const [proxyScale, setProxyScale] = useState<1 | 0.5 | 0.25>(1);
  const [aspectRatioMode, setAspectRatioMode] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [activeParticlePreset, setActiveParticlePreset] = useState<ParticlePresetConfig>(PARTICLE_PRESETS[0]);
  const [inpaintMode, setInpaintMode] = useState(false);
  const [inpaintStrokes, setInpaintStrokes] = useState<Array<{ x: number; y: number; r: number }>>([]);
  const [reviewPins, setReviewPins] = useState<Array<{ id: string; x: number; y: number; time: number; author: string; note: string }>>([
    { id: 'pin-1', x: 0.52, y: 0.36, time: 2.4, author: 'Sarah (VFX Lead)', note: 'Boost anamorphic flare streak +15% on turbine ignition' },
  ]);

  const threeMountRef = useRef<HTMLDivElement | null>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const composite2DCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositorEngineRef = useRef<ShaderCompositorEngine | null>(null);
  const timecodeSpanRef = useRef<HTMLSpanElement | null>(null);

  // Store mutable refs for 60fps loop access without tearing down Three.js
  const stateRef = useRef({
    clips,
    tracks,
    sceneObjects,
    selectedObject3DId,
    shadingMode,
    composite3DOver2D,
    explodedViewFactor,
    studioLightPreset,
    groundPlaneCalibrated,
    shadowCatcherOpacity,
    showSafeGuides,
    abWipeEnabled,
    abWipePosition,
    trackPoints,
    cornerPin,
    magicMaskEnabled,
    magicMaskStrokes,
    multiCamMode,
    activeCamAngle,
    proxyScale,
    aspectRatioMode,
    activeParticlePreset,
    inpaintStrokes,
    reviewPins,
  });

  useEffect(() => {
    stateRef.current = {
      clips,
      tracks,
      sceneObjects,
      selectedObject3DId,
      shadingMode,
      composite3DOver2D,
      explodedViewFactor,
      studioLightPreset,
      groundPlaneCalibrated,
      shadowCatcherOpacity,
      showSafeGuides,
      abWipeEnabled,
      abWipePosition,
      trackPoints,
      cornerPin,
      magicMaskEnabled,
      magicMaskStrokes,
      multiCamMode,
      activeCamAngle,
      proxyScale,
      aspectRatioMode,
      activeParticlePreset,
      inpaintStrokes,
      reviewPins,
    };
  }, [
    clips,
    tracks,
    sceneObjects,
    selectedObject3DId,
    shadingMode,
    composite3DOver2D,
    explodedViewFactor,
    studioLightPreset,
    groundPlaneCalibrated,
    shadowCatcherOpacity,
    showSafeGuides,
    abWipeEnabled,
    abWipePosition,
    trackPoints,
    cornerPin,
    magicMaskEnabled,
    magicMaskStrokes,
    multiCamMode,
    activeCamAngle,
    proxyScale,
    aspectRatioMode,
    activeParticlePreset,
    inpaintStrokes,
    reviewPins,
  ]);

  // Multi-Cam Live Switching Hotkeys (1, 2, 3, 4 during Multi-Cam mode)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      if (multiCamMode && ['1', '2', '3', '4'].includes(e.key)) {
        const angle = parseInt(e.key, 10) as 1 | 2 | 3 | 4;
        setActiveCamAngle(angle);
      }
      if (e.key.toLowerCase() === 'g') setTransformGizmoMode('translate');
      if (e.key.toLowerCase() === 'r') setTransformGizmoMode('rotate');
      if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) setTransformGizmoMode('scale');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [multiCamMode, setTransformGizmoMode]);

  // Initialize Three.js Scene + GPU Particle System + WebGL2 Multi-Pass Compositor
  useEffect(() => {
    const mountEl = threeMountRef.current;
    const masterCanvas = masterCanvasRef.current;
    if (!mountEl || !masterCanvas) return;

    // Detect software WebGL per Three.js skill guidelines
    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = 960;
    const height = 540;

    // Offscreen 2D Canvas for compositing video plate, particles, titles, and HUD overlays
    const comp2D = document.createElement('canvas');
    comp2D.width = width;
    comp2D.height = height;
    composite2DCanvasRef.current = comp2D;

    // WebGL2 Multi-Pass Ping-Pong FBO Shader Compositor on masterCanvas
    masterCanvas.width = width;
    masterCanvas.height = height;
    const shaderEngine = new ShaderCompositorEngine(masterCanvas);
    compositorEngineRef.current = shaderEngine;

    // Three.js Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    threeCanvasRef.current = renderer.domElement;
    // Keep Three.js canvas hidden behind master WebGL2 compositor canvas, while forwarding Orbit/Transform events from masterCanvas
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.opacity = '0';
    renderer.domElement.style.pointerEvents = 'auto';
    mountEl.innerHTML = '';
    mountEl.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Procedural Studio RoomEnvironment reflection map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 2.3, 5.8);
    camera.lookAt(0, 0.9, 0);

    // 3-Point Balanced Studio Lighting Rig (Key + Cool Hemisphere Fill + Rim)
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.4);
    keyLight.position.set(4.5, 6.5, 4.0);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    const d = 4.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x06b6d4, 1.6);
    rimLight.position.set(-4.0, 3.5, -4.5);
    scene.add(rimLight);

    // Calibrated Ground Plane Grid & Contact Shadow Catcher
    const gridHelper = new THREE.GridHelper(12, 24, 0x06b6d4, 0x1e293b);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    const shadowPlaneGeo = new THREE.PlaneGeometry(14, 14);
    shadowPlaneGeo.rotateX(-Math.PI / 2);
    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      color: 0x020617,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    shadowPlane.position.y = 0.0;
    scene.add(shadowPlane);

    // GPU-Accelerated 3D Particle System (Points with Float32Array positions/velocities/colors)
    const particleCount = 1800;
    const pPositions = new Float32Array(particleCount * 3);
    const pVelocities = new Float32Array(particleCount * 3);
    const pColors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      const radius = 0.6 + Math.random() * 4.5;
      const theta = Math.random() * Math.PI * 2;
      pPositions[idx] = Math.cos(theta) * radius;
      pPositions[idx + 1] = Math.random() * 3.5;
      pPositions[idx + 2] = Math.sin(theta) * radius;

      pVelocities[idx] = (Math.random() - 0.5) * 0.6;
      pVelocities[idx + 1] = 0.3 + Math.random() * 0.9;
      pVelocities[idx + 2] = (Math.random() - 0.5) * 0.6;

      pColors[idx] = 0.05;
      pColors[idx + 1] = 0.75;
      pColors[idx + 2] = 0.95;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const gpuParticlePoints = new THREE.Points(particleGeo, particleMat);
    scene.add(gpuParticlePoints);

    // Container group for user Scene3DObjects
    const objectsRoot = new THREE.Group();
    scene.add(objectsRoot);

    // OrbitControls & TransformControls
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = !isSoftwareGl;
    orbit.dampingFactor = 0.06;
    orbit.target.set(0, 0.95, 0);

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setSize(0.85);
    const tcHelper = transformControls.getHelper();
    scene.add(tcHelper);

    transformControls.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !event.value;
      if (!event.value && transformControls.object) {
        const obj = transformControls.object;
        const selectedId = stateRef.current.selectedObject3DId;
        if (selectedId) {
          updateObject3D(selectedId, {
            position: [
              Number(obj.position.x.toFixed(2)),
              Number(obj.position.y.toFixed(2)),
              Number(obj.position.z.toFixed(2)),
            ],
            rotation: [
              Number(obj.rotation.x.toFixed(2)),
              Number(obj.rotation.y.toFixed(2)),
              Number(obj.rotation.z.toFixed(2)),
            ],
            scale: [
              Number(obj.scale.x.toFixed(2)),
              Number(obj.scale.y.toFixed(2)),
              Number(obj.scale.z.toFixed(2)),
            ],
          });
        }
      }
    });

    // Raycasting click selection on 3D canvas
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 5) {
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(objectsRoot.children, true);
      if (hits.length > 0) {
        let curr: THREE.Object3D | null = hits[0].object;
        while (curr && curr.parent !== objectsRoot) {
          curr = curr.parent;
        }
        if (curr && curr.name) {
          selectObject3D(curr.name);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Sync Scene3DObjects helper
    let lastSceneSig = '';
    const syncSceneObjects = (objs: Scene3DObject[], selectedId: string | null, exploded: number) => {
      const sig = JSON.stringify({
        objs: objs.map((o) => ({
          id: o.id,
          p: o.primitive,
          v: o.visible,
          pos: o.position,
          rot: o.rotation,
          s: o.scale,
          m: o.material,
          mod: o.modifiers,
        })),
        selectedId,
        shading: stateRef.current.shadingMode,
      });

      if (sig !== lastSceneSig) {
        lastSceneSig = sig;
        transformControls.detach();
        while (objectsRoot.children.length > 0) {
          objectsRoot.remove(objectsRoot.children[0]);
        }

        for (const item of objs) {
          const clonedItem: Scene3DObject = {
            ...item,
            material: {
              ...item.material,
              wireframe:
                stateRef.current.shadingMode === 'wireframe' || item.material.wireframe,
            },
          };
          const grp = buildProcedural3DGroup(clonedItem);
          objectsRoot.add(grp);
          if (item.id === selectedId) {
            transformControls.attach(grp);
          }
        }
      }

      // Apply exploded view separation smoothly across child parts of selected object
      objectsRoot.children.forEach((grp) => {
        grp.children.forEach((part, idx) => {
          if (idx > 0 && exploded > 0) {
            const dirY = idx % 2 === 0 ? 1 : -0.5;
            part.position.y = 0.9 + dirY * exploded * 0.85;
          }
        });
      });
    };

    // Animation & Compositing Loop
    let frameId = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const renderFrame = () => {
      const currentTime = playbackEngine.getTime();
      const isPlaying = playbackEngine.getIsPlaying();
      const st = stateRef.current;

      // Update live timecode DOM element directly (zero React re-render overhead)
      if (timecodeSpanRef.current) {
        timecodeSpanRef.current.textContent = HighFrequencyPlaybackEngine.formatTimecode(
          currentTime,
          useStudioStore.getState().fps
        );
      }

      // Sync Web Audio Engine & extract real-time FFT + audioBass
      audioEngine.setPlaybackState(isPlaying, useStudioStore.getState().detectedBpm);
      const telemetry = audioEngine.getTelemetry(currentTime, isPlaying);
      const audioBass = telemetry.audioBass;

      // Sync Three.js objects & gizmo mode
      syncSceneObjects(st.sceneObjects, st.selectedObject3DId, st.explodedViewFactor);
      gridHelper.visible = st.groundPlaneCalibrated;
      shadowPlane.material.opacity = st.shadowCatcherOpacity;

      // Animate 3D Drone & GPU Curl-Noise Particles with time + audioBass
      objectsRoot.children.forEach((grp, idx) => {
        if (idx === 0 && grp.children.length >= 3) {
          grp.children[1].rotation.z = currentTime * 1.4;
          grp.children[2].rotation.x = -currentTime * 2.1;
          grp.position.y = Math.sin(currentTime * 2.2) * 0.08;
        } else {
          grp.rotation.y = st.sceneObjects[idx]?.rotation[1] + Math.sin(currentTime * 0.8 + idx) * 0.15;
        }
      });

      // Update GPU 3D Particles based on active preset & curl-noise turbulence
      const posAttr = particleGeo.attributes.position as THREE.BufferAttribute;
      const colAttr = particleGeo.attributes.color as THREE.BufferAttribute;
      const startCol = new THREE.Color(st.activeParticlePreset.colorStart);
      const endCol = new THREE.Color(st.activeParticlePreset.colorEnd);
      const tmpCol = new THREE.Color();

      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3;
        const lifePhase = ((i / particleCount) + currentTime * 0.25 * st.activeParticlePreset.speed) % 1;
        const angle = (i * 0.17) + currentTime * st.activeParticlePreset.turbulence * 0.6;
        const r = (0.5 + lifePhase * 3.8) * (1 + audioBass * 0.25);

        if (st.activeParticlePreset.mode === 'bass-shockwave') {
          const ringR = ((currentTime * 2.5 + (i % 5) * 0.6) % 4.2) * (1 + audioBass * 0.4);
          posAttr.setXYZ(
            i,
            Math.cos(angle * 3) * ringR,
            0.15 + Math.sin(i * 0.5 + currentTime * 6) * 0.25 * audioBass,
            Math.sin(angle * 3) * ringR
          );
        } else if (st.activeParticlePreset.mode === 'blizzard-storm') {
          posAttr.setXYZ(
            i,
            ((i * 1.37 + currentTime * 3.2) % 8) - 4,
            3.8 - lifePhase * 4.0,
            ((i * 2.13 + Math.sin(currentTime + i)) % 8) - 4
          );
        } else {
          posAttr.setXYZ(
            i,
            Math.cos(angle) * r,
            lifePhase * 3.2 + Math.sin(currentTime * 3 + i) * 0.15,
            Math.sin(angle) * r
          );
        }

        tmpCol.copy(startCol).lerp(endCol, lifePhase);
        colAttr.setXYZ(i, tmpCol.r, tmpCol.g, tmpCol.b);
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;

      // Multi-Cam angle camera override if Multi-Cam Quad View is active
      if (!orbit.enabled) {
        // TransformControls active
      } else if (st.multiCamMode) {
        const camPresets: Record<1 | 2 | 3 | 4, [number, number, number]> = {
          1: [0, 2.2, 5.8],
          2: [4.8, 1.8, 3.2],
          3: [-4.5, 2.8, 3.6],
          4: [0, 5.6, 1.2],
        };
        const targetPos = camPresets[st.activeCamAngle];
        camera.position.lerp(new THREE.Vector3(...targetPos), 0.12);
        camera.lookAt(0, 0.95, 0);
      } else {
        orbit.update();
      }

      renderer.render(scene, camera);

      // Now composite 2D Video Plate + 3D Stage + Titles + HUD Guides onto comp2D
      const ctx = comp2D.getContext('2d');
      if (ctx) {
        const w = comp2D.width;
        const h = comp2D.height;
        ctx.clearRect(0, 0, w, h);

        // 1. Background Cinema Plate & Visual Maker Horizon
        const bgGrad = ctx.createRadialGradient(
          w * 0.5,
          h * (0.42 - audioBass * 0.06),
          20,
          w * 0.5,
          h * 0.5,
          w * 0.75
        );
        bgGrad.addColorStop(0, '#0f172a');
        bgGrad.addColorStop(0.55, '#090d16');
        bgGrad.addColorStop(1, '#020617');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Visual Maker Audio-Reactive FFT Spectrum Horizon Bars
        const videoClip = st.clips.find(
          (c) =>
            c.trackId === 'track-video' &&
            currentTime >= c.startTime &&
            currentTime <= c.startTime + c.duration
        );
        if (videoClip) {
          const barCount = 48;
          const barWidth = w / barCount;
          ctx.save();
          ctx.globalAlpha = 0.32;
          for (let b = 0; b < barCount; b++) {
            const val = telemetry.fftBins[b * 2] / 255;
            const barH = val * h * 0.42;
            const grad = ctx.createLinearGradient(0, h, 0, h - barH);
            grad.addColorStop(0, videoClip.particleConfig?.colorStart || '#06b6d4');
            grad.addColorStop(1, videoClip.particleConfig?.colorEnd || '#f59e0b');
            ctx.fillStyle = grad;
            ctx.fillRect(b * barWidth + 2, h - barH, barWidth - 4, barH);
          }
          ctx.restore();
        }

        // 2. Draw Three.js 3D Stage WebGL canvas onto comp2D
        ctx.drawImage(renderer.domElement, 0, 0, w, h);

        // 3. If Magic Mask "Behind Subject" Sandwich mode is enabled, render foreground matte rim highlight
        if (st.magicMaskEnabled) {
          ctx.save();
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.arc(w * 0.5, h * 0.52, 128, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // 4. Render 4-Corner Pin Perspective Screen Replacement if enabled
        if (st.cornerPin.enabled) {
          const tl = { x: st.cornerPin.topLeft.x * w, y: st.cornerPin.topLeft.y * h };
          const tr = { x: st.cornerPin.topRight.x * w, y: st.cornerPin.topRight.y * h };
          const br = { x: st.cornerPin.bottomRight.x * w, y: st.cornerPin.bottomRight.y * h };
          const bl = { x: st.cornerPin.bottomLeft.x * w, y: st.cornerPin.bottomLeft.y * h };

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(tl.x, tl.y);
          ctx.lineTo(tr.x, tr.y);
          ctx.lineTo(br.x, br.y);
          ctx.lineTo(bl.x, bl.y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(6, 182, 212, 0.22)';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#22d3ee';
          ctx.stroke();

          const cx = (tl.x + tr.x + br.x + bl.x) * 0.25;
          const cy = (tl.y + tr.y + br.y + bl.y) * 0.25;
          ctx.fillStyle = '#e0f2fe';
          ctx.font = '600 12px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(st.cornerPin.overlayTitle, cx, cy);
          ctx.restore();
        }

        // 5. Render Active Text & Kinetic Captions Track Clips
        const activeTextClips = st.clips.filter(
          (c) =>
            c.trackId === 'track-text' &&
            currentTime >= c.startTime &&
            currentTime <= c.startTime + c.duration
        );
        for (const tc of activeTextClips) {
          const evalOpacity = HighFrequencyPlaybackEngine.evaluateKeyframes(
            tc.keyframes['opacity'],
            currentTime,
            tc.opacity
          );
          ctx.save();
          ctx.globalAlpha = evalOpacity;
          const tx = w * 0.5 + tc.transform.positionX;
          const ty = h * 0.84;

          // Glassmorphic broadcast title bar backing
          ctx.fillStyle = 'rgba(9, 9, 11, 0.76)';
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
          ctx.lineWidth = 1.5;
          const boxW = 540;
          const boxH = 54;
          ctx.beginPath();
          ctx.roundRect(tx - boxW / 2, ty - boxH / 2, boxW, boxH, 8);
          ctx.fill();
          ctx.stroke();

          if (tc.kineticWords && tc.kineticWords.length > 0) {
            ctx.font = `700 ${tc.fontSize || 26}px "Plus Jakarta Sans", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const fullPhrase = tc.kineticWords.map((kw) => kw.word).join(' ');
            const activeWord = tc.kineticWords.find(
              (kw) => currentTime >= kw.start && currentTime <= kw.end
            );

            ctx.fillStyle = tc.textColor || '#f8fafc';
            ctx.fillText(fullPhrase, tx, ty - 4);

            if (activeWord) {
              ctx.font = '600 11px "JetBrains Mono", monospace';
              ctx.fillStyle = tc.accentColor || '#f59e0b';
              ctx.fillText(`ACTIVE WORD SYNC: [ ${activeWord.word} ]`, tx, ty + 17);
            }
          } else if (tc.textContent) {
            ctx.font = `700 ${tc.fontSize || 28}px "Plus Jakarta Sans", sans-serif`;
            ctx.fillStyle = tc.textColor || '#f8fafc';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tc.textContent, tx, ty);
          }
          ctx.restore();
        }
      }

      // Collect active WebGL2 Shader Passes from Adjustment & Video Clips
      const activePasses = st.clips
        .filter(
          (c) =>
            currentTime >= c.startTime &&
            currentTime <= c.startTime + c.duration &&
            c.effectStack.length > 0
        )
        .flatMap((c) =>
          c.effectStack.map((pass) => {
            // Apply keyframed uniform overrides if any exist on the clip
            const updatedUniforms = { ...pass.uniformValues };
            for (const uName of Object.keys(updatedUniforms)) {
              const kfCurve = c.keyframes[`uniform.${uName}`];
              if (kfCurve && kfCurve.length > 0) {
                updatedUniforms[uName] = [
                  HighFrequencyPlaybackEngine.evaluateKeyframes(
                    kfCurve,
                    currentTime,
                    updatedUniforms[uName][0]
                  ),
                ];
              }
            }
            return { ...pass, uniformValues: updatedUniforms };
          })
        );

      shaderEngine.renderCompositeStack(comp2D, activePasses, currentTime, audioBass);


      if (isSoftwareGl) {
        afterDraw(renderFrame);
      } else {
        frameId = requestAnimationFrame(renderFrame);
      }
    };

    frameId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      shaderEngine.dispose();
      renderer.dispose();
    };
  }, [masterCanvasRef, selectObject3D, updateObject3D]);

  // Keep TransformControls gizmo mode synced when user toggles G / R / S
  const [dualMonitorMode, setDualMonitorMode] = useState(false);
  const [sourceClipName, setSourceClipName] = useState('A004_C012_ARRI_LogC4_Master.mov');

  const triggerThreePointEdit = (mode: 'insert' | 'overwrite' | 'replace' | 'top') => {
    const t = playbackEngine.getTime();
    const targetTrack = mode === 'top' ? 'track-text' : 'track-video';
    useStudioStore.getState().addClipToTrack(targetTrack, {
      name: `${sourceClipName.split('_')[0]} · ${mode.toUpperCase()} Cut`,
      type: mode === 'top' ? 'text' : 'video',
      textContent: mode === 'top' ? 'DA VINCI 3-POINT SUPERIMPOSE OVERLAY' : undefined,
      startTime: Number(t.toFixed(2)),
      duration: 3.5,
      color: mode === 'insert' ? '#f59e0b' : mode === 'overwrite' ? '#ef4444' : '#06b6d4',
    });
  };

  return (
    <div className="relative flex-1 flex flex-col bg-[#06070b] overflow-hidden border-r border-white/[0.08]">
      {/* Viewport Top Control Sub-Bar */}
      <div className="h-9 px-3 bg-[#0c0e16] border-b border-white/[0.08] flex items-center justify-between gap-2 text-xs">
        {/* Left: 3D Gizmo, Shading & Dual Viewer Switch */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-[#06070b] border border-white/[0.08] rounded p-0.5">
            <button
              onClick={() => setTransformGizmoMode('translate')}
              title="Translate Gizmo (G)"
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                transformGizmoMode === 'translate'
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Move className="w-3.5 h-3.5" />
              <span>Move</span>
            </button>
            <button
              onClick={() => setTransformGizmoMode('rotate')}
              title="Rotate Gizmo (R)"
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                transformGizmoMode === 'rotate'
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Rotate</span>
            </button>
            <button
              onClick={() => setTransformGizmoMode('scale')}
              title="Scale Gizmo (S)"
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                transformGizmoMode === 'scale'
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Scale</span>
            </button>
          </div>

          {/* Single vs Dual Source/Program Monitor Switch */}
          <button
            onClick={() => setDualMonitorMode(!dualMonitorMode)}
            className={`px-2 py-1 rounded border text-[11px] font-medium transition-colors whitespace-nowrap ${
              dualMonitorMode
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-semibold'
                : 'bg-[#06070b] border-white/[0.08] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {dualMonitorMode ? 'Dual Viewer (Source + PGM)' : 'Dual Viewer'}
          </button>

          {/* Wireframe / Rendered Switch */}
          <div className="hidden md:flex items-center bg-[#06070b] border border-white/[0.08] rounded p-0.5">
            {(['rendered', 'wireframe'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setShadingMode(m)}
                className={`px-2 py-0.5 rounded capitalize transition-colors whitespace-nowrap shrink-0 ${
                  shadingMode === m
                    ? 'bg-zinc-800 text-amber-400 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* 3D Particle Preset Selector */}
          <div className="hidden 2xl:flex items-center gap-1 bg-[#06070b] border border-white/[0.08] rounded px-2 py-1">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <select
              value={activeParticlePreset.id}
              onChange={(e) => {
                const found = PARTICLE_PRESETS.find((p) => p.id === e.target.value);
                if (found) setActiveParticlePreset(found);
              }}
              className="bg-transparent text-zinc-200 text-xs focus:outline-none cursor-pointer"
            >
              {PARTICLE_PRESETS.map((p) => (
                <option key={p.id} value={p.id} className="bg-zinc-900 text-zinc-100">
                  Particle: {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Center: Live SMPTE Timecode Readout & Color Space Badge */}
        <div className="flex items-center gap-2 bg-[#05060a] border border-white/10 px-3 py-1 rounded font-mono text-xs tabular-nums shadow-inner">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span ref={timecodeSpanRef} className="text-amber-400 font-semibold">
            00:00:00:00
          </span>
          <span className="text-zinc-600">·</span>
          <span className="text-cyan-400 text-[10px]">ACEScct 32F</span>
          <span className="text-zinc-600">·</span>
          <span className="text-zinc-400 text-[11px]">{aspectRatioMode}</span>
        </div>

        {/* Right: Multi-Cam, A/B Wipe, AI Inpaint, Proxy & Safe Guides */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMultiCamMode(!multiCamMode)}
            className={`px-2 py-1 rounded border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
              multiCamMode
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-medium'
                : 'bg-[#06070b] border-white/[0.08] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Multi-Cam</span>
          </button>

          <button
            onClick={() => setAbWipe(!abWipeEnabled)}
            className={`px-2 py-1 rounded border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
              abWipeEnabled
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-medium'
                : 'bg-[#06070b] border-white/[0.08] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <SplitSquareVertical className="w-3.5 h-3.5" />
            <span>A/B Wipe</span>
          </button>

          <button
            onClick={() => setInpaintMode(!inpaintMode)}
            className={`px-2 py-1 rounded border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
              inpaintMode
                ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 font-medium'
                : 'bg-[#06070b] border-white/[0.08] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Inpaint</span>
          </button>

          <select
            value={aspectRatioMode}
            onChange={(e) => setAspectRatioMode(e.target.value as '16:9' | '9:16' | '1:1')}
            className="bg-[#06070b] border border-white/[0.08] rounded px-2 py-1 text-zinc-300 text-xs focus:outline-none cursor-pointer"
          >
            <option value="16:9">16:9 Cinema</option>
            <option value="9:16">9:16 Vertical</option>
            <option value="1:1">1:1 Square</option>
          </select>

          <button
            onClick={() => setShowSafeGuides(!showSafeGuides)}
            title="Toggle Safe-Title Guides"
            className={`p-1.5 rounded border transition-colors ${
              showSafeGuides
                ? 'bg-zinc-800 border-amber-500/40 text-amber-400'
                : 'bg-[#06070b] border-white/[0.08] text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Stage Container (Supports Single Cinema Viewer OR DaVinci Dual Source/Timeline Monitors) */}
      <div className="relative flex-1 flex items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,#111522_0%,#06070b_75%)] p-3 overflow-hidden">
        {/* Optional Left Source Tape Monitor when Dual Viewer Mode is active */}
        {dualMonitorMode && (
          <div className="flex-1 max-w-[440px] aspect-video bg-[#040508] rounded-lg border border-white/10 shadow-2xl flex flex-col justify-between overflow-hidden relative">
            <div className="px-2.5 py-1.5 bg-[#0b0d14]/90 border-b border-white/[0.07] flex items-center justify-between text-[10px] font-mono">
              <span className="text-cyan-400 font-semibold">SOURCE TAPE // VIEWER 1</span>
              <select
                value={sourceClipName}
                onChange={(e) => setSourceClipName(e.target.value)}
                className="bg-[#06070b] border border-white/10 rounded px-1.5 py-0.5 text-zinc-200 text-[10px]"
              >
                <option value="A004_C012_ARRI_LogC4_Master.mov">A004_C012_ARRI_LogC4.mov</option>
                <option value="B019_C003_Phantom_1000fps.raw">B019_C003_Phantom_1000fps.raw</option>
                <option value="C008_Anamorphic_Drone_Pass.exr">C008_Anamorphic_Drone.exr</option>
              </select>
            </div>

            {/* Synthetic Raw Log Source Plate Preview */}
            <div className="flex-1 relative bg-gradient-to-br from-slate-900 via-[#0d1829] to-zinc-950 flex flex-col items-center justify-center p-4">
              <div className="w-20 h-20 rounded-full border-2 border-cyan-400/40 flex items-center justify-center relative">
                <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-amber-400/60" />
              </div>
              <div className="mt-2 font-mono text-[10px] text-zinc-400">
                RAW LOG UNGRADED SOURCE · IN: 00:01:12 · OUT: 00:04:24
              </div>
            </div>

            {/* DaVinci 3-Point Editing Action Strip */}
            <div className="p-1.5 bg-[#0b0d14] border-t border-white/[0.08] grid grid-cols-4 gap-1 text-[10px] font-medium">
              <button
                onClick={() => triggerThreePointEdit('insert')}
                className="py-1 rounded bg-amber-500/20 hover:bg-amber-500 hover:text-zinc-950 border border-amber-500/40 text-amber-300 transition-colors"
              >
                Insert (F9)
              </button>
              <button
                onClick={() => triggerThreePointEdit('overwrite')}
                className="py-1 rounded bg-rose-500/20 hover:bg-rose-500 hover:text-white border border-rose-500/40 text-rose-300 transition-colors"
              >
                Overwrite (F10)
              </button>
              <button
                onClick={() => triggerThreePointEdit('replace')}
                className="py-1 rounded bg-cyan-500/20 hover:bg-cyan-500 hover:text-zinc-950 border border-cyan-500/40 text-cyan-300 transition-colors"
              >
                Replace (F11)
              </button>
              <button
                onClick={() => triggerThreePointEdit('top')}
                className="py-1 rounded bg-emerald-500/20 hover:bg-emerald-500 hover:text-zinc-950 border border-emerald-500/40 text-emerald-300 transition-colors"
              >
                Place Top (F12)
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            transform: `scale(${viewportZoom / 100})`,
            width: aspectRatioMode === '9:16' ? '340px' : aspectRatioMode === '1:1' ? '500px' : '100%',
            maxWidth: aspectRatioMode === '16:9' ? (dualMonitorMode ? '520px' : '920px') : undefined,
          }}
          className="relative aspect-video bg-black rounded-lg overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.85)] border border-white/15 ring-1 ring-amber-500/10 transition-transform duration-150"
          onClick={(e) => {
            if (!inpaintMode) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const nx = (e.clientX - rect.left) / rect.width;
            const ny = (e.clientY - rect.top) / rect.height;
            setInpaintStrokes((prev) => [...prev, { x: nx, y: ny, r: 26 }]);
          }}
        >
          {/* Master WebGL2 Ping-Pong Shader & 3D Output Canvas */}
          <canvas
            ref={masterCanvasRef}
            className="w-full h-full object-contain block pointer-events-none"
          />

          {/* Interactive Three.js Mount Overlay for OrbitControls & TransformControls */}
          <div ref={threeMountRef} className="absolute inset-0 z-10" />

          {/* Broadcast Safe-Title & Action Guides Overlay */}
          {showSafeGuides && (
            <div className="absolute inset-0 pointer-events-none z-20">
              <div className="absolute inset-[5%] border border-white/15 border-dashed" />
              <div className="absolute inset-[10%] border border-amber-400/20" />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10" />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10" />
            </div>
          )}

          {/* 2D Optical Flow Track Points & Motion Spline Overlay */}
          {(activeTool === 'track-point' || workspace === 'vfx') && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
              {trackPoints.map((tp) => {
                const color =
                  tp.confidence > 0.75
                    ? '#22c55e'
                    : tp.confidence > 0.45
                    ? '#eab308'
                    : '#ef4444';
                const pathD = tp.trajectory
                  .map(
                    (pt, idx) =>
                      `${idx === 0 ? 'M' : 'L'} ${(pt.x * 100).toFixed(1)}% ${(pt.y * 100).toFixed(1)}%`
                  )
                  .join(' ');
                return (
                  <g key={tp.id}>
                    <polyline
                      fill="none"
                      stroke={color}
                      strokeWidth="1.5"
                      strokeDasharray="3 2"
                      points={tp.trajectory
                        .map((pt) => `${pt.x * 920},${pt.y * 518}`)
                        .join(' ')}
                      opacity={0.75}
                    />
                    <circle
                      cx={`${tp.x * 100}%`}
                      cy={`${tp.y * 100}%`}
                      r="6"
                      fill="none"
                      stroke={color}
                      strokeWidth="2"
                    />
                    <rect
                      x={`${tp.x * 100 - 1.2}%`}
                      y={`${tp.y * 100 - 2.1}%`}
                      width="2.4%"
                      height="4.2%"
                      fill="none"
                      stroke={color}
                      strokeWidth="1"
                    />
                    <text
                      x={`${tp.x * 100 + 1.5}%`}
                      y={`${tp.y * 100 - 1.2}%`}
                      fill={color}
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {tp.label} ({Math.round(tp.confidence * 100)}%)
                    </text>
                  </g>
                );
              })}
            </svg>
          )}

          {/* AI Object Removal Inpainting Mask Overlay */}
          {inpaintMode && (
            <div className="absolute inset-0 z-30 cursor-crosshair">
              <div className="absolute top-2.5 left-2.5 bg-purple-950/90 border border-purple-500/50 text-purple-200 px-2.5 py-1 rounded text-xs flex items-center gap-2">
                <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                <span>AI Patch-Match Inpainting Active — Click unwanted objects to erase & propagate</span>
                {inpaintStrokes.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setInpaintStrokes([]);
                    }}
                    className="ml-2 px-1.5 py-0.5 bg-purple-800/80 hover:bg-purple-700 rounded text-[11px]"
                  >
                    Clear ({inpaintStrokes.length})
                  </button>
                )}
              </div>
              {inpaintStrokes.map((st, idx) => (
                <div
                  key={idx}
                  style={{
                    left: `${st.x * 100}%`,
                    top: `${st.y * 100}%`,
                    width: `${st.r * 2}px`,
                    height: `${st.r * 2}px`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-500/35 border border-purple-400 pointer-events-none flex items-center justify-center text-[9px] font-mono text-purple-100"
                >
                  INPAINT
                </div>
              ))}
            </div>
          )}

          {/* Multi-Cam 2x2 Quad Live Switcher Overlay */}
          {multiCamMode && (
            <div className="absolute top-3 left-3 w-72 bg-zinc-950/90 border border-zinc-700 rounded-lg p-2 z-30 shadow-xl">
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-300 mb-1.5">
                <span>MULTI-CAM QUAD MONITOR</span>
                <span className="font-mono text-rose-400">PGM: CAM {activeCamAngle}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {([1, 2, 3, 4] as const).map((cam) => {
                  const isPgm = activeCamAngle === cam;
                  return (
                    <button
                      key={cam}
                      onClick={() => setActiveCamAngle(cam)}
                      className={`h-16 rounded border flex flex-col justify-between p-1.5 text-left transition-all ${
                        isPgm
                          ? 'border-rose-500 bg-rose-950/40 ring-1 ring-rose-500'
                          : 'border-emerald-500/40 bg-zinc-900/90 hover:border-emerald-400'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={`text-[10px] font-mono font-bold px-1 rounded ${
                            isPgm ? 'bg-rose-600 text-white' : 'bg-emerald-600/30 text-emerald-300'
                          }`}
                        >
                          CAM {cam}
                        </span>
                        <span className="text-[9px] font-mono text-zinc-400">SYNC +0.0ms</span>
                      </div>
                      <span className="text-[10px] text-zinc-300 truncate">
                        {cam === 1
                          ? 'Wide Master'
                          : cam === 2
                          ? 'Right Profile'
                          : cam === 3
                          ? 'Left Dolly'
                          : 'Overhead Crane'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* A/B Split Wipe Interactive Slider Overlay */}
          {abWipeEnabled && (
            <div
              style={{ left: `${abWipePosition}%` }}
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-30 cursor-ew-resize"
            >
              <div className="absolute top-3 -left-24 bg-zinc-950/90 border border-cyan-500/40 px-2 py-0.5 rounded text-[10px] font-mono text-cyan-300 whitespace-nowrap">
                VIEWER 1 (A) | VIEWER 2 (B)
              </div>
              <input
                type="range"
                min={5}
                max={95}
                value={abWipePosition}
                onChange={(e) => setAbWipe(true, Number(e.target.value))}
                className="absolute bottom-4 -left-20 w-40 accent-cyan-400 cursor-pointer pointer-events-auto"
              />
            </div>
          )}

          {/* Collaborative Review Frame Pins */}
          {reviewPins.map((pin) => (
            <div
              key={pin.id}
              style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2 group pointer-events-auto"
            >
              <div className="w-5 h-5 rounded-full bg-amber-500/90 text-zinc-950 font-mono text-[10px] font-bold flex items-center justify-center shadow cursor-pointer">
                !
              </div>
              <div className="hidden group-hover:block absolute left-6 top-0 w-56 bg-zinc-950 border border-amber-500/50 rounded p-2 text-[11px] text-zinc-200 shadow-xl">
                <div className="font-semibold text-amber-400">{pin.author}</div>
                <div className="text-zinc-300 mt-0.5">{pin.note}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Collapsible Bottom 3D & Viewport Quick-Control Dock (per Three.js skill §5) */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 bg-zinc-900/95 border border-zinc-800 rounded-lg px-3 py-1.5 flex items-center gap-4 text-xs shadow-xl">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-zinc-400 whitespace-nowrap">Exploded View</span>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={explodedViewFactor}
              onChange={(e) => setExplodedViewFactor(Number(e.target.value))}
              className="w-20 accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="h-3.5 w-px bg-zinc-800" />

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 whitespace-nowrap">3D Composite:</span>
            <button
              onClick={() =>
                setComposite3DOver2D(composite3DOver2D === 'over' ? 'behind' : 'over')
              }
              className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-medium capitalize whitespace-nowrap"
            >
              {composite3DOver2D === 'over' ? '3D Over 2D' : '3D Behind Subject'}
            </button>
          </div>

          <div className="h-3.5 w-px bg-zinc-800" />

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">Zoom:</span>
            <select
              value={viewportZoom}
              onChange={(e) => setViewportZoom(Number(e.target.value))}
              className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-200 font-mono text-xs"
            >
              <option value={50}>50%</option>
              <option value={75}>75%</option>
              <option value={100}>100% (Fit)</option>
              <option value={150}>150%</option>
              <option value={200}>200%</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
