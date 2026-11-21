import * as THREE from 'three';

export function detectSoftwareGl(): boolean {
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) || '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export function createCrackTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = '#0c0f14';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(32, 32);
  ctx.lineTo(14, 18);
  ctx.lineTo(6, 26);
  ctx.moveTo(32, 32);
  ctx.lineTo(50, 14);
  ctx.lineTo(58, 22);
  ctx.moveTo(32, 32);
  ctx.lineTo(44, 52);
  ctx.lineTo(54, 58);
  ctx.moveTo(32, 32);
  ctx.lineTo(16, 48);
  ctx.lineTo(8, 44);
  ctx.moveTo(22, 24);
  ctx.lineTo(28, 8);
  ctx.moveTo(38, 40);
  ctx.lineTo(26, 56);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
