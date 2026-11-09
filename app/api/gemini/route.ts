import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, prompt, currentCode, duration = 16 } = body;

    const ai = getGenAIClient();

    if (mode === 'shader') {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `You are a Principal Graphics & WebGL2 Shader Engineer for AetherStudio Pro.
User Request: "${prompt}"
${currentCode ? `Current Shader Code for context:\n${currentCode}` : ''}

Write a complete, mathematically accurate WebGL2 (#version 300 es) GLSL fragment shader.
CRITICAL REQUIREMENTS:
1. Must begin with "#version 300 es" and "precision highp float;".
2. Must declare standard engine uniforms:
   uniform sampler2D u_texture;
   uniform vec2 u_resolution;
   uniform float u_time;
   uniform float u_audioBass;
   in vec2 v_uv;
   out vec4 fragColor;
3. For every custom uniform you add, include inline comment annotations on the exact same line so the UI auto-reflects controls:
   e.g. uniform float u_intensity; // @min 0.0 @max 5.0 @default 1.5 @label "Effect Intensity"
   e.g. uniform vec3 u_tintColor; // @type color @default 0.1,0.8,1.0 @label "Tint Color"
4. Sample the input frame via texture(u_texture, v_uv) and output to fragColor.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              shaderName: {
                type: Type.STRING,
                description: 'Concise studio name for the generated shader.',
              },
              category: {
                type: Type.STRING,
                description: 'One of: Optical, Color, Stylize, Glitch, Procedural',
              },
              description: {
                type: Type.STRING,
                description: '1-sentence technical description of the shader algorithm.',
              },
              fragmentSource: {
                type: Type.STRING,
                description: 'Complete valid #version 300 es GLSL fragment shader source string.',
              },
              uniforms: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    type: { type: Type.STRING, description: 'float, vec2, or vec3' },
                    defaultValue: {
                      type: Type.ARRAY,
                      items: { type: Type.NUMBER },
                    },
                    min: { type: Type.NUMBER },
                    max: { type: Type.NUMBER },
                    label: { type: Type.STRING },
                  },
                  required: ['name', 'type', 'defaultValue', 'min', 'max', 'label'],
                },
              },
            },
            required: ['shaderName', 'category', 'description', 'fragmentSource', 'uniforms'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return NextResponse.json({ ok: true, data: parsed });
    }

    if (mode === 'captions') {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Generate a dynamic word-level kinetic caption timeline transcript (${duration} seconds total) for this studio voiceover / dialogue prompt: "${prompt || 'Welcome to AetherStudio Pro, featuring real-time WebGL2 shaders, Three.js 3D modeling, and AI motion tracking.'}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              segments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    phrase: { type: Type.STRING },
                    startTime: { type: Type.NUMBER },
                    endTime: { type: Type.NUMBER },
                    sentiment: {
                      type: Type.STRING,
                      description: 'high-energy, dramatic, neutral, or question',
                    },
                    words: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          word: { type: Type.STRING },
                          start: { type: Type.NUMBER },
                          end: { type: Type.NUMBER },
                          isKeyword: { type: Type.BOOLEAN },
                        },
                        required: ['word', 'start', 'end', 'isKeyword'],
                      },
                    },
                  },
                  required: ['phrase', 'startTime', 'endTime', 'sentiment', 'words'],
                },
              },
            },
            required: ['segments'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return NextResponse.json({ ok: true, data: parsed });
    }

    if (mode === 'text-to-3d') {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Generate a procedural 3D PBR model specification for Three.js based on this prompt: "${prompt}".
Choose the closest base assembly primitive from: "chrono-drone", "cinema-camera-rig", "orbital-monolith", "torus", "procedural-lathe", "sphere", "cube", "cylinder".`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              primitive: { type: Type.STRING },
              color: { type: Type.STRING, description: 'Hex color e.g. #38bdf8' },
              emissive: { type: Type.STRING, description: 'Hex color e.g. #06b6d4' },
              emissiveIntensity: { type: Type.NUMBER },
              roughness: { type: Type.NUMBER },
              metalness: { type: Type.NUMBER },
              transmission: { type: Type.NUMBER },
              twist: { type: Type.NUMBER },
              wave: { type: Type.NUMBER },
              scale: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
              },
            },
            required: [
              'name',
              'primitive',
              'color',
              'emissive',
              'emissiveIntensity',
              'roughness',
              'metalness',
              'transmission',
              'twist',
              'wave',
              'scale',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return NextResponse.json({ ok: true, data: parsed });
    }

    return NextResponse.json({ ok: false, error: 'Unsupported AI mode' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gemini API request failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
