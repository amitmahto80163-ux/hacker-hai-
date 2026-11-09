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
    const { mode, prompt, currentCode, duration = 16, targetLanguage = 'Spanish' } = body;

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
              shaderName: { type: Type.STRING },
              category: {
                type: Type.STRING,
                description: 'One of: Optical, Color, Stylize, Glitch, Procedural',
              },
              description: { type: Type.STRING },
              fragmentSource: { type: Type.STRING },
              uniforms: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    type: { type: Type.STRING },
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
              color: { type: Type.STRING },
              emissive: { type: Type.STRING },
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

    if (mode === 'storyboard') {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Parse or write a 4-scene cinematic storyboard and shot breakdown for: "${prompt || 'A cyberpunk drone activates in an orbital hangar and launches into a neon storm.'}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              genre: { type: Type.STRING },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sceneNumber: { type: Type.INTEGER },
                    heading: { type: Type.STRING },
                    dialogue: { type: Type.STRING },
                    visualPrompt: { type: Type.STRING },
                    cameraMotion: { type: Type.STRING },
                    suggestedDurationSeconds: { type: Type.NUMBER },
                  },
                  required: [
                    'sceneNumber',
                    'heading',
                    'dialogue',
                    'visualPrompt',
                    'cameraMotion',
                    'suggestedDurationSeconds',
                  ],
                },
              },
            },
            required: ['title', 'genre', 'scenes'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return NextResponse.json({ ok: true, data: parsed });
    }

    if (mode === 'trailer') {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Analyze the timeline sequence (${duration}s) and generate 4 high-impact trailer highlight cuts for: "${prompt || 'High-intensity sci-fi teaser with explosive sound design'}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              highlights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    startTime: { type: Type.NUMBER },
                    endTime: { type: Type.NUMBER },
                    excitementScore: { type: Type.NUMBER },
                    category: {
                      type: Type.STRING,
                      description: 'action, emotional, climax, or dialogue_hook',
                    },
                    description: { type: Type.STRING },
                  },
                  required: ['startTime', 'endTime', 'excitementScore', 'category', 'description'],
                },
              },
            },
            required: ['highlights'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return NextResponse.json({ ok: true, data: parsed });
    }

    if (mode === 'dubbing') {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Translate this studio voiceover dialogue into ${targetLanguage} with natural lip-sync timing and viseme cues: "${prompt || 'We are moments away from ignition. Lock all orbital telemetry sensors now.'}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              targetLanguage: { type: Type.STRING },
              translatedDialogue: { type: Type.STRING },
              speakerTone: { type: Type.STRING },
              timeStretchFactor: { type: Type.NUMBER },
              visemes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.NUMBER },
                    viseme: {
                      type: Type.STRING,
                      description: 'Bilabial, Labiodental, Dental, Open, or Rounded',
                    },
                    weight: { type: Type.NUMBER },
                  },
                  required: ['time', 'viseme', 'weight'],
                },
              },
            },
            required: ['targetLanguage', 'translatedDialogue', 'speakerTone', 'timeStretchFactor', 'visemes'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return NextResponse.json({ ok: true, data: parsed });
    }

    if (mode === 'thumbnail') {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Generate 3 high-CTR YouTube / cinema thumbnail headline hooks (2 to 4 punchy words each) for: "${prompt || 'Real-Time 3D & WebGL2 VFX Studio'}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hooks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    headline: { type: Type.STRING },
                    subtext: { type: Type.STRING },
                    accentHex: { type: Type.STRING },
                    predictedCtrScore: { type: Type.NUMBER },
                  },
                  required: ['headline', 'subtext', 'accentHex', 'predictedCtrScore'],
                },
              },
            },
            required: ['hooks'],
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
