import * as THREE from 'three';
import type { GameClient } from '../GameClient';
import { deleteOpfsPanorama, loadOpfsPanorama, saveOpfsPanorama } from '../../game/opfsStorage';
import { ATLAS_COLS, TILE_PIXELS } from '../../game/textures';
import { CHUNK_SIZE } from '../../shared/world';
import { _skyDay, _skySunset, _skyDawn, _skyNight, _curSky, _sunColorDay, _sunColorWarm, _sunColorNight, _curSunColor, _hemiSkyDay, _hemiSkyNight, _curHemiSky, _hemiGroundDay, _hemiGroundNight, _curHemiGround, _cloudDay, _cloudWarm, _cloudNight, _curCloud, _underwaterSky } from '../../game/engine/constants';

export class RenderSystem {
  constructor(private readonly e: GameClient) {}

  applyPanoramaTextures(textures: THREE.Texture[], objectUrls: string[] = []) {
    for (const prev of this.e.panoramaTextures) prev.dispose();
    for (const prevUrl of this.e.panoramaObjectUrls) URL.revokeObjectURL(prevUrl);
    this.e.panoramaTextures = textures;
    this.e.panoramaObjectUrls = objectUrls;

    for (let i = 0; i < this.e.panoramaMaterials.length; i++) {
      const tex = textures[i] ?? null;
      if (tex) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
      }
      this.e.panoramaMaterials[i].map = tex;
      this.e.panoramaMaterials[i].needsUpdate = true;
    }

    this.e.hasPanorama = textures.length === 6;
    this.e.callbacks.onPanoramaChange?.(this.e.hasPanorama);
  }

  async loadSavedPanoramaFromOpfs(): Promise<void> {
    const urls = await loadOpfsPanorama();
    if (!urls || this.e.disposed) {
      if (urls) {
        urls.forEach((u) => {
          if (u.startsWith('blob:')) URL.revokeObjectURL(u);
        });
      }
      this.e.callbacks.onPanoramaChange?.(false);
      return;
    }

    const loadImg = (url: string): Promise<HTMLImageElement | null> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });

    const imgs = await Promise.all(urls.map((u) => loadImg(u)));
    const blobUrls = urls.filter((u) => u.startsWith('blob:'));
    if (this.e.disposed || imgs.some((img) => !img)) {
      blobUrls.forEach((u) => URL.revokeObjectURL(u));
      if (!this.e.disposed) this.e.callbacks.onPanoramaChange?.(false);
      return;
    }

    const textures = imgs.map((img) => new THREE.Texture(img!));
    this.e.applyPanoramaTextures(textures, blobUrls);
  }

  async clearPanorama(): Promise<void> {
    await deleteOpfsPanorama();
    if (this.e.disposed) return;
    this.e.applyPanoramaTextures([], []);
  }

  async capturePanorama(): Promise<boolean> {
    if (this.e.disposed || this.e.capturingPanorama || this.e.phase !== 'playing') return false;
    this.e.capturingPanorama = true;

    const faceSize = 512;
    const faceOrientations: Array<{
      dir: [number, number, number];
      up: [number, number, number];
    }> = [
      { dir: [1, 0, 0], up: [0, 1, 0] },   // px (+X)
      { dir: [-1, 0, 0], up: [0, 1, 0] },  // nx (-X)
      { dir: [0, 1, 0], up: [0, 0, 1] },   // py (+Y)
      { dir: [0, -1, 0], up: [0, 0, -1] }, // ny (-Y)
      { dir: [0, 0, 1], up: [0, 1, 0] },   // pz (+Z)
      { dir: [0, 0, -1], up: [0, 1, 0] },  // nz (-Z)
    ];

    const prevHighlightVis = this.e.highlightBox.visible;
    const prevCrackVis = this.e.crackOverlayBox.visible;
    const prevHandVis = this.e.viewmodel.group.visible;
    const prevPlayerShadowVis = this.e.playerShadowRig.root.visible;
    const prevPixelRatio = this.e.renderer.getPixelRatio();
    const prevSize = new THREE.Vector2();
    this.e.renderer.getSize(prevSize);

    const capturedCanvases: HTMLCanvasElement[] = [];

    try {
      this.e.highlightBox.visible = false;
      this.e.crackOverlayBox.visible = false;
      this.e.viewmodel.group.visible = false;
      this.e.playerShadowRig.root.visible = false;

      const panoCam = new THREE.PerspectiveCamera(90, 1, 0.08, 220);
      panoCam.position.copy(this.e.camera.position);

      this.e.renderer.setPixelRatio(1);
      this.e.renderer.setSize(faceSize, faceSize, false);

      for (const orient of faceOrientations) {
        panoCam.up.set(orient.up[0], orient.up[1], orient.up[2]);
        panoCam.lookAt(
          panoCam.position.x + orient.dir[0],
          panoCam.position.y + orient.dir[1],
          panoCam.position.z + orient.dir[2],
        );
        panoCam.updateMatrixWorld();

        this.e.renderer.clear();
        this.e.renderer.render(this.e.scene, panoCam);

        const c = document.createElement('canvas');
        c.width = faceSize;
        c.height = faceSize;
        const cctx = c.getContext('2d')!;
        cctx.drawImage(this.e.renderer.domElement, 0, 0, faceSize, faceSize);
        capturedCanvases.push(c);
      }
    } finally {
      this.e.renderer.setPixelRatio(prevPixelRatio);
      this.e.renderer.setSize(prevSize.x, prevSize.y, false);
      this.e.highlightBox.visible = prevHighlightVis;
      this.e.crackOverlayBox.visible = prevCrackVis;
      this.e.viewmodel.group.visible = prevHandVis;
      this.e.playerShadowRig.root.visible = prevPlayerShadowVis;
      this.e.renderFrame();
    }

    if (capturedCanvases.length !== 6) {
      this.e.capturingPanorama = false;
      return false;
    }

    try {
      const liveTextures = capturedCanvases.map((c) => new THREE.CanvasTexture(c));
      this.e.applyPanoramaTextures(liveTextures, []);

      const blobs = await Promise.all(
        capturedCanvases.map(
          (c) =>
            new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/png')),
        ),
      );
      if (blobs.some((b) => !b)) {
        this.e.capturingPanorama = false;
        return false;
      }

      const saved = await saveOpfsPanorama(blobs as Blob[]);
      if (!this.e.disposed) {
        this.e.sound.playCraft();
        this.e.showToast(
          saved
            ? 'Panorama saved for Main Menu!'
            : 'Panorama captured for this session',
        );
      }
      this.e.capturingPanorama = false;
      return saved;
    } catch {
      this.e.capturingPanorama = false;
      return false;
    }
  }

  updateAtmosphere(dt: number) {
    if (this.e.targetTimeOfDay !== null) {
      let diff = this.e.targetTimeOfDay - this.e.timeOfDay;
      if (diff > 0.5) diff -= 1;
      if (diff < -0.5) diff += 1;
      if (Math.abs(diff) < 0.002) {
        this.e.timeOfDay = this.e.targetTimeOfDay;
        this.e.targetTimeOfDay = null;
      } else {
        this.e.timeOfDay = (this.e.timeOfDay + diff * Math.min(1, dt * 4.5) + 1) % 1;
      }
    }
    // timeOfDay is authoritative and arrives in snapshots; the renderer must
    // not advance it locally or the cycle would run at two different speeds.

    const sunAngle = (this.e.timeOfDay - 0.25) * Math.PI * 2;
    const sunY = Math.sin(sunAngle);
    const sunX = Math.cos(sunAngle);
    const sunZ = 0.36;

    const anchorX = this.e.playerPos.x;
    const anchorZ = this.e.playerPos.z;

    this.e.celestialGroup.position.set(anchorX, 0, anchorZ);
    this.e.sunMesh.position.set(sunX * 110, sunY * 110, sunZ * 55);
    this.e.moonMesh.position.set(-sunX * 110, -sunY * 110, -sunZ * 55);

    if (sunY >= -0.05) {
      this.e.sunLight.position.set(anchorX + sunX * 56, Math.max(8, sunY * 56), anchorZ + sunZ * 32);
    } else {
      this.e.sunLight.position.set(anchorX - sunX * 56, Math.max(10, -sunY * 56), anchorZ - sunZ * 32);
    }
    this.e.sunLight.target.position.set(anchorX, 14, anchorZ);
    this.e.sunLight.target.updateMatrixWorld();

    // Centered on the horizon so day and night are exactly 12 minutes each.
    this.e.dayFactor = THREE.MathUtils.clamp((sunY + 0.2) / 0.4, 0, 1);
    const horizonGlow = Math.max(0, 1 - Math.abs(sunY) * 4.2);
    const isDawn = this.e.timeOfDay < 0.5;

    _curSky.copy(_skyNight).lerp(_skyDay, this.e.dayFactor);
    if (horizonGlow > 0.01) {
      _curSky.lerp(isDawn ? _skyDawn : _skySunset, horizonGlow * 0.72);
    }

    if (this.e.phase === 'playing' && this.e.underwater) {
      _curSky.lerp(_underwaterSky, 0.75);
      this.e.fog.near = 2;
      this.e.fog.far = 22;
    } else {
      this.e.fog.near = Math.max(18, this.e.renderRadius * CHUNK_SIZE * 0.52);
      this.e.fog.far = this.e.renderRadius * CHUNK_SIZE + 8;
    }

    (this.e.scene.background as THREE.Color).copy(_curSky);
    this.e.fog.color.copy(_curSky);

    _curSunColor.copy(_sunColorNight).lerp(_sunColorDay, this.e.dayFactor);
    if (horizonGlow > 0.01) {
      _curSunColor.lerp(_sunColorWarm, horizonGlow * 0.8);
    }
    this.e.sunLight.color.copy(_curSunColor);
    this.e.sunLight.intensity = 0.32 + this.e.dayFactor * 1.18;

    _curHemiSky.copy(_hemiSkyNight).lerp(_hemiSkyDay, this.e.dayFactor);
    _curHemiGround.copy(_hemiGroundNight).lerp(_hemiGroundDay, this.e.dayFactor);
    this.e.hemiLight.color.copy(_curHemiSky);
    this.e.hemiLight.groundColor.copy(_curHemiGround);
    this.e.hemiLight.intensity = 0.34 + this.e.dayFactor * 0.44;

    _curCloud.copy(_cloudNight).lerp(_cloudDay, this.e.dayFactor);
    if (horizonGlow > 0.01) _curCloud.lerp(_cloudWarm, horizonGlow * 0.65);
    this.e.clouds.setTint(_curCloud);

    const starMat = this.e.stars.material as THREE.PointsMaterial;
    starMat.opacity = THREE.MathUtils.clamp((0.25 - sunY) * 2.2, 0, 0.92);
  }

  renderFrame() {
    this.e.renderer.clear();
    if (this.e.phase === 'title') {
      if (this.e.hasPanorama) {
        this.e.renderer.render(this.e.panoramaScene, this.e.panoramaCamera);
      }
      return;
    }
    this.e.renderer.render(this.e.scene, this.e.camera);
    if (this.e.viewmodel.group.visible) {
      const lightScale = 0.48 + this.e.dayFactor * 0.52;
      this.e.handHemiLight.intensity = 0.95 * lightScale;
      this.e.handDirLight.intensity = 1.15 * lightScale;
      this.e.renderer.clearDepth();
      this.e.renderer.render(this.e.handScene, this.e.handCamera);
    }
  }

  // --- Event Handlers ---

  updatePanorama(dt: number) {
    if (!this.e.hasPanorama) return;
    this.e.panoramaTime += dt;
    this.e.panoramaYaw = (this.e.panoramaYaw - dt * 0.085) % (Math.PI * 2);
    const gentlePitch = -0.07 + Math.sin(this.e.panoramaTime * 0.22) * 0.06;
    this.e.panoramaCamera.rotation.set(gentlePitch, this.e.panoramaYaw, 0, 'YXZ');
  }

  updateAnimatedAtlas(dt: number) {
    if (this.e.animatedAtlasTiles.length === 0) return;
    this.e.animatedAtlasClock += dt;
    const ctx = this.e.atlasCtx;
    if (!ctx) return;
    let dirty = false;
    for (let i = 0; i < this.e.animatedAtlasTiles.length; i++) {
      const anim = this.e.animatedAtlasTiles[i];
      if (anim.frames.length <= 1) continue;
      const nextFrame =
        Math.floor(this.e.animatedAtlasClock / anim.frameDurationSec) % anim.frames.length;
      if (nextFrame !== this.e.animatedAtlasLastFrames[i]) {
        this.e.animatedAtlasLastFrames[i] = nextFrame;
        const col = anim.tile % ATLAS_COLS;
        const row = Math.floor(anim.tile / ATLAS_COLS);
        const ox = col * TILE_PIXELS;
        const oy = row * TILE_PIXELS;
        ctx.clearRect(ox, oy, TILE_PIXELS, TILE_PIXELS);
        ctx.drawImage(anim.frames[nextFrame], ox, oy);
        dirty = true;
      }
    }
    if (dirty) this.e.atlasTexture.needsUpdate = true;
  }
}
