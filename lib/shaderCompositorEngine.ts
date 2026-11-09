import {
  DEFAULT_VERTEX_SHADER,
  PASSTHROUGH_FRAGMENT_SHADER,
  PRODUCTION_SHADERS,
  ShaderDiagnosticError,
} from './shaders';

export interface ActiveShaderPass {
  instanceId: string;
  shaderId: string;
  name: string;
  enabled: boolean;
  fragmentSource: string;
  uniformValues: Record<string, number[]>;
  audioLinkedUniforms: Record<string, boolean>;
}

interface CompiledProgramEntry {
  program: WebGLProgram;
  uniformLocations: Map<string, WebGLUniformLocation | null>;
  sourceHash: string;
}

/**
 * Multi-Pass Ping-Pong Framebuffer (FBO A & FBO B) WebGL2 Shader Compositor Engine
 * Supports all 15 built-in GLSL shaders, custom live-edited shaders with diagnostic line parsing,
 * and multi-input textures for DAG node compositing.
 */
export class ShaderCompositorEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;

  private fboA: WebGLFramebuffer | null = null;
  private texA: WebGLTexture | null = null;
  private fboB: WebGLFramebuffer | null = null;
  private texB: WebGLTexture | null = null;
  private sourceTex: WebGLTexture | null = null;
  private secondaryTex: WebGLTexture | null = null;
  private maskTex: WebGLTexture | null = null;

  private width = 0;
  private height = 0;

  private programs = new Map<string, CompiledProgramEntry>();
  private passthroughProgram: CompiledProgramEntry | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initContext();
  }

  private initContext() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) return;
    this.gl = gl;

    // Create fullscreen quad VAO
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vertices = new Float32Array([
      // posX, posY, uvX, uvY
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
      -1,  1, 0, 1,
       1, -1, 1, 0,
       1,  1, 1, 1,
    ]);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
    this.quadVao = vao;

    // Compile passthrough shader
    const passRes = this.compileProgramInternal(PASSTHROUGH_FRAGMENT_SHADER);
    if (passRes.entry) {
      this.passthroughProgram = passRes.entry;
    }

    // Precompile built-in 15 shaders
    for (const def of PRODUCTION_SHADERS) {
      const compiled = this.compileProgramInternal(def.fragmentSource);
      if (compiled.entry) {
        this.programs.set(def.id, compiled.entry);
      }
    }

    this.sourceTex = this.createEmptyTexture(1, 1);
    this.secondaryTex = this.createEmptyTexture(1, 1);
    this.maskTex = this.createEmptyTexture(1, 1);
    this.resize(this.canvas.width || 1280, this.canvas.height || 720);
  }

  private createEmptyTexture(w: number, h: number): WebGLTexture | null {
    const gl = this.gl;
    if (!gl) return null;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    return tex;
  }

  public resize(width: number, height: number) {
    const gl = this.gl;
    if (!gl) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.width === w && this.height === h && this.fboA && this.fboB) return;

    this.width = w;
    this.height = h;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;

    if (this.fboA) gl.deleteFramebuffer(this.fboA);
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.fboB) gl.deleteFramebuffer(this.fboB);
    if (this.texB) gl.deleteTexture(this.texB);

    this.texA = this.createEmptyTexture(w, h);
    this.fboA = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texA,
      0
    );

    this.texB = this.createEmptyTexture(w, h);
    this.fboB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texB,
      0
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  public static parseGlslErrorLog(log: string): ShaderDiagnosticError[] {
    const errors: ShaderDiagnosticError[] = [];
    const lines = log.split('\n');
    const regex = /ERROR:\s*\d+:(\d+):\s*(.+)/i;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(regex);
      if (match) {
        errors.push({
          line: parseInt(match[1], 10),
          message: match[2].trim(),
          raw: trimmed,
        });
      } else if (trimmed.toLowerCase().includes('error')) {
        errors.push({
          line: 1,
          message: trimmed,
          raw: trimmed,
        });
      }
    }
    return errors;
  }

  private compileProgramInternal(fragmentSource: string): {
    entry: CompiledProgramEntry | null;
    errors: ShaderDiagnosticError[];
  } {
    const gl = this.gl;
    if (!gl) {
      return {
        entry: null,
        errors: [{ line: 1, message: 'WebGL2 context unavailable', raw: 'WebGL2 context unavailable' }],
      };
    }

    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vs || !fs) {
      return { entry: null, errors: [{ line: 1, message: 'Failed to allocate shader objects', raw: '' }] };
    }

    gl.shaderSource(vs, DEFAULT_VERTEX_SHADER);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      const vsLog = gl.getShaderInfoLog(vs) || 'Vertex shader error';
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return { entry: null, errors: ShaderCompositorEngine.parseGlslErrorLog(vsLog) };
    }

    gl.shaderSource(fs, fragmentSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const fsLog = gl.getShaderInfoLog(fs) || 'Fragment shader compilation failed';
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return { entry: null, errors: ShaderCompositorEngine.parseGlslErrorLog(fsLog) };
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return { entry: null, errors: [{ line: 1, message: 'Failed to create program', raw: '' }] };
    }

    gl.bindAttribLocation(program, 0, 'a_position');
    gl.bindAttribLocation(program, 1, 'a_uv');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const linkLog = gl.getProgramInfoLog(program) || 'Program link error';
      gl.deleteProgram(program);
      return { entry: null, errors: ShaderCompositorEngine.parseGlslErrorLog(linkLog) };
    }

    return {
      entry: {
        program,
        uniformLocations: new Map(),
        sourceHash: fragmentSource,
      },
      errors: [],
    };
  }

  /**
   * Compiles and hot-reloads a custom or modified shader.
   * If compilation fails, preserves the previous working shader program in the map
   * so the viewport never flickers or crashes black.
   */
  public compileAndRegisterShader(
    shaderId: string,
    fragmentSource: string
  ): { ok: boolean; errors: ShaderDiagnosticError[] } {
    const existing = this.programs.get(shaderId);
    if (existing && existing.sourceHash === fragmentSource) {
      return { ok: true, errors: [] };
    }

    const { entry, errors } = this.compileProgramInternal(fragmentSource);
    if (!entry) {
      return { ok: false, errors };
    }

    if (existing && this.gl) {
      this.gl.deleteProgram(existing.program);
    }
    this.programs.set(shaderId, entry);
    return { ok: true, errors: [] };
  }

  private getUniformLocation(
    entry: CompiledProgramEntry,
    name: string
  ): WebGLUniformLocation | null {
    if (entry.uniformLocations.has(name)) {
      return entry.uniformLocations.get(name) ?? null;
    }
    if (!this.gl) return null;
    const loc = this.gl.getUniformLocation(entry.program, name);
    entry.uniformLocations.set(name, loc);
    return loc;
  }

  /**
   * Renders the source 2D/3D composite canvas through the active multi-pass ping-pong FBO stack.
   */
  public renderCompositeStack(
    sourceCanvas: HTMLCanvasElement,
    passes: ActiveShaderPass[],
    timeSeconds: number,
    audioBass: number,
    secondaryCanvas?: HTMLCanvasElement | null,
    maskCanvas?: HTMLCanvasElement | null
  ) {
    const gl = this.gl;
    if (!gl || !this.quadVao || !this.sourceTex || !this.fboA || !this.fboB || !this.texA || !this.texB) {
      return;
    }

    this.resize(sourceCanvas.width || 1280, sourceCanvas.height || 720);

    // Upload primary source frame (flip Y so HTML5 Canvas top-left aligns with WebGL bottom-left UV)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      sourceCanvas
    );

    if (secondaryCanvas && this.secondaryTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.secondaryTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        secondaryCanvas
      );
    }

    if (maskCanvas && this.maskTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        maskCanvas
      );
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    const enabledPasses = passes.filter((p) => p.enabled);

    gl.bindVertexArray(this.quadVao);
    gl.viewport(0, 0, this.width, this.height);

    if (enabledPasses.length === 0) {
      // Direct passthrough to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (this.passthroughProgram) {
        gl.useProgram(this.passthroughProgram.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
        const texLoc = this.getUniformLocation(this.passthroughProgram, 'u_texture');
        if (texLoc) gl.uniform1i(texLoc, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.bindVertexArray(null);
      return;
    }

    let currentInputTex: WebGLTexture = this.sourceTex;

    for (let i = 0; i < enabledPasses.length; i++) {
      const pass = enabledPasses[i];
      const isLastPass = i === enabledPasses.length - 1;

      // Ensure shader is compiled
      if (!this.programs.has(pass.shaderId) && pass.fragmentSource) {
        this.compileAndRegisterShader(pass.shaderId, pass.fragmentSource);
      }

      const programEntry =
        this.programs.get(pass.shaderId) || this.passthroughProgram;
      if (!programEntry) continue;

      const targetFbo = isLastPass
        ? null
        : i % 2 === 0
        ? this.fboA
        : this.fboB;
      const targetOutputTex = i % 2 === 0 ? this.texA : this.texB;

      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
      gl.useProgram(programEntry.program);

      // Bind TEXTURE0 (Primary Input)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentInputTex);
      const uTexLoc = this.getUniformLocation(programEntry, 'u_texture');
      if (uTexLoc) gl.uniform1i(uTexLoc, 0);

      // Bind TEXTURE1 (Foreground / Secondary Input for Merge/Blend)
      if (this.secondaryTex) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.secondaryTex);
        const uFgLoc = this.getUniformLocation(programEntry, 'u_fgTexture');
        if (uFgLoc) gl.uniform1i(uFgLoc, 1);
      }

      // Bind TEXTURE2 (Mask Input)
      if (this.maskTex) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
        const uMaskLoc = this.getUniformLocation(programEntry, 'u_maskTexture');
        if (uMaskLoc) gl.uniform1i(uMaskLoc, 2);
      }

      // Standard Engine Uniforms
      const uResLoc = this.getUniformLocation(programEntry, 'u_resolution');
      if (uResLoc) gl.uniform2f(uResLoc, this.width, this.height);

      const uTimeLoc = this.getUniformLocation(programEntry, 'u_time');
      if (uTimeLoc) gl.uniform1f(uTimeLoc, timeSeconds);

      const uBassLoc = this.getUniformLocation(programEntry, 'u_audioBass');
      if (uBassLoc) gl.uniform1f(uBassLoc, audioBass);

      // Custom Effect Uniforms
      for (const [uName, rawVals] of Object.entries(pass.uniformValues)) {
        const loc = this.getUniformLocation(programEntry, uName);
        if (!loc || !rawVals || rawVals.length === 0) continue;

        const isAudioLinked = Boolean(pass.audioLinkedUniforms?.[uName]);
        const audioScale = isAudioLinked ? 1.0 + audioBass * 1.35 : 1.0;

        if (rawVals.length === 1) {
          gl.uniform1f(loc, rawVals[0] * audioScale);
        } else if (rawVals.length === 2) {
          gl.uniform2f(
            loc,
            rawVals[0] * (isAudioLinked ? audioScale : 1.0),
            rawVals[1] * (isAudioLinked ? audioScale : 1.0)
          );
        } else if (rawVals.length >= 3) {
          gl.uniform3f(
            loc,
            Math.min(1.0, rawVals[0] * audioScale),
            Math.min(1.0, rawVals[1] * audioScale),
            Math.min(1.0, rawVals[2] * audioScale)
          );
        }
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      currentInputTex = targetOutputTex;
    }

    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  public dispose() {
    const gl = this.gl;
    if (!gl) return;
    if (this.fboA) gl.deleteFramebuffer(this.fboA);
    if (this.fboB) gl.deleteFramebuffer(this.fboB);
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.texB) gl.deleteTexture(this.texB);
    if (this.sourceTex) gl.deleteTexture(this.sourceTex);
    if (this.secondaryTex) gl.deleteTexture(this.secondaryTex);
    if (this.maskTex) gl.deleteTexture(this.maskTex);
    for (const entry of this.programs.values()) {
      gl.deleteProgram(entry.program);
    }
    this.programs.clear();
  }
}
