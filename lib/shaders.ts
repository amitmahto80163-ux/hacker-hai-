export type ShaderCategory = 'Optical' | 'Color' | 'Stylize' | 'Glitch' | 'Procedural';

export type UniformType = 'float' | 'vec2' | 'vec3' | 'bool';

export interface UniformDefinition {
  name: string;
  label: string;
  type: UniformType;
  defaultValue: number[];
  min?: number;
  max?: number;
  step?: number;
  isColor?: boolean;
}

export interface ShaderDefinition {
  id: string;
  name: string;
  fileName: string;
  category: ShaderCategory;
  description: string;
  fragmentSource: string;
  uniforms: UniformDefinition[];
  isCustom?: boolean;
}

export interface ShaderDiagnosticError {
  line: number;
  message: string;
  raw: string;
}

export const DEFAULT_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_uv;
out vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const PASSTHROUGH_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  fragColor = texture(u_texture, v_uv);
}
`;

/**
 * Parses custom uniform declarations and comment annotations from GLSL source code.
 * Supports annotations such as:
 * uniform float u_warpSpeed; // @min 0.0 @max 10.0 @default 2.5 @label "Warp Speed"
 * uniform vec3 u_tintColor; // @type color @default 1.0,0.2,0.5 @label "Neon Tint"
 * uniform vec2 u_center; // @min 0.0 @max 1.0 @default 0.5,0.5 @label "Effect Center"
 */
export function parseCustomUniforms(glslSource: string): UniformDefinition[] {
  const reserved = new Set(['u_texture', 'u_resolution', 'u_time', 'u_audioBass']);
  const results: UniformDefinition[] = [];
  const lines = glslSource.split('\n');

  const uniformRegex = /^\s*uniform\s+(float|vec2|vec3|bool|int)\s+([a-zA-Z0-9_]+)\s*;(.*)$/;

  for (const line of lines) {
    const match = line.match(uniformRegex);
    if (!match) continue;

    const rawType = match[1];
    const name = match[2];
    const commentPart = match[3] || '';

    if (reserved.has(name)) continue;

    const type: UniformType =
      rawType === 'int' ? 'float' : (rawType as UniformType);

    const minMatch = commentPart.match(/@min\s+([+-]?\d*\.?\d+)/);
    const maxMatch = commentPart.match(/@max\s+([+-]?\d*\.?\d+)/);
    const defaultMatch = commentPart.match(/@default\s+([0-9.,+-]+)/);
    const labelMatch = commentPart.match(/@label\s+"([^"]+)"/);
    const typeMatch = commentPart.match(/@type\s+(\w+)/);

    const isColor =
      type === 'vec3' &&
      (typeMatch?.[1]?.toLowerCase() === 'color' ||
        name.toLowerCase().includes('color') ||
        name.toLowerCase().includes('tint'));

    let defaultValue: number[] = [1.0];
    if (type === 'vec2') defaultValue = [0.5, 0.5];
    if (type === 'vec3') defaultValue = isColor ? [0.2, 0.7, 1.0] : [1.0, 1.0, 1.0];
    if (type === 'bool') defaultValue = [0];

    if (defaultMatch && defaultMatch[1]) {
      const parsed = defaultMatch[1]
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !Number.isNaN(n));
      if (parsed.length > 0) {
        defaultValue = parsed;
      }
    }

    const humanLabel =
      labelMatch?.[1] ||
      name
        .replace(/^u_/, '')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();

    const min = minMatch ? parseFloat(minMatch[1]) : type === 'vec2' ? 0.0 : 0.0;
    const max = maxMatch ? parseFloat(maxMatch[1]) : type === 'vec2' ? 1.0 : 5.0;
    const step = (max - min) / 100 || 0.01;

    results.push({
      name,
      label: humanLabel,
      type,
      defaultValue,
      min,
      max,
      step,
      isColor,
    });
  }

  return results;
}

/**
 * All 15 Production WebGL2 (#version 300 es) GLSL Fragment Shaders
 */
export const PRODUCTION_SHADERS: ShaderDefinition[] = [
  // ============================================================================
  // CATEGORY A: OPTICAL & CINEMATIC LENS SHADERS (1 - 5)
  // ============================================================================
  {
    id: 'bloom',
    name: 'HDR Dual-Filter Bloom',
    fileName: 'bloom.frag',
    category: 'Optical',
    description:
      'Extracts high-luminance highlights above threshold, applies a 9-tap Kawase/tent filter kernel, and screen-blends intense optical glow.',
    uniforms: [
      { name: 'u_threshold', label: 'Luma Threshold', type: 'float', defaultValue: [0.62], min: 0.0, max: 1.0, step: 0.01 },
      { name: 'u_intensity', label: 'Bloom Intensity', type: 'float', defaultValue: [1.35], min: 0.0, max: 4.0, step: 0.05 },
      { name: 'u_radius', label: 'Filter Radius', type: 'float', defaultValue: [3.2], min: 0.5, max: 12.0, step: 0.1 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform float u_threshold; // @min 0.0 @max 1.0 @default 0.62 @label "Luma Threshold"
uniform float u_intensity; // @min 0.0 @max 4.0 @default 1.35 @label "Bloom Intensity"
uniform float u_radius;    // @min 0.5 @max 12.0 @default 3.2 @label "Filter Radius"

in vec2 v_uv;
out vec4 fragColor;

float getLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 extractBright(vec3 c, float thresh) {
  float luma = getLuma(c);
  float knee = thresh * 0.35 + 0.0001;
  float soft = clamp(luma - thresh + knee, 0.0, 2.0 * knee);
  soft = (soft * soft) / (4.0 * knee);
  float contribution = max(soft, luma - thresh) / max(luma, 0.0001);
  return c * clamp(contribution, 0.0, 1.0);
}

void main() {
  vec4 baseSample = texture(u_texture, v_uv);
  vec2 texel = (u_radius * (1.0 + u_audioBass * 0.35)) / max(u_resolution, vec2(1.0));

  // 9-tap tent / Kawase dual-filter kernel
  vec3 accum = vec3(0.0);
  accum += extractBright(texture(u_texture, v_uv + vec2(-texel.x, -texel.y)).rgb, u_threshold) * 1.0;
  accum += extractBright(texture(u_texture, v_uv + vec2(0.0, -texel.y)).rgb, u_threshold) * 2.0;
  accum += extractBright(texture(u_texture, v_uv + vec2(texel.x, -texel.y)).rgb, u_threshold) * 1.0;

  accum += extractBright(texture(u_texture, v_uv + vec2(-texel.x, 0.0)).rgb, u_threshold) * 2.0;
  accum += extractBright(baseSample.rgb, u_threshold) * 4.0;
  accum += extractBright(texture(u_texture, v_uv + vec2(texel.x, 0.0)).rgb, u_threshold) * 2.0;

  accum += extractBright(texture(u_texture, v_uv + vec2(-texel.x, texel.y)).rgb, u_threshold) * 1.0;
  accum += extractBright(texture(u_texture, v_uv + vec2(0.0, texel.y)).rgb, u_threshold) * 2.0;
  accum += extractBright(texture(u_texture, v_uv + vec2(texel.x, texel.y)).rgb, u_threshold) * 1.0;

  // Wide outer halo ring
  vec2 wideTexel = texel * 2.25;
  accum += extractBright(texture(u_texture, v_uv + vec2(-wideTexel.x, 0.0)).rgb, u_threshold) * 1.5;
  accum += extractBright(texture(u_texture, v_uv + vec2(wideTexel.x, 0.0)).rgb, u_threshold) * 1.5;
  accum += extractBright(texture(u_texture, v_uv + vec2(0.0, -wideTexel.y)).rgb, u_threshold) * 1.5;
  accum += extractBright(texture(u_texture, v_uv + vec2(0.0, wideTexel.y)).rgb, u_threshold) * 1.5;

  vec3 bloom = (accum / 22.0) * u_intensity;
  // Additive screen blend
  vec3 screened = 1.0 - (1.0 - baseSample.rgb) * (1.0 - clamp(bloom, 0.0, 1.0));
  vec3 finalRgb = mix(baseSample.rgb + bloom * 0.65, screened, 0.5);

  fragColor = vec4(finalRgb, baseSample.a);
}
`,
  },

  {
    id: 'anamorphic',
    name: 'Anamorphic Lens Flares',
    fileName: 'anamorphic.frag',
    category: 'Optical',
    description:
      'Isolates high-luma highlights and stretches horizontal cinema anamorphic lens streaks with customizable cyan/blue optical tint.',
    uniforms: [
      { name: 'u_threshold', label: 'Highlight Threshold', type: 'float', defaultValue: [0.68], min: 0.1, max: 0.98, step: 0.01 },
      { name: 'u_streakLength', label: 'Streak Span', type: 'float', defaultValue: [0.18], min: 0.01, max: 0.45, step: 0.01 },
      { name: 'u_flareColor', label: 'Flare Tint', type: 'vec3', defaultValue: [0.1, 0.5, 1.0], isColor: true },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform float u_threshold;    // @min 0.1 @max 0.98 @default 0.68 @label "Highlight Threshold"
uniform float u_streakLength; // @min 0.01 @max 0.45 @default 0.18 @label "Streak Span"
uniform vec3 u_flareColor;    // @type color @default 0.1,0.5,1.0 @label "Flare Tint"

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 base = texture(u_texture, v_uv);
  float span = u_streakLength * (1.0 + u_audioBass * 0.4);
  vec3 streakAccum = vec3(0.0);
  float weightSum = 0.0;

  const int SAMPLES = 24;
  for (int i = -SAMPLES; i <= SAMPLES; i++) {
    float t = float(i) / float(SAMPLES);
    float sampleX = clamp(v_uv.x + t * span, 0.0, 1.0);
    vec3 sampleCol = texture(u_texture, vec2(sampleX, v_uv.y)).rgb;
    float luma = dot(sampleCol, vec3(0.2126, 0.7152, 0.0722));
    float highlight = smoothstep(u_threshold, 1.0, luma);
    float falloff = exp(-abs(t) * 3.5);
    streakAccum += sampleCol * highlight * falloff;
    weightSum += falloff;
  }

  vec3 anamorphicStreak = (streakAccum / max(weightSum, 0.001)) * u_flareColor * 3.8;
  fragColor = vec4(base.rgb + anamorphicStreak, base.a);
}
`,
  },

  {
    id: 'chromatic',
    name: 'Radial Chromatic Aberration',
    fileName: 'chromatic.frag',
    category: 'Optical',
    description:
      'Offsets Red, Green, and Blue UV channels radially from the center proportional to distance squared for authentic vintage lens dispersion.',
    uniforms: [
      { name: 'u_ShiftAmount', label: 'Dispersion Shift', type: 'float', defaultValue: [0.028], min: 0.0, max: 0.12, step: 0.001 },
      { name: 'u_angle', label: 'Dispersion Angle', type: 'float', defaultValue: [0.0], min: 0.0, max: 6.283, step: 0.05 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform float u_ShiftAmount; // @min 0.0 @max 0.12 @default 0.028 @label "Dispersion Shift"
uniform float u_angle;       // @min 0.0 @max 6.283 @default 0.0 @label "Dispersion Angle"

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 centered = v_uv - vec2(0.5);
  float dist = length(centered);
  float radialFactor = pow(dist, 2.0);

  vec2 dir = normalize(centered + vec2(0.0001));
  vec2 rotDir = vec2(
    dir.x * cos(u_angle) - dir.y * sin(u_angle),
    dir.x * sin(u_angle) + dir.y * cos(u_angle)
  );

  float shift = u_ShiftAmount * radialFactor * (1.0 + u_audioBass * 0.6);

  float r = texture(u_texture, clamp(v_uv + rotDir * shift, 0.0, 1.0)).r;
  vec4 gSample = texture(u_texture, v_uv);
  float b = texture(u_texture, clamp(v_uv - rotDir * shift, 0.0, 1.0)).b;

  fragColor = vec4(r, gSample.g, b, gSample.a);
}
`,
  },

  {
    id: 'halation',
    name: 'Cinematic Halation (35mm)',
    fileName: 'halation.frag',
    category: 'Optical',
    description:
      'Simulates 35mm motion picture film anti-halation scatter by bleeding warm red-orange emulsions around high-contrast bright edges.',
    uniforms: [
      { name: 'u_spread', label: 'Scatter Spread', type: 'float', defaultValue: [4.5], min: 0.5, max: 15.0, step: 0.1 },
      { name: 'u_strength', label: 'Halation Strength', type: 'float', defaultValue: [0.85], min: 0.0, max: 2.5, step: 0.05 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform float u_spread;   // @min 0.5 @max 15.0 @default 4.5 @label "Scatter Spread"
uniform float u_strength; // @min 0.0 @max 2.5 @default 0.85 @label "Halation Strength"

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 base = texture(u_texture, v_uv);
  vec2 texel = u_spread / max(u_resolution, vec2(1.0));

  vec3 blurredHighlight = vec3(0.0);
  float totalWeight = 0.0;

  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      vec2 offset = vec2(float(x), float(y)) * texel;
      vec3 c = texture(u_texture, clamp(v_uv + offset, 0.0, 1.0)).rgb;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float brightMask = smoothstep(0.6, 0.98, luma);
      float w = 1.0 / (1.0 + float(x * x + y * y));
      blurredHighlight += c * brightMask * w;
      totalWeight += w;
    }
  }

  blurredHighlight /= max(totalWeight, 0.001);
  vec3 emulsionTint = vec3(1.0, 0.25, 0.05);
  float baseLuma = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
  // Bleed strongest where dark edges meet bright highlights
  float edgeContrast = clamp(1.0 - baseLuma * 0.65, 0.2, 1.0);
  vec3 halationGlow = blurredHighlight * emulsionTint * u_strength * edgeContrast;

  fragColor = vec4(clamp(base.rgb + halationGlow, 0.0, 1.0), base.a);
}
`,
  },

  {
    id: 'bokeh',
    name: 'Bokeh Depth-of-Field Blur',
    fileName: 'bokeh.frag',
    category: 'Optical',
    description:
      'Samples a golden-angle spiral aperture disk kernel to render creamy circular out-of-focus bokeh highlights with focal plane falloff.',
    uniforms: [
      { name: 'u_aperture', label: 'Aperture Size', type: 'float', defaultValue: [0.014], min: 0.0, max: 0.05, step: 0.001 },
      { name: 'u_focalDepth', label: 'Focal Plane Radius', type: 'float', defaultValue: [0.22], min: 0.0, max: 0.8, step: 0.01 },
      { name: 'u_maxBlur', label: 'Bokeh Boost', type: 'float', defaultValue: [1.4], min: 0.2, max: 3.0, step: 0.05 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform float u_aperture;   // @min 0.0 @max 0.05 @default 0.014 @label "Aperture Size"
uniform float u_focalDepth; // @min 0.0 @max 0.8 @default 0.22 @label "Focal Plane Radius"
uniform float u_maxBlur;    // @min 0.2 @max 3.0 @default 1.4 @label "Bokeh Boost"

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 base = texture(u_texture, v_uv);
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 centered = (v_uv - vec2(0.5)) * vec2(aspect, 1.0);
  float distFromFocus = max(0.0, length(centered) - u_focalDepth);
  float coc = clamp(distFromFocus * u_maxBlur, 0.0, 1.0) * u_aperture;

  if (coc < 0.0002) {
    fragColor = base;
    return;
  }

  vec3 accumColor = vec3(0.0);
  float accumWeight = 0.0;
  const int SAMPLES = 28;
  const float GOLDEN_ANGLE = 2.39996323;

  for (int i = 0; i < SAMPLES; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / float(SAMPLES)) * coc;
    float theta = fi * GOLDEN_ANGLE;
    vec2 offset = vec2(cos(theta) / aspect, sin(theta)) * r;
    vec3 samp = texture(u_texture, clamp(v_uv + offset, 0.0, 1.0)).rgb;
    float luma = dot(samp, vec3(0.2126, 0.7152, 0.0722));
    // Highlight bokeh emphasis
    float bokehWeight = 1.0 + pow(max(0.0, luma - 0.55), 2.0) * 8.0;
    accumColor += samp * bokehWeight;
    accumWeight += bokehWeight;
  }

  fragColor = vec4(accumColor / max(accumWeight, 0.001), base.a);
}
`,
  },

  // ============================================================================
  // CATEGORY B: COLOR SCIENCE & FILM EMULATION SHADERS (6 - 9)
  // ============================================================================
  {
    id: 'colorGrade',
    name: '3-Way Lift / Gamma / Gain',
    fileName: 'colorGrade.frag',
    category: 'Color',
    description:
      'Full ASC-CDL 3-way color grading pipeline with Lift, Gamma, Gain vectors plus S-curve contrast and saturation matrices.',
    uniforms: [
      { name: 'u_lift', label: 'Shadows Lift', type: 'vec3', defaultValue: [0.0, 0.0, 0.02], isColor: true },
      { name: 'u_gamma', label: 'Midtones Gamma', type: 'vec3', defaultValue: [1.0, 1.0, 1.0], isColor: true },
      { name: 'u_gain', label: 'Highlights Gain', type: 'vec3', defaultValue: [1.05, 1.02, 0.98], isColor: true },
      { name: 'u_saturation', label: 'Saturation', type: 'float', defaultValue: [1.15], min: 0.0, max: 2.5, step: 0.02 },
      { name: 'u_contrast', label: 'S-Curve Contrast', type: 'float', defaultValue: [1.08], min: 0.5, max: 2.0, step: 0.02 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform vec3 u_lift;        // @type color @default 0.0,0.0,0.02 @label "Shadows Lift"
uniform vec3 u_gamma;       // @type color @default 1.0,1.0,1.0 @label "Midtones Gamma"
uniform vec3 u_gain;        // @type color @default 1.05,1.02,0.98 @label "Highlights Gain"
uniform float u_saturation; // @min 0.0 @max 2.5 @default 1.15 @label "Saturation"
uniform float u_contrast;   // @min 0.5 @max 2.0 @default 1.08 @label "S-Curve Contrast"

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 tex = texture(u_texture, v_uv);
  vec3 color = tex.rgb;

  // ASC-CDL 3-Way Lift / Gamma / Gain formula
  vec3 graded = pow(
    max(vec3(0.0), (color * u_gain) + u_lift * (1.0 - color)),
    1.0 / max(vec3(0.001), u_gamma)
  );

  // S-curve contrast around midpoint 0.5
  graded = clamp((graded - 0.5) * u_contrast + 0.5, 0.0, 1.0);

  // Rec.709 Luma saturation
  float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
  graded = mix(vec3(luma), graded, u_saturation);

  fragColor = vec4(clamp(graded, 0.0, 1.0), tex.a);
}
`,
  },

  {
    id: 'filmGrain',
    name: '35mm Procedural Film Grain',
    fileName: 'filmGrain.frag',
    category: 'Color',
    description:
      'High-frequency temporal hash noise luminance-masked so silver halide grain appears naturally in midtones and shadows without clipping whites.',
    uniforms: [
      { name: 'u_grainAmount', label: 'Grain Density', type: 'float', defaultValue: [0.085], min: 0.0, max: 0.35, step: 0.005 },
      { name: 'u_grainSize', label: 'Halide Size', type: 'float', defaultValue: [1.6], min: 0.5, max: 5.0, step: 0.1 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform float u_grainAmount; // @min 0.0 @max 0.35 @default 0.085 @label "Grain Density"
uniform float u_grainSize;   // @min 0.5 @max 5.0 @default 1.6 @label "Halide Size"

in vec2 v_uv;
out vec4 fragColor;

float hashNoise(vec2 uv, float t) {
  return fract(sin(dot(uv * (t + 1.137), vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 base = texture(u_texture, v_uv);
  vec2 quantizedUv = floor(v_uv * (u_resolution / max(u_grainSize, 0.5))) / (u_resolution / max(u_grainSize, 0.5));
  float n = hashNoise(quantizedUv, floor(u_time * 24.0) * 0.17 + 1.0) * 2.0 - 1.0;

  float luma = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
  // Mask out pure highlights and deep black crush, peak in midtones/shadows
  float lumaMask = smoothstep(0.0, 0.15, luma) * (1.0 - smoothstep(0.65, 0.98, luma));

  vec3 grained = base.rgb + vec3(n) * u_grainAmount * lumaMask;
  fragColor = vec4(clamp(grained, 0.0, 1.0), base.a);
}
`,
  },

  {
    id: 'splitTone',
    name: 'Teal & Orange Split-Tone',
    fileName: 'splitTone.frag',
    category: 'Color',
    description:
      'Blockbuster cinema split-toning that interpolates shadow and highlight tints via Rec.709 luminance while preserving natural skin-tone vectors.',
    uniforms: [
      { name: 'u_shadowColor', label: 'Shadow Tint (Teal)', type: 'vec3', defaultValue: [0.05, 0.38, 0.52], isColor: true },
      { name: 'u_highlightColor', label: 'Highlight Tint (Orange)', type: 'vec3', defaultValue: [1.0, 0.62, 0.28], isColor: true },
      { name: 'u_intensity', label: 'Grade Blend', type: 'float', defaultValue: [0.42], min: 0.0, max: 1.0, step: 0.02 },
      { name: 'u_balance', label: 'Pivot Balance', type: 'float', defaultValue: [0.5], min: 0.15, max: 0.85, step: 0.01 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform vec3 u_shadowColor;    // @type color @default 0.05,0.38,0.52 @label "Shadow Tint (Teal)"
uniform vec3 u_highlightColor; // @type color @default 1.0,0.62,0.28 @label "Highlight Tint (Orange)"
uniform float u_intensity;     // @min 0.0 @max 1.0 @default 0.42 @label "Grade Blend"
uniform float u_balance;       // @min 0.15 @max 0.85 @default 0.5 @label "Pivot Balance"

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 base = texture(u_texture, v_uv);
  float luma = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));

  float splitMask = smoothstep(u_balance - 0.3, u_balance + 0.3, luma);
  vec3 tint = mix(u_shadowColor, u_highlightColor, splitMask);

  // Preserve warm skin-tone vector (around orange-red dominance)
  vec3 normCol = normalize(base.rgb + vec3(0.0001));
  vec3 skinVector = normalize(vec3(0.75, 0.52, 0.38));
  float skinSimilarity = smoothstep(0.92, 0.995, dot(normCol, skinVector));

  vec3 softLight = mix(
    2.0 * base.rgb * tint + base.rgb * base.rgb * (1.0 - 2.0 * tint),
    sqrt(max(base.rgb, vec3(0.0))) * (2.0 * tint - 1.0) + 2.0 * base.rgb * (1.0 - tint),
    step(vec3(0.5), tint)
  );

  float effectiveStrength = u_intensity * (1.0 - skinSimilarity * 0.55);
  fragColor = vec4(mix(base.rgb, softLight, effectiveStrength), base.a);
}
`,
  },

  {
    id: 'chromaKey',
    name: 'Chroma Key Studio Green Screen',
    fileName: 'chromaKey.frag',
    category: 'Color',
    description:
      'Converts RGB to YCbCr color space, calculates chroma Euclidean distance from key color, and applies spill suppression on edge fringes.',
    uniforms: [
      { name: 'u_keyColor', label: 'Key Screen Color', type: 'vec3', defaultValue: [0.05, 0.82, 0.15], isColor: true },
      { name: 'u_similarity', label: 'Chroma Similarity', type: 'float', defaultValue: [0.32], min: 0.01, max: 0.8, step: 0.01 },
      { name: 'u_smoothness', label: 'Edge Smoothness', type: 'float', defaultValue: [0.1], min: 0.005, max: 0.4, step: 0.005 },
      { name: 'u_spillSuppression', label: 'Spill Suppression', type: 'float', defaultValue: [0.65], min: 0.0, max: 1.0, step: 0.02 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform vec3 u_keyColor;          // @type color @default 0.05,0.82,0.15 @label "Key Screen Color"
uniform float u_similarity;       // @min 0.01 @max 0.8 @default 0.32 @label "Chroma Similarity"
uniform float u_smoothness;       // @min 0.005 @max 0.4 @default 0.1 @label "Edge Smoothness"
uniform float u_spillSuppression; // @min 0.0 @max 1.0 @default 0.65 @label "Spill Suppression"

in vec2 v_uv;
out vec4 fragColor;

vec2 rgbToCbCr(vec3 rgb) {
  float cb = -0.168736 * rgb.r - 0.331264 * rgb.g + 0.5 * rgb.b;
  float cr = 0.5 * rgb.r - 0.418688 * rgb.g - 0.081312 * rgb.b;
  return vec2(cb, cr);
}

void main() {
  vec4 tex = texture(u_texture, v_uv);
  vec2 pixCbCr = rgbToCbCr(tex.rgb);
  vec2 keyCbCr = rgbToCbCr(u_keyColor);

  float chromaDist = distance(pixCbCr, keyCbCr);
  float mask = smoothstep(u_similarity, u_similarity + u_smoothness, chromaDist);

  // Desaturate green/key spill on semi-transparent edges
  float luma = dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722));
  float spillFactor = clamp(1.0 - mask, 0.0, 1.0) * u_spillSuppression;
  vec3 despilled = mix(tex.rgb, vec3(luma), spillFactor);

  // Composite keyed regions over a subtle studio dark checkerboard backing
  vec2 checkerUv = floor(v_uv * u_resolution / 16.0);
  float checker = mod(checkerUv.x + checkerUv.y, 2.0);
  vec3 studioBackdrop = mix(vec3(0.06, 0.07, 0.09), vec3(0.11, 0.12, 0.16), checker);

  vec3 finalRgb = mix(studioBackdrop, despilled, mask);
  fragColor = vec4(finalRgb, tex.a);
}
`,
  },

  // ============================================================================
  // CATEGORY C: STYLIZATION, GLITCH & MOTION SHADERS (10 - 15)
  // ============================================================================
  {
    id: 'crtGlitch',
    name: 'CRT Trinitron & VHS Tracking',
    fileName: 'crtGlitch.frag',
    category: 'Glitch',
    description:
      'Combines barrel CRT glass curvature, RGB phosphor aperture grille scanlines, and time-stepped horizontal YIQ VHS tape-tracking displacement.',
    uniforms: [
      { name: 'u_curvature', label: 'Tube Curvature', type: 'float', defaultValue: [0.14], min: 0.0, max: 0.5, step: 0.01 },
      { name: 'u_scanlineCount', label: 'Scanline Density', type: 'float', defaultValue: [320.0], min: 80.0, max: 900.0, step: 10.0 },
      { name: 'u_trackingNoise', label: 'VHS Tape Jitter', type: 'float', defaultValue: [0.35], min: 0.0, max: 1.0, step: 0.02 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform float u_curvature;     // @min 0.0 @max 0.5 @default 0.14 @label "Tube Curvature"
uniform float u_scanlineCount; // @min 80.0 @max 900.0 @default 320.0 @label "Scanline Density"
uniform float u_trackingNoise; // @min 0.0 @max 1.0 @default 0.35 @label "VHS Tape Jitter"

in vec2 v_uv;
out vec4 fragColor;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 curveUV(vec2 uv, float k) {
  vec2 c = uv * 2.0 - 1.0;
  vec2 offset = c.yx * c.yx * k;
  c = c + c * offset;
  return c * 0.5 + 0.5;
}

void main() {
  vec2 uv = curveUV(v_uv, u_curvature);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.02, 0.02, 0.03, 1.0);
    return;
  }

  // Time-stepped VHS tracking bar
  float barPos = fract(u_time * 0.28);
  float barDist = abs(uv.y - barPos);
  float trackingBar = smoothstep(0.09, 0.0, barDist);
  float jitter = (rand(vec2(floor(uv.y * 90.0), floor(u_time * 18.0))) - 0.5) * 0.04 * u_trackingNoise * (1.0 + u_audioBass);
  uv.x = clamp(uv.x + jitter + trackingBar * 0.035 * u_trackingNoise, 0.0, 1.0);

  // Phosphor chromatic sub-pixel offset
  float subOffset = 0.0025 * (1.0 + u_trackingNoise);
  float r = texture(u_texture, vec2(clamp(uv.x + subOffset, 0.0, 1.0), uv.y)).r;
  float g = texture(u_texture, uv).g;
  float b = texture(u_texture, vec2(clamp(uv.x - subOffset, 0.0, 1.0), uv.y)).b;
  vec3 col = vec3(r, g, b);

  // Aperture grille scanlines
  float scan = 0.86 + 0.14 * sin(uv.y * u_scanlineCount * 3.14159);
  float grille = 0.92 + 0.08 * sin(uv.x * u_resolution.x * 1.5);
  col *= scan * grille;

  // Vignette tube bezel shadow
  vec2 vig = uv * (1.0 - uv.yx);
  col *= pow(max(vig.x * vig.y * 16.0, 0.0), 0.18);

  fragColor = vec4(col, 1.0);
}
`,
  },

  {
    id: 'glitchBlock',
    name: 'Digital Datamosh & Block Glitch',
    fileName: 'glitchBlock.frag',
    category: 'Glitch',
    description:
      'Quantizes UV coordinates into macroblocks, shifts corrupted rows horizontally using time-seeded hashes, and swaps RGB channels.',
    uniforms: [
      { name: 'u_blockSize', label: 'Macroblock Grid', type: 'float', defaultValue: [18.0], min: 4.0, max: 64.0, step: 1.0 },
      { name: 'u_glitchRate', label: 'Corruption Intensity', type: 'float', defaultValue: [0.38], min: 0.0, max: 1.0, step: 0.02 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform float u_blockSize;  // @min 4.0 @max 64.0 @default 18.0 @label "Macroblock Grid"
uniform float u_glitchRate; // @min 0.0 @max 1.0 @default 0.38 @label "Corruption Intensity"

in vec2 v_uv;
out vec4 fragColor;

float hash2D(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  float timeStep = floor(u_time * 12.0);
  vec2 blockCoord = floor(v_uv * u_blockSize);
  float rowNoise = hash2D(vec2(blockCoord.y, timeStep));
  float cellNoise = hash2D(blockCoord + vec2(timeStep * 0.37));

  float activeGlitch = clamp(u_glitchRate + u_audioBass * 0.45, 0.0, 1.0);
  float trigger = step(1.0 - activeGlitch * 0.55, rowNoise);

  vec2 displacedUv = v_uv;
  displacedUv.x = fract(displacedUv.x + (cellNoise - 0.5) * 0.22 * trigger);

  vec4 col = texture(u_texture, displacedUv);

  // Corrupted macroblock RGB channel swap & inversion
  if (cellNoise > 1.0 - activeGlitch * 0.25) {
    float r = texture(u_texture, fract(displacedUv + vec2(0.025, 0.0))).r;
    float b = texture(u_texture, fract(displacedUv - vec2(0.025, 0.0))).b;
    col.rgb = vec3(b, col.r, r);
  }

  fragColor = col;
}
`,
  },

  {
    id: 'halftone',
    name: 'Comic Book CMYK Halftone',
    fileName: 'halftone.frag',
    category: 'Stylize',
    description:
      'Rotates UV coordinates to classic CMYK offset printing screen angles (15°, 75°, 0°, 45°) and renders anti-aliased dot matrices.',
    uniforms: [
      { name: 'u_dotScale', label: 'Screen Frequency', type: 'float', defaultValue: [85.0], min: 25.0, max: 220.0, step: 2.0 },
      { name: 'u_mixAmount', label: 'Halftone Blend', type: 'float', defaultValue: [0.85], min: 0.0, max: 1.0, step: 0.02 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform float u_dotScale;  // @min 25.0 @max 220.0 @default 85.0 @label "Screen Frequency"
uniform float u_mixAmount; // @min 0.0 @max 1.0 @default 0.85 @label "Halftone Blend"

in vec2 v_uv;
out vec4 fragColor;

vec2 rotate2D(vec2 p, float deg) {
  float rad = radians(deg);
  float c = cos(rad);
  float s = sin(rad);
  return mat2(c, -s, s, c) * p;
}

float halftoneDot(vec2 uv, float angleDeg, float inkDensity, float freq) {
  vec2 aspectUv = uv * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
  vec2 grid = fract(rotate2D(aspectUv * freq, angleDeg)) - 0.5;
  float dist = length(grid);
  float radius = sqrt(clamp(inkDensity, 0.0, 1.0)) * 0.62;
  return smoothstep(radius + 0.06, radius - 0.06, dist);
}

void main() {
  vec4 base = texture(u_texture, v_uv);
  vec3 cmy = 1.0 - base.rgb;
  float k = min(cmy.x, min(cmy.y, cmy.z));
  cmy = (cmy - k) / max(1.0 - k, 0.0001);

  float cDot = halftoneDot(v_uv, 15.0, cmy.x, u_dotScale);
  float mDot = halftoneDot(v_uv, 75.0, cmy.y, u_dotScale);
  float yDot = halftoneDot(v_uv, 0.0,  cmy.z, u_dotScale);
  float kDot = halftoneDot(v_uv, 45.0, k,     u_dotScale);

  vec3 printedRgb = 1.0 - clamp(vec3(cDot, mDot, yDot) + kDot * 0.88, 0.0, 1.0);
  fragColor = vec4(mix(base.rgb, printedRgb, u_mixAmount), base.a);
}
`,
  },

  {
    id: 'turbulence',
    name: 'Liquid Heat Haze / Turbulent Warp',
    fileName: 'turbulence.frag',
    category: 'Stylize',
    description:
      'Implements 2-octave 2D Simplex Noise (snoise) to organically displace UV coordinates over time with adjustable frequency and heat warp.',
    uniforms: [
      { name: 'u_distortionStrength', label: 'Warp Amplitude', type: 'float', defaultValue: [0.022], min: 0.0, max: 0.12, step: 0.002 },
      { name: 'u_frequency', label: 'Turbulence Scale', type: 'float', defaultValue: [6.0], min: 1.0, max: 24.0, step: 0.5 },
      { name: 'u_speed', label: 'Flow Speed', type: 'float', defaultValue: [1.5], min: 0.0, max: 6.0, step: 0.1 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform float u_distortionStrength; // @min 0.0 @max 0.12 @default 0.022 @label "Warp Amplitude"
uniform float u_frequency;          // @min 1.0 @max 24.0 @default 6.0 @label "Turbulence Scale"
uniform float u_speed;              // @min 0.0 @max 6.0 @default 1.5 @label "Flow Speed"

in vec2 v_uv;
out vec4 fragColor;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  float t = u_time * u_speed;
  vec2 p = v_uv * u_frequency;

  // 2-octave Simplex turbulence
  float nX = snoise(p + vec2(t, 0.0)) + 0.5 * snoise(p * 2.0 - vec2(0.0, t * 1.3));
  float nY = snoise(p + vec2(0.0, t) + vec2(17.3, 9.2)) + 0.5 * snoise(p * 2.0 + vec2(t * 1.1, 4.7));

  float amp = u_distortionStrength * (1.0 + u_audioBass * 0.65);
  vec2 warpedUv = clamp(v_uv + vec2(nX, nY) * amp, 0.0, 1.0);

  fragColor = texture(u_texture, warpedUv);
}
`,
  },

  {
    id: 'kaleidoscope',
    name: 'Kaleidoscope Mirror Matrix',
    fileName: 'kaleidoscope.frag',
    category: 'Stylize',
    description:
      'Converts centered UVs into polar coordinates, folds angular space into N symmetrical mirrored wedges, and rotates dynamically.',
    uniforms: [
      { name: 'u_segments', label: 'Mirror Wedges', type: 'float', defaultValue: [6.0], min: 2.0, max: 24.0, step: 1.0 },
      { name: 'u_rotation', label: 'Angular Spin', type: 'float', defaultValue: [0.35], min: 0.0, max: 6.283, step: 0.05 },
      { name: 'u_zoom', label: 'Radial Scale', type: 'float', defaultValue: [1.0], min: 0.3, max: 2.5, step: 0.05 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform float u_segments; // @min 2.0 @max 24.0 @default 6.0 @label "Mirror Wedges"
uniform float u_rotation; // @min 0.0 @max 6.283 @default 0.35 @label "Angular Spin"
uniform float u_zoom;     // @min 0.3 @max 2.5 @default 1.0 @label "Radial Scale"

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 p = (v_uv - 0.5) / max(u_zoom, 0.1);
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  p.x *= aspect;

  float r = length(p);
  float angle = atan(p.y, p.x) + u_rotation;

  float segs = max(2.0, floor(u_segments));
  float segmentAngle = (2.0 * 3.14159265) / segs;
  angle = abs(mod(angle, segmentAngle) - segmentAngle * 0.5);

  vec2 mirroredUv = vec2(cos(angle), sin(angle)) * r;
  mirroredUv.x /= aspect;
  mirroredUv = fract(mirroredUv + 0.5);

  fragColor = texture(u_texture, mirroredUv);
}
`,
  },

  {
    id: 'zoomBlur',
    name: 'Directional Motion & Zoom Blur',
    fileName: 'zoomBlur.frag',
    category: 'Stylize',
    description:
      'Samples 16 steps along a radial zoom vector from u_center or a directional whip-pan vector with exponential decay weighting.',
    uniforms: [
      { name: 'u_blurStrength', label: 'Blur Velocity', type: 'float', defaultValue: [0.18], min: 0.0, max: 0.65, step: 0.01 },
      { name: 'u_center', label: 'Zoom Origin', type: 'vec2', defaultValue: [0.5, 0.5], min: 0.0, max: 1.0, step: 0.01 },
      { name: 'u_angle', label: 'Whip-Pan Angle', type: 'float', defaultValue: [0.0], min: 0.0, max: 6.283, step: 0.05 },
      { name: 'u_directionalMix', label: 'Radial vs Whip-Pan', type: 'float', defaultValue: [0.0], min: 0.0, max: 1.0, step: 0.05 },
    ],
    fragmentSource: `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audioBass;

uniform float u_blurStrength;   // @min 0.0 @max 0.65 @default 0.18 @label "Blur Velocity"
uniform vec2 u_center;          // @min 0.0 @max 1.0 @default 0.5,0.5 @label "Zoom Origin"
uniform float u_angle;          // @min 0.0 @max 6.283 @default 0.0 @label "Whip-Pan Angle"
uniform float u_directionalMix; // @min 0.0 @max 1.0 @default 0.0 @label "Radial vs Whip-Pan"

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 radialVec = u_center - v_uv;
  vec2 dirVec = vec2(cos(u_angle), sin(u_angle)) * 0.35;
  vec2 blurVector = mix(radialVec, dirVec, u_directionalMix) * u_blurStrength * (1.0 + u_audioBass * 0.5);

  vec4 accum = vec4(0.0);
  float totalWeight = 0.0;

  const int STEPS = 16;
  for (int i = 0; i < STEPS; i++) {
    float percent = float(i) / float(STEPS - 1);
    float weight = exp(-percent * 2.4);
    vec2 sampleUv = clamp(v_uv + blurVector * percent, 0.0, 1.0);
    accum += texture(u_texture, sampleUv) * weight;
    totalWeight += weight;
  }

  fragColor = accum / max(totalWeight, 0.0001);
}
`,
  },
];

export const DEFAULT_CUSTOM_SHADER_TEMPLATE = `#version 300 es
precision highp float;

// === LOCKED AETHERSTUDIO ENGINE UNIFORMS ===
uniform sampler2D u_texture; // Current composite video + 3D frame
uniform vec2 u_resolution;   // Viewport pixel dimensions (width, height)
uniform float u_time;        // Playhead time in seconds
uniform float u_audioBass;   // 0.0 to 1.0 real-time Web Audio FFT bass energy

// === USER / AI CUSTOM UNIFORMS (Auto-reflected to Inspector UI) ===
uniform float u_warpSpeed;   // @min 0.0 @max 10.0 @default 2.4 @label "Ripple Speed"
uniform float u_prismShift;  // @min 0.0 @max 0.08 @default 0.018 @label "Prism Refraction"
uniform vec3 u_neonTint;     // @type color @default 0.15,0.85,1.0 @label "Cyber Tint"
uniform vec2 u_focusCenter;  // @min 0.0 @max 1.0 @default 0.5,0.5 @label "Refraction Origin"

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 delta = v_uv - u_focusCenter;
  float dist = length(delta);

  float wave = sin(dist * 28.0 - u_time * u_warpSpeed) * 0.008 * (1.0 + u_audioBass * 1.5);
  vec2 dir = normalize(delta + vec2(0.0001));
  vec2 uvR = clamp(v_uv + dir * (wave + u_prismShift * dist), 0.0, 1.0);
  vec2 uvG = clamp(v_uv + dir * wave, 0.0, 1.0);
  vec2 uvB = clamp(v_uv + dir * (wave - u_prismShift * dist), 0.0, 1.0);

  vec3 col = vec3(
    texture(u_texture, uvR).r,
    texture(u_texture, uvG).g,
    texture(u_texture, uvB).b
  );

  // Subtle audio-reactive rim glow
  float ring = smoothstep(0.45, 0.0, abs(dist - fract(u_time * 0.25) * 0.7));
  col += u_neonTint * ring * (0.15 + u_audioBass * 0.35);

  fragColor = vec4(col, 1.0);
}
`;
