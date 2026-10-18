import { useEffect, useRef } from 'react'
import { fluidState, setFluid } from '../visual/state'
import './FluidCanvas.css'

const VERT = `#version 300 es
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uPointer;
uniform float uMode;     // 0 idle 1 allow 2 review 3 deny
uniform float uRisk;     // 0..1
uniform float uField;    // 0..1
uniform float uCollapse; // 0..1 impulse
uniform float uSurface;  // 0 hero 1 gate

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

vec3 modeColor(float m) {
  if (m < 0.5) return vec3(0.42, 0.33, 0.92); // idle violet
  if (m < 1.5) return vec3(0.21, 0.88, 0.63); // allow mint
  if (m < 2.5) return vec3(0.96, 0.65, 0.14); // review amber
  return vec3(1.0, 0.23, 0.32);              // deny red
}

float spikeField(vec2 p, float t, float drive) {
  vec2 g = p * 2.6;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float best = 1e9;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 c = o + (vec2(hash21(id + o + 13.0), hash21(id + o + 7.0)) - 0.5) * 0.7;
      best = min(best, length(f - c));
    }
  }
  float spike = smoothstep(0.44, 0.05, best);
  spike *= 0.55 + 0.45 * sin(t * 2.3 + best * 7.0);
  return spike * drive;
}

float heightAt(vec2 p, float t, vec2 mp) {
  float dome = 0.34 * exp(-dot(p * 0.85, p * 0.85));
  float pool = 0.05;
  float drive = clamp(uRisk, 0.0, 1.0) * clamp(uField, 0.05, 1.0);
  float m = smoothstep(1.1, 0.0, length(p - mp));
  float spikes = spikeField(p, t, drive) * (0.2 + 0.8 * m) * 0.42;
  float ripple = 0.015 * sin(length(p) * 10.0 - t * 3.0) * exp(-length(p) * 1.4);
  return dome + pool + spikes + ripple;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 mp = vec2(uPointer.x * 1.1, -uPointer.y * 0.55);

  vec3 ro = uSurface < 0.5 ? vec3(0.0, 0.78, 1.95) : vec3(0.0, 1.05, 1.82);
  vec3 ta = uSurface < 0.5 ? vec3(0.0, 0.12, 0.0) : vec3(0.0, 0.05, 0.0);
  vec3 fwd = normalize(ta - ro);
  vec3 rgt = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 upv = cross(fwd, rgt);
  vec3 rd = normalize(uv.x * rgt + uv.y * upv + fwd * 1.5);

  float t = 0.0;
  bool hit = false;
  vec3 pos = ro;
  for (int i = 0; i < 64; i++) {
    pos = ro + rd * t;
    float h = heightAt(pos.xz, uTime, mp);
    float diff = pos.y - h;
    if (diff < 0.001) { hit = true; break; }
    t += max(diff * 0.55, 0.012);
    if (t > 5.0) break;
  }

  vec3 mc = modeColor(uMode);
  vec3 col;

  if (!hit) {
    float g = exp(-length(uv - vec2(0.0, -0.15)) * 2.2);
    col = vec3(0.006, 0.005, 0.012) + mc * 0.05 * g;
    col += vec3(0.02, 0.015, 0.05) * smoothstep(0.0, -0.4, uv.y);
  } else {
    float e = 0.02;
    float hx = heightAt(pos.xz + vec2(e, 0.0), uTime, mp) - heightAt(pos.xz - vec2(e, 0.0), uTime, mp);
    float hz = heightAt(pos.xz + vec2(0.0, e), uTime, mp) - heightAt(pos.xz - vec2(0.0, e), uTime, mp);
    vec3 n = normalize(vec3(-hx, 2.0 * e, -hz));
    vec3 V = -rd;
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    vec3 R = reflect(rd, n);
    float env = smoothstep(-0.3, 0.95, R.y);

    col = vec3(0.015, 0.012, 0.03);
    col += vec3(0.85, 0.90, 1.0) * pow(env, 1.5) * 0.28 * (0.4 + fres);
    col += mc * fres * 1.15;

    vec3 L = normalize(vec3(-0.35, 0.75, 0.5));
    vec3 Hh = normalize(L + V);
    col += vec3(1.0) * pow(max(dot(n, Hh), 0.0), 80.0) * 0.9;
    col += mc * 0.35 * pow(1.0 - max(n.y, 0.0), 2.0);
  }

  col += vec3(1.0, 0.25, 0.35) * uCollapse * (0.5 + 0.5 * sin(uTime * 20.0));
  col += mc * 0.08 * exp(-length(uv - uPointer * vec2(0.5, -0.4)) * 2.5) * uRisk;

  col = col / (col + vec3(1.0));
  col = pow(max(col, 0.0), vec3(0.4545));
  outColor = vec4(col, 1.0);
}`

function initGL(gl: WebGL2RenderingContext): WebGLProgram | null {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)
    if (!s) return null
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[fluid] shader:', gl.getShaderInfoLog(s))
      gl.deleteShader(s)
      return null
    }
    return s
  }
  const vs = compile(gl.VERTEX_SHADER, VERT)
  const fs = compile(gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return null
  const p = gl.createProgram()
  if (!p) return null
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('[fluid] link:', gl.getProgramInfoLog(p))
    gl.deleteProgram(p)
    return null
  }
  return p
}

/**
 * The ferrofluid pool. The layered CSS fallback is always in the DOM and is the
 * guaranteed on-stage look; the WebGL2 canvas is progressive enhancement layered
 * on top and only revealed once a context + shaders compile cleanly.
 */
export function FluidCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
    })
    if (!gl) {
      setFluid({ webgl: false })
      return
    }

    const program = initGL(gl)
    if (!program) {
      setFluid({ webgl: false })
      return
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.useProgram(program)
    const aPos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const u = {
      res: gl.getUniformLocation(program, 'uRes'),
      time: gl.getUniformLocation(program, 'uTime'),
      pointer: gl.getUniformLocation(program, 'uPointer'),
      mode: gl.getUniformLocation(program, 'uMode'),
      risk: gl.getUniformLocation(program, 'uRisk'),
      field: gl.getUniformLocation(program, 'uField'),
      collapse: gl.getUniformLocation(program, 'uCollapse'),
      surface: gl.getUniformLocation(program, 'uSurface'),
    }

    let scale = 0.62
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

    const resize = () => {
      const w = Math.max(2, Math.floor(window.innerWidth * dpr * scale))
      const h = Math.max(2, Math.floor(window.innerHeight * dpr * scale))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    let sMode = 0
    let sRisk = 0
    let sField = 1
    let sCollapse = 0
    let lastMode = fluidState.mode

    const draw = (now: number) => {
      const s = fluidState
      const target = s.mode === 'idle' ? 0 : s.mode === 'allow' ? 1 : s.mode === 'review' ? 2 : 3
      sMode += (target - sMode) * 0.06
      sRisk += (s.risk - sRisk) * 0.04
      sField += (s.field - sField) * 0.06
      if (s.mode === 'deny' && lastMode !== 'deny') sCollapse = 1
      lastMode = s.mode
      sCollapse *= 0.94

      gl.uniform1f(u.time, now / 1000)
      gl.uniform2f(u.res, canvas.width, canvas.height)
      gl.uniform2f(u.pointer, s.pointerX, s.pointerY)
      gl.uniform1f(u.mode, sMode)
      gl.uniform1f(u.risk, sRisk)
      gl.uniform1f(u.field, sField)
      gl.uniform1f(u.collapse, sCollapse)
      gl.uniform1f(u.surface, s.surface === 'gate' ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    resize()
    wrap.classList.add('fluid--live')
    setFluid({ webgl: true })

    let raf = 0
    let last = performance.now()
    let acc = 0
    let frames = 0

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      resize()
      draw(now)

      acc += dt
      frames++
      if (frames > 60) {
        const avg = acc / frames
        if (avg > 0.024 && scale > 0.5) scale -= 0.06
        else if (avg < 0.014 && scale < 0.75) scale += 0.02
        acc = 0
        frames = 0
      }
      raf = requestAnimationFrame(frame)
    }

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!raf && !reduce) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }

    if (reduce) {
      draw(performance.now())
    } else {
      raf = requestAnimationFrame(frame)
      document.addEventListener('visibilitychange', onVisibility)
    }

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      wrap.classList.remove('fluid--live')
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      setFluid({ webgl: false })
    }
  }, [])

  return (
    <div className="fluid" ref={wrapRef} aria-hidden>
      <div className="fluid__fallback" />
      <canvas ref={canvasRef} className="fluid__canvas" />
    </div>
  )
}
