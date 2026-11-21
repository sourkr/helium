
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SoundEngine } from '../game/audio';
import {
  BLOCK_DEFS, BlockType, DEFAULT_HOTBAR, isBedBlock, isDoorBlock, isLeafBlock,
  isLiquidBlock, isLogBlock, isPlantBlock, isReplaceableBlock, isSolidBlock,
  TerrainPreset, TimePreset,
} from '../shared/blocks';
import {
  DroppedItemManager, HeldBlockViewmodel, HostileMobManager, ParticlePool,
  PlayerShadowRig, VoxelClouds, WildlifeManager,
} from '../game/entities';
import { buildChunkGeometry } from '../game/mesher';
import {
  addItemToInventory, CRAFTING_RECIPES, createEmptyFurnaceData,
  createStarterSurvivalInventory, createSurvivalItemIcons, damageToolSlot,
  executeCraftRecipeBatch, FurnaceData, GameMode, getBlockDrop, getFuelBurnTime,
  getMiningDuration, getRecipeGridPreview, getSmeltingRecipe, HOTBAR_SIZE,
  InventorySlot, ITEM_DEFS, ItemType, matchCraftingGrid, recipeFitsInGridSize,
} from '../shared/survival';
import {
  AnimatedAtlasTile, applyUserAssetsToAtlas, buildVoxelSpriteGeometriesFromUrls,
  discoverAnimatedItemFrames,
} from '../game/assetPack';
import {
  deleteOpfsPanorama, FullWorldSave, loadOpfsPanorama, saveOpfsPanorama,
  saveOpfsWorld, WorldSummary,
} from '../game/opfsStorage';
import {
  ATLAS_COLS, buildBlockIconsFromAtlas, createProceduralAtlas, TILE_PIXELS,
} from '../game/textures';
import {
  CHUNK_HEIGHT, CHUNK_SIZE, chunkKey, RaycastHit, SEA_LEVEL, VoxelWorld,
} from '../shared/world';
import type { ChunkMeshPair, EngineCallbacks, EngineSettings, GamePhase, HudSnapshot } from '../game/engine/types';
import {
  RENDER_RADIUS, PLAYER_HALF_WIDTH, PLAYER_HEIGHT, EYE_HEIGHT, GRAVITY, JUMP_SPEED,
  WALK_SPEED, SPRINT_SPEED, FLY_SPEED, TIME_PRESET_VALUES, SNAPSHOT_INTERVAL,
  _forward, _right, _moveDir, _rayOrigin, _rayDir,
  _skyDay, _skySunset, _skyDawn, _skyNight, _curSky,
  _sunColorDay, _sunColorWarm, _sunColorNight, _curSunColor,
  _hemiSkyDay, _hemiSkyNight, _curHemiSky, _hemiGroundDay, _hemiGroundNight, _curHemiGround,
  _cloudDay, _cloudWarm, _cloudNight, _curCloud,
} from '../game/engine/constants';
import { createCrackTexture, detectSoftwareGl } from '../game/engine/helpers';
import { RenderSystem } from './renderer/RenderSystem';
import { GameServer } from '../server/GameServer';
import { LocalTransport } from '../shared/transport';
import type { ClientCommand, ServerMessage } from '../shared/protocol';
import type { GameEvent, ServerSnapshot } from '../shared/snapshots';

export type { EngineCallbacks, EngineSettings, GamePhase, HudSnapshot } from '../game/engine/types';

export class GameClient {
  readonly container: HTMLDivElement;
  readonly callbacks: EngineCallbacks;
  readonly isSoftwareGl: boolean;
  gl: WebGL2RenderingContext | null = null;

  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly handScene: THREE.Scene;
  readonly handCamera: THREE.PerspectiveCamera;
  readonly handHemiLight: THREE.HemisphereLight;
  readonly handDirLight: THREE.DirectionalLight;
  readonly panoramaScene: THREE.Scene;
  readonly panoramaCamera: THREE.PerspectiveCamera;
  readonly panoramaMaterials: THREE.MeshBasicMaterial[] = [];
  readonly panoramaGeometries: THREE.BufferGeometry[] = [];
  panoramaTextures: THREE.Texture[] = [];
  panoramaObjectUrls: string[] = [];
  hasPanorama = false;
  panoramaYaw = 0;
  panoramaTime = 0;
  capturingPanorama = false;
  readonly sunLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly fog: THREE.Fog;
  readonly envTexture: THREE.Texture;

  readonly atlasCanvas: HTMLCanvasElement;
  atlasCtx: CanvasRenderingContext2D | null = null;
  readonly atlasTexture: THREE.CanvasTexture;
  animatedAtlasTiles: AnimatedAtlasTile[] = [];
  animatedAtlasLastFrames: number[] = [];
  animatedAtlasClock = 0;
  readonly crackTexture: THREE.CanvasTexture;
  destroyStageTextures: THREE.Texture[] = [];
  lastCrackStage = -1;
  readonly opaqueMaterial: THREE.MeshStandardMaterial;
  readonly transparentMaterial: THREE.MeshStandardMaterial;

  readonly worldGroup = new THREE.Group();
  readonly chunkMeshes = new Map<string, ChunkMeshPair>();
  readonly highlightBox: THREE.LineSegments;
  readonly crackOverlayBox: THREE.Mesh;

  readonly particles: ParticlePool;
  readonly viewmodel: HeldBlockViewmodel;
  readonly clouds: VoxelClouds;
  readonly celestialGroup = new THREE.Group();
  readonly sunMesh: THREE.Mesh;
  readonly moonMesh: THREE.Mesh;
  readonly stars: THREE.Points;

  wildlife: WildlifeManager;
  readonly hostiles: HostileMobManager;
  readonly playerShadowRig: PlayerShadowRig;
  readonly droppedItems: DroppedItemManager;
  world: VoxelWorld;
  public readonly sound = new SoundEngine();

  // Active World Metadata (persisted in OPFS)
  worldId = '';
  worldName = 'Meadows Valley';
  worldCreatedAt = Date.now();
  worldReadyForSave = false;

  // Game, Inventory & Furnace state
  phase: GamePhase = 'title';
  mode: GameMode = 'survival';
  creativeHotbar: ItemType[] = [...DEFAULT_HOTBAR] as unknown as ItemType[];
  survivalSlots: Array<InventorySlot | null> = createStarterSurvivalInventory();
  craftingGrid: Array<InventorySlot | null> = new Array(9).fill(null);
  furnaces = new Map<string, FurnaceData>();
  activeFurnaceKey: string | null = null;
  furnaceUiAccum = 0;
  activeSlot = 0;
  pendingRelockOnInput = false;

  // Player physics & vitals
  playerPos = new THREE.Vector3(0.5, 22, 4.5);
  playerVel = new THREE.Vector3();
  yaw = -0.35;
  pitch = -0.06;
  grounded = false;
  flying = false;
  underwater = false;
  coyoteTimer = 0;
  lastSpaceTap = 0;
  stepDist = 0;
  cameraShake = 0;
  crosshairPulse = 0;
  currentTarget: RaycastHit | null = null;
  peakAirY = 22;

  // Survival vitals & combat
  health = 20;
  readonly maxHealth = 20;
  hunger = 20;
  readonly maxHunger = 20;
  oxygen = 10;
  readonly maxOxygen = 10;
  exhaustion = 0;
  regenTimer = 0;
  starveTimer = 0;
  drownTimer = 0;
  hurtCooldown = 0;
  damageFlash = 0;
  hitstopTimer = 0;
  blocksMined = 0;
  mobsDefeated = 0;
  survivalSeconds = 0;
  toastText: string | null = null;
  toastTimer = 0;

  // Progressive survival mining state
  miningHeld = false;
  miningBlockKey: string | null = null;
  miningElapsed = 0;
  miningDuration = 0.5;
  miningTickAccum = 0;

  // Minecraft-style natural leaf decay & bed respawn point
  leafDecayQueue: Array<{ x: number; y: number; z: number; delay: number }> = [];
  leafDecaySet = new Set<string>();
  leafRandomTickAccum = 0;
  bedSpawnPoint: { x: number; y: number; z: number } | null = null;

  // Dynamic time of day
  timeOfDay = 0.44;
  targetTimeOfDay: number | null = null;
  dayFactor = 1;

  // Animated item visuals (clock follows time of day; compass follows look yaw)
  itemIcons: Record<number, string> = {};
  animatedItemFrames: Record<number, string[]> = {};
  private readonly animatedItemFrameIndex: Record<number, number> = {};

  // Input tracking
  readonly heldKeys = new Set<string>();
  pointerLocked = false;
  isDraggingLook = false;
  dragStartX = 0;
  dragStartY = 0;
  dragMoved = false;
  lastMouseX = 0;
  lastMouseY = 0;
  suppressAutoPauseUntil = 0;

  // User-configurable settings
  baseFov = 72;
  mouseSensitivity = 1.0;
  renderRadius = RENDER_RADIUS;
  playerShadowEnabled = true;
  entityShadowsEnabled = true;

  // Loop & lifecycle
  disposed = false;
  frameId = 0;
  lastFrameMs = 0;
  fps = 60;
  fpsFrames = 0;
  fpsAccum = 0;
  hudAccumulator = 0;
  autosaveAccumulator = 0;
  saveTimeout: number | null = null;
  lastChunkCenterX = Number.NaN;
  lastChunkCenterZ = Number.NaN;
  pendingChunkQueue: Array<[number, number]> = [];
  private readonly renderSys = new RenderSystem(this);

  // ---- authoritative server connection (client is presentation-only) ----
  readonly transport = new LocalTransport();
  readonly server: GameServer;
  private snapshot: ServerSnapshot | null = null;
  private serverMessageOff: (() => void) | null = null;

  // Render-only reconstruction from authoritative snapshots. Snapshots are
  // timestamped on arrival so extra snapshots (HUD/inventory changes) never
  // restart interpolation at an arbitrary point.
  private readonly snapshotHistory: Array<{ x: number; y: number; z: number; t: number }> = [];
  private readonly renderPos = new THREE.Vector3(0.5, 22, 4.5);

  // Mouse-look prediction. `yaw`/`pitch` are the rendered angles; the snapshot
  // base plus unacknowledged deltas reconstructs them after every snapshot so
  // the camera never snaps back to an older server rotation.
  private readonly unackedLook: Array<{ seq: number; yaw: number; pitch: number }> = [];
  private inputSeq = 0;
  private serverYaw = -0.35;
  private serverPitch = -0.06;


  constructor(
    container: HTMLDivElement,
    callbacks: EngineCallbacks,
    initialSeed?: number,
    initialPreset?: TerrainPreset,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = _skyDay.clone();
    this.fog = new THREE.Fog('#8bc6f7', 34, RENDER_RADIUS * CHUNK_SIZE + 8);
    this.scene.fog = this.fog;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.28;
    pmrem.dispose();

    // Camera with YXZ order & upright up vector
    const aspect =
      (container.clientWidth || window.innerWidth) /
      Math.max(1, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(72, aspect, 0.08, 220);
    this.camera.rotation.order = 'YXZ';
    this.camera.up.set(0, 1, 0);
    this.scene.add(this.camera);

    // Dedicated Minecraft-style first-person hand pass (cleared depth -> never clips walls)
    this.renderer.autoClear = false;
    this.handScene = new THREE.Scene();
    this.handScene.environment = this.envTexture;
    this.handScene.environmentIntensity = 0.24;
    this.handCamera = new THREE.PerspectiveCamera(70, aspect, 0.04, 6);
    this.handHemiLight = new THREE.HemisphereLight(0xd9eeff, 0x6b6f64, 0.95);
    this.handScene.add(this.handHemiLight);
    this.handDirLight = new THREE.DirectionalLight(0xfff6e5, 1.15);
    this.handDirLight.position.set(1.6, 2.4, 2.2);
    this.handScene.add(this.handDirLight);

    // Dedicated Main Menu 360-degree 6-face Panorama Skybox Scene
    this.panoramaScene = new THREE.Scene();
    this.panoramaCamera = new THREE.PerspectiveCamera(82, aspect, 0.05, 20);
    this.panoramaCamera.rotation.order = 'YXZ';
    const panoFaces: Array<{
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
    for (const face of panoFaces) {
      const geom = new THREE.PlaneGeometry(2.004, 2.004);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthWrite: false,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(face.dir[0], face.dir[1], face.dir[2]);
      mesh.up.set(face.up[0], face.up[1], face.up[2]);
      mesh.lookAt(0, 0, 0);
      this.panoramaScene.add(mesh);
      this.panoramaGeometries.push(geom);
      this.panoramaMaterials.push(mat);
    }

    this.hemiLight = new THREE.HemisphereLight(0x9ad0ff, 0x5a6b4e, 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5dc, 1.45);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    const shadowBound = 36;
    this.sunLight.shadow.camera.left = -shadowBound;
    this.sunLight.shadow.camera.right = shadowBound;
    this.sunLight.shadow.camera.top = shadowBound;
    this.sunLight.shadow.camera.bottom = -shadowBound;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 140;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Procedural Texture Atlas + Survival Item Icons + User /assets/ Pack Overlay
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const atlas = createProceduralAtlas(maxAniso);
    const survivalIcons = createSurvivalItemIcons();
    this.atlasCanvas = atlas.atlasCanvas;
    this.atlasCtx = this.atlasCanvas.getContext('2d');
    this.atlasTexture = atlas.atlasTexture;
    this.crackTexture = createCrackTexture();
    this.itemIcons = { ...atlas.blockIcons, ...survivalIcons };
    this.callbacks.onAssetsReady(this.itemIcons);

    void buildVoxelSpriteGeometriesFromUrls(survivalIcons).then((baseGeometries) => {
      if (this.disposed) {
        for (const g of Object.values(baseGeometries)) g.dispose();
        return;
      }
      this.viewmodel.setCustomItemGeometries(baseGeometries, false);
    });

    applyUserAssetsToAtlas(
      atlas.atlasCanvas,
      this.atlasTexture,
      (
        itemOverrides,
        itemGeometries,
        destroyStages,
        _loadedCount,
        animatedTiles,
        animatedItemFrames,
      ) => {
        if (this.disposed) {
          for (const g of Object.values(itemGeometries)) g.dispose();
          for (const t of destroyStages) t.dispose();
          return;
        }
        this.animatedAtlasTiles = animatedTiles;
        this.animatedAtlasLastFrames = animatedTiles.map(() => 0);
        const updatedBlockIcons = buildBlockIconsFromAtlas(atlas.atlasCanvas);
        this.viewmodel.setCustomItemGeometries(itemGeometries, true);
        if (destroyStages.length > 0) {
          for (const prev of this.destroyStageTextures) prev.dispose();
          this.destroyStageTextures = destroyStages;
          this.lastCrackStage = -1;
        }
        this.send({ type: 'destroyStages', count: this.destroyStageTextures.length });

        this.animatedItemFrames = animatedItemFrames;
        this.itemIcons = {
          ...updatedBlockIcons,
          ...survivalIcons,
          ...itemOverrides,
        };
        this.callbacks.onAssetsReady(this.itemIcons);
        this.updateAnimatedItemIcons();
        void this.loadAnimatedItemGeometries();
      },
    );

    this.opaqueMaterial = new THREE.MeshStandardMaterial({
      map: this.atlasTexture,
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
      alphaTest: 0.45,
    });

    this.transparentMaterial = new THREE.MeshStandardMaterial({
      map: this.atlasTexture,
      vertexColors: true,
      roughness: 0.22,
      metalness: 0.08,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.scene.add(this.worldGroup);

    // Target Block Outline (crisp wireframe only) + Mining Crack Box
    const edgeGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.003, 1.003, 1.003));
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x0b0e12,
      transparent: true,
      opacity: 0.72,
    });
    this.highlightBox = new THREE.LineSegments(edgeGeom, edgeMat);
    this.highlightBox.visible = false;
    this.scene.add(this.highlightBox);

    this.crackOverlayBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.01, 1.01, 1.01),
      new THREE.MeshBasicMaterial({
        map: this.crackTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.crackOverlayBox.visible = false;
    this.scene.add(this.crackOverlayBox);

    this.particles = new ParticlePool();
    this.scene.add(this.particles.mesh);

    this.viewmodel = new HeldBlockViewmodel(this.atlasTexture);
    this.viewmodel.group.visible = false;
    this.handScene.add(this.viewmodel.group);

    this.clouds = new VoxelClouds(42);
    this.scene.add(this.clouds.mesh);

    this.sunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(10, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff3b8, fog: false }),
    );
    this.moonMesh = new THREE.Mesh(
      new THREE.BoxGeometry(7, 7, 7),
      new THREE.MeshBasicMaterial({ color: 0xdce8ff, fog: false }),
    );
    this.celestialGroup.add(this.sunMesh);
    this.celestialGroup.add(this.moonMesh);

    const starCount = 260;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.15 + Math.random() * 0.85);
      const r = 135;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xe6f0ff,
      size: 1.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
    });
    this.stars = new THREE.Points(starGeom, starMat);
    this.celestialGroup.add(this.stars);
    this.scene.add(this.celestialGroup);

    // Initialize temporary preview world immediately; OPFS bootstrap loads active saved world right after mount
    const seed = initialSeed ?? 42817;
    const preset = initialPreset ?? 'meadows';
    this.world = new VoxelWorld(seed, preset);
    this.wildlife = new WildlifeManager(this.world, 7);
    this.wildlife.setShadowsEnabled(this.entityShadowsEnabled);
    this.scene.add(this.wildlife.root);

    this.hostiles = new HostileMobManager();
    this.hostiles.setShadowsEnabled(this.entityShadowsEnabled);
    this.scene.add(this.hostiles.root);

    this.playerShadowRig = new PlayerShadowRig();
    this.playerShadowRig.setEnabled(this.playerShadowEnabled);
    this.scene.add(this.playerShadowRig.root);

    this.droppedItems = new DroppedItemManager(this.atlasTexture, (item) =>
      this.viewmodel.getCustomItemGeometry(item),
    );
    this.droppedItems.setShadowsEnabled(this.entityShadowsEnabled);
    this.scene.add(this.droppedItems.root);

    // Create and attach the authoritative in-process server. The server owns its
    // own fixed-step clock so the simulation keeps running independently of rendering.
    this.server = new GameServer();
    this.serverMessageOff = this.transport.onMessage((message) => this.handleMessage(message));
    this.transport.attachServer(this.server);
    // Server generated its spawn chunks before listeners were attached; push a mirror now.
    this.server.sendAllChunks();
    this.server.start();
    this.syncViewmodel();
    this.updateAtmosphere(0);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitInventory();
    void this.loadSavedPanoramaFromOpfs();

    this.lastFrameMs = performance.now();
    this.scheduleNextFrame();
  }

  /** Picks the active texture frame for an animated item. */
  private animatedItemFrame(item: ItemType, frameCount: number): number {
    if (item === ItemType.Compass) {
      // compass_16 points north (up on the sprite). Yaw 0 looks north (-Z) and
      // increasing yaw turns left, so the needle sweeps clockwise across frames.
      const turn = (this.yaw / (Math.PI * 2)) * frameCount;
      const frame = Math.round(frameCount / 2 + turn) % frameCount;
      return (frame + frameCount) % frameCount;
    }
    return Math.floor(this.timeOfDay * frameCount) % frameCount;
  }

  /** Refreshes item icons whose texture frames animate (clock time, compass heading). */
  private updateAnimatedItemIcons(): void {
    for (const [key, frames] of Object.entries(this.animatedItemFrames)) {
      const item = Number(key);
      if (frames.length < 2) continue;
      const frame = this.animatedItemFrame(item, frames.length);
      if (this.animatedItemFrameIndex[item] === frame && this.itemIcons[item] === frames[frame]) {
        continue;
      }
      this.animatedItemFrameIndex[item] = frame;
      this.itemIcons = { ...this.itemIcons, [item]: frames[frame] };
      this.callbacks.onAssetsReady(this.itemIcons);
      this.viewmodel.setAnimatedItemFrame(item, frame);
    }
  }

  /** Builds 3D voxel sprite frames for animated PNGs so held/dropped items animate too. */
  private async loadAnimatedItemGeometries(): Promise<void> {
    const animated = Object.entries(this.animatedItemFrames).filter(([, frames]) => frames.length > 1);
    if (animated.length === 0) return;
    const keyedUrls: Record<number, string> = {};
    const ranges: Array<{ item: ItemType; start: number; count: number }> = [];
    let nextKey = 0;
    for (const [key, frames] of animated) {
      const start = nextKey;
      for (const url of frames) keyedUrls[nextKey++] = url;
      ranges.push({ item: Number(key), start, count: frames.length });
    }
    const geometries = await buildVoxelSpriteGeometriesFromUrls(keyedUrls);
    if (this.disposed) {
      for (const geom of Object.values(geometries)) geom.dispose();
      return;
    }
    for (const { item, start, count } of ranges) {
      const ordered: THREE.BufferGeometry[] = [];
      for (let idx = 0; idx < count; idx++) {
        const geom = geometries[start + idx];
        if (geom) ordered.push(geom);
      }
      if (ordered.length === 0) continue;
      this.viewmodel.setAnimatedItemGeometries(item, ordered);
      this.viewmodel.setAnimatedItemFrame(item, this.animatedItemFrameIndex[item] ?? 0);
    }
  }

  applyPanoramaTextures(textures: THREE.Texture[], objectUrls: string[] = []) {
    return this.renderSys.applyPanoramaTextures(textures, objectUrls);
  }
  async loadSavedPanoramaFromOpfs(): Promise<void> {
    return this.renderSys.loadSavedPanoramaFromOpfs();
  }
  async clearPanorama(): Promise<void> {
    return this.renderSys.clearPanorama();
  }
  async capturePanorama(): Promise<boolean> {
    return this.renderSys.capturePanorama();
  }
  getWorldInfo(): {
    id: string;
    name: string;
    seed: number;
    preset: TerrainPreset;
    mode: GameMode;
  } {
    return {
      id: this.worldId,
      name: this.worldName,
      seed: this.snapshot?.world.seed ?? this.world.seed,
      preset: (this.snapshot?.world.preset as TerrainPreset | undefined) ?? this.world.preset,
      mode: this.mode,
    };
  }
  setWorldName(name: string) {
    this.send({ type: 'setWorldName', name });
  }
  cloneFurnaceData(f: FurnaceData): FurnaceData {
    return structuredClone(f);
  }
  exportFullSave(): FullWorldSave {
    return this.server.exportFullSave();
  }
  async saveNow(): Promise<WorldSummary[] | null> {
    return this.server.saveNow();
  }
  scheduleSave() {
    this.server.scheduleSave();
  }
  loadWorldState(save: FullWorldSave) {
    this.send({ type: 'loadWorldState', save });
  }
  initializeSpawnAndCoreChunks() {
    // Server owns generation; chunks arrive via transport.
  }
  setGameMode(nextMode: GameMode) {
    this.send({ type: 'setGameMode', mode: nextMode });
  }
  regenerateWorld(seed: number, preset: TerrainPreset) {
    this.send({ type: 'regenerateWorld', seed, preset });
  }
  resetWorldEdits() {
    this.send({ type: 'resetWorldEdits' });
  }
  respawnPlayer() {
    this.send({ type: 'respawn' });
  }
  public setPhase(phase: GamePhase, options?: { skipPointerLock?: boolean }) {
    if (this.phase === phase) return;
    const prevPhase = this.phase;
    this.phase = phase;
    this.send({ type: 'setPhase', phase });
    this.heldKeys.clear();
    this.isDraggingLook = false;
    this.resetMiningState();

    // Return any ingredients sitting on the crafting grid when closing inventory/crafting modal
    if (
      (prevPhase === 'inventory' || prevPhase === 'crafting') &&
      phase !== 'inventory' &&
      phase !== 'crafting'
    ) {
      this.clearCraftingGrid(true);
    }

    if (prevPhase === 'furnace' && phase !== 'furnace') {
      this.activeFurnaceKey = null;
      this.emitActiveFurnace();
    } else if (phase === 'furnace') {
      this.emitActiveFurnace();
    }

    if (prevPhase === 'playing' && phase !== 'playing') {
      void this.saveNow();
    }

    if (phase === 'playing') {
      // Guard against browser Escape/pointer-lock-cancel bouncing right into Pause Menu
      if (
        prevPhase === 'inventory' ||
        prevPhase === 'crafting' ||
        prevPhase === 'furnace' ||
        prevPhase === 'paused'
      ) {
        this.suppressAutoPauseUntil = performance.now() + 700;
      }
      this.sound.unlock();
      this.viewmodel.group.visible = true;
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(
        this.renderPos.x,
        this.renderPos.y + EYE_HEIGHT,
        this.renderPos.z,
      );
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      if (!options?.skipPointerLock) {
        this.requestPointerLockSafe();
      }
    } else {
      this.pendingRelockOnInput = false;
      this.viewmodel.group.visible = phase !== 'title' && phase !== 'dead';
      this.highlightBox.visible = false;
      this.crackOverlayBox.visible = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock?.();
      }
    }

    this.callbacks.onPhaseChange(phase);
    this.emitHud();
  }

  requestPointerLockSafe() {
    try {
      const el = this.renderer.domElement;
      if (el.requestPointerLock) {
        const res = el.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') res.catch(() => {});
      }
    } catch {
      // Fallback drag-look remains active automatically.
    }
  }
  public setTimePreset(preset: TimePreset) {
    this.send({ type: 'setTimePreset', preset });
  }

  setActiveSlot(slot: number) {
    this.send({ type: 'setActiveSlot', slot });
  }
  assignBlockToActiveSlot(item: ItemType) {
    this.send({ type: 'assignBlockToActiveSlot', item });
  }
  swapSurvivalSlots(fromIdx: number, toIdx: number) {
    this.send({ type: 'swapSurvivalSlots', from: fromIdx, to: toIdx });
  }
  getActiveCraftingGridSize(): 2 | 3 {
    return this.server.getActiveCraftingGridSize();
  }
  placeInventoryItemIntoGrid(invIdx: number, gridIdx: number, count = 1): boolean {
    this.send({ type: 'placeInventoryItemIntoGrid', invIdx, gridIdx, count });
    return true;
  }
  returnGridCellToInventory(gridIdx: number) {
    this.send({ type: 'returnGridCellToInventory', gridIdx });
  }
  clearCraftingGrid(silent = false) {
    this.send({ type: 'clearCraftingGrid', silent });
  }
  fillCraftingGridFromRecipe(recipeId: string): boolean {
    this.send({ type: 'fillCraftingGridFromRecipe', recipeId });
    return true;
  }
  craftFromGrid(craftAll = false): boolean {
    this.send({ type: 'craftFromGrid', craftAll });
    return true;
  }
  craftRecipeById(recipeId: string, craftAll = false): boolean {
    this.send({ type: 'craftRecipeById', recipeId, craftAll });
    return true;
  }
  getOrCreateFurnace(key: string): FurnaceData {
    return this.server.getOrCreateFurnace(key);
  }
  emitActiveFurnace() {
    // Furnace state is delivered via server messages.
  }
  placeInventoryItemIntoFurnace(
    invIdx: number,
    targetSlot: 'input' | 'fuel' | 'output',
    count = 1,
  ): boolean {
    if (targetSlot === 'output') return false;
    this.send({ type: 'placeInventoryItemIntoFurnace', invIdx, slot: targetSlot, count });
    return true;
  }
  takeFromFurnaceSlot(slot: 'input' | 'fuel' | 'output'): boolean {
    if (slot === 'output') {
      this.send({ type: 'takeFromFurnaceSlot', slot: 'output' });
    } else {
      this.send({ type: 'takeFromFurnaceSlot', slot });
    }
    return true;
  }
  quickLoadFurnaceSlot(invIdx: number, fullStack = true): boolean {
    this.send({ type: 'quickLoadFurnaceSlot', invIdx, fullStack });
    return true;
  }
  quickLoadFurnaceRecipe(inputItem: ItemType): boolean {
    this.send({ type: 'quickLoadFurnaceRecipe', inputItem });
    return true;
  }
  updateFurnaces(_dt: number) {
    // Server owns furnace simulation.
  }
  eatFromSlot(slotIdx: number): boolean {
    this.send({ type: 'eatFromSlot', slot: slotIdx });
    return true;
  }
  toggleFlyMode() {
    this.send({ type: 'toggleFly' });
  }
  public setMuted(muted: boolean) {
    this.sound.setMuted(muted);
  }

  public applySettings(settings: Partial<EngineSettings>) {
    if (typeof settings.fov === 'number' && Number.isFinite(settings.fov)) {
      this.baseFov = THREE.MathUtils.clamp(settings.fov, 60, 100);
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
    if (
      typeof settings.mouseSensitivity === 'number' &&
      Number.isFinite(settings.mouseSensitivity)
    ) {
      this.mouseSensitivity = THREE.MathUtils.clamp(settings.mouseSensitivity, 0.3, 2.5);
    }
    if (
      typeof settings.renderDistance === 'number' &&
      Number.isFinite(settings.renderDistance)
    ) {
      const nextRadius = Math.round(THREE.MathUtils.clamp(settings.renderDistance, 2, 6));
      if (nextRadius !== this.renderRadius) {
        this.renderRadius = nextRadius;
        this.lastChunkCenterX = Number.NaN;
        this.lastChunkCenterZ = Number.NaN;
        this.fog.far = this.renderRadius * CHUNK_SIZE + 8;
        this.queueSurroundingChunks();
      }
    }
    if (typeof settings.muted === 'boolean') {
      this.sound.setMuted(settings.muted);
    }
    if (typeof settings.playerShadow === 'boolean') {
      this.playerShadowEnabled = settings.playerShadow;
      this.playerShadowRig.setEnabled(settings.playerShadow);
    }
    if (typeof settings.entityShadows === 'boolean') {
      this.entityShadowsEnabled = settings.entityShadows;
      this.wildlife.setShadowsEnabled(settings.entityShadows);
      this.hostiles.setShadowsEnabled(settings.entityShadows);
      this.droppedItems.setShadowsEnabled(settings.entityShadows);
    }
  }

  getEquippedItem(): ItemType | null {
    return this.survivalSlots[this.activeSlot]?.item ?? null;
  }
  consumeActiveToolDurability(_amount: number, _at: { x: number; y: number; z: number }) {
    // Server owns durability.
  }
  syncViewmodel() {
    this.viewmodel.setItem(this.survivalSlots[this.activeSlot]?.item ?? null);
  }
  emitInventory() {
    this.callbacks.onInventoryChange(
      this.mode, this.creativeHotbar, this.survivalSlots, this.craftingGrid, this.activeSlot,
    );
  }
  showToast(_text: string) {
    // Toast events arrive from the server.
  }
  resetMiningState() {
    this.send({ type: 'resetMiningState' });
  }
  applyPlayerDamage(amount: number, knockX = 0, knockZ = 0) {
    this.send({ type: 'playerDamage', amount, knockX, knockZ });
  }
  disposeChunkPair(pair: ChunkMeshPair) {
    if (pair.opaque) {
      this.worldGroup.remove(pair.opaque);
      pair.opaque.geometry.dispose();
    }
    if (pair.transparent) {
      this.worldGroup.remove(pair.transparent);
      pair.transparent.geometry.dispose();
    }
  }
  queueSurroundingChunks() {
    // Server owns chunk streaming.
  }
  processChunkStreaming() {
    // Server owns chunk streaming.
  }
  rebuildDirtyChunks(limit: number) {
    const dirty = this.world.consumeDirtyChunks();
    let count = 0;
    const leftover: Array<[number, number]> = [];

    for (const [cx, cz] of dirty) {
      if (count >= limit) {
        leftover.push([cx, cz]);
        continue;
      }
      if (!this.world.hasChunk(cx, cz)) continue;

      const key = chunkKey(cx, cz);
      const existing = this.chunkMeshes.get(key);
      if (existing) this.disposeChunkPair(existing);

      const bundle = buildChunkGeometry(this.world, cx, cz);
      let opaqueMesh: THREE.Mesh | null = null;
      let transMesh: THREE.Mesh | null = null;

      if (bundle.opaque) {
        opaqueMesh = new THREE.Mesh(bundle.opaque, this.opaqueMaterial);
        opaqueMesh.castShadow = true;
        opaqueMesh.receiveShadow = true;
        this.worldGroup.add(opaqueMesh);
      }
      if (bundle.transparent) {
        transMesh = new THREE.Mesh(bundle.transparent, this.transparentMaterial);
        transMesh.receiveShadow = true;
        transMesh.renderOrder = 2;
        this.worldGroup.add(transMesh);
      }

      this.chunkMeshes.set(key, { opaque: opaqueMesh, transparent: transMesh });
      count++;
    }

    for (const [cx, cz] of leftover) this.world.markChunkDirty(cx, cz);
  }
  updateAtmosphere(dt: number) {
    return this.renderSys.updateAtmosphere(dt);
  }
  updateSurvivalVitals(_dt: number, _sprinting: boolean, _moving: boolean) {
    // Server owns vitals.
  }
  updateSurvivalMining(_dt: number) {
    // Server owns mining.
  }
  updatePlayer(_dt: number) {
    // Server owns physics.
  }
  tryMeleeAttack(): boolean {
    if (this.phase !== 'playing') return false;
    this.viewmodel.triggerSwing();
    this.sound.playStrike();
    _rayOrigin.copy(this.camera.position);
    this.camera.getWorldDirection(_rayDir);
    const equipped = this.getEquippedItem();
    const dmg = (equipped ? ITEM_DEFS[equipped]?.attackDamage : undefined) ?? 2;
    const hostile = this.hostiles.tryMeleeHit(_rayOrigin, _rayDir, dmg, 4.2);
    if (hostile) {
      this.send({
        type: 'meleeHit',
        hit: {
          kind: 'hostile',
          x: hostile.pos.x, y: hostile.pos.y, z: hostile.pos.z,
          killed: hostile.killed,
        },
      });
      return true;
    }
    const wildlife = this.wildlife.tryMeleeHit(_rayOrigin, _rayDir, dmg, 4.4);
    if (wildlife) {
      this.send({
        type: 'meleeHit',
        hit: {
          kind: 'wildlife',
          x: wildlife.pos.x, y: wildlife.pos.y, z: wildlife.pos.z,
          killed: wildlife.killed,
        },
      });
      return true;
    }
    return false;
  }
  enqueueLeavesAround(_wx: number, _wy: number, _wz: number, _radius = 6) {
    // Server owns leaf decay.
  }
  updateLeafDecay(_dt: number) {
    // Server owns leaf decay.
  }
  completeBlockBreak(_t: RaycastHit) {
    // Block breaking is driven by server mining ticks.
  }
  breakTargetedBlock() {
    this.send({ type: 'breakBlock' });
  }
  useOrPlaceAtTarget() {
    this.send({ type: 'placeBlock' });
  }
  throwHeldItem(dropWholeStack = false) {
    this.send({ type: 'throwItem', dropWholeStack });
  }
  pickTargetedBlock() {
    this.send({ type: 'pickBlock' });
  }
  emitHud() {
    const miningProgress = this.snapshot?.player.miningProgress ?? 0;

    let targetedName = this.currentTarget ? (BLOCK_DEFS[this.currentTarget.block]?.name ?? null) : null;
    if (this.currentTarget?.block === BlockType.CraftingTable) {
      targetedName = 'Crafting Table (RMB to craft)';
    } else if (
      this.currentTarget?.block === BlockType.Furnace ||
      this.currentTarget?.block === BlockType.FurnaceLit
    ) {
      targetedName = 'Furnace (RMB to smelt)';
    } else if (this.currentTarget && isDoorBlock(this.currentTarget.block)) {
      targetedName = 'Oak Door (RMB to open/close)';
    } else if (this.currentTarget && isBedBlock(this.currentTarget.block)) {
      targetedName = 'White Bed (RMB to sleep)';
    }
    if (this.phase === 'playing' && this.getEquippedItem() === ItemType.Bucket) {
      _rayOrigin.copy(this.camera.position);
      this.camera.getWorldDirection(_rayDir);
      const liq = this.world.raycast(_rayOrigin, _rayDir, 6.5, true);
      if (liq && liq.block === BlockType.Water) {
        targetedName = 'Water (RMB to scoop)';
      } else if (liq && liq.block === BlockType.Lava) {
        targetedName = 'Lava (RMB to scoop)';
      }
    }

    this.callbacks.onHudUpdate({
      mode: this.mode,
      fps: this.fps,
      x: Math.floor(this.playerPos.x),
      y: Math.floor(this.playerPos.y),
      z: Math.floor(this.playerPos.z),
      biome: this.snapshot?.hud.biome ?? this.world.getBiomeAt(this.playerPos.x, this.playerPos.z),
      flying: this.flying,
      underwater: this.underwater,
      pointerLocked: this.pointerLocked,
      targetedBlock: targetedName,
      editCount: this.snapshot?.world.editCount ?? 0,
      timeOfDay: this.timeOfDay,
      crosshairPulse: this.crosshairPulse,
      health: this.health,
      maxHealth: this.maxHealth,
      hunger: this.hunger,
      maxHunger: this.maxHunger,
      oxygen: this.oxygen,
      maxOxygen: this.maxOxygen,
      miningProgress,
      damageFlash: this.damageFlash,
      toastText: this.toastText,
      blocksMined: this.blocksMined,
      mobsDefeated: this.mobsDefeated,
      survivalSeconds: Math.floor(this.survivalSeconds),
    });
  }

  afterDraw(cb: () => void) {
    const gl = (this.gl ??= this.renderer.getContext() as WebGL2RenderingContext);
    if (typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  scheduleNextFrame() {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  tick = () => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastFrameMs) / 1000;
    this.lastFrameMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (rawDt > 0 && rawDt < 2.0) {
      this.fpsFrames += 1;
      this.fpsAccum += rawDt;
      if (this.fpsAccum >= 0.4) {
        this.fps = Math.max(1, Math.round(this.fpsFrames / this.fpsAccum));
        this.fpsFrames = 0;
        this.fpsAccum = 0;
      }
    }

    // Forward the current input frame to the authoritative server. Hold on to
    // the predicted look delta until a snapshot proves the server applied it.
    const lookSeq = ++this.inputSeq;
    const lookSens = this.mouseSensitivity;
    this.send({
      type: 'input',
      seq: lookSeq,
      heldKeys: [...this.heldKeys],
      lookDx: this.pendingLookDx,
      lookDy: this.pendingLookDy,
      sensitivity: lookSens,
      miningHeld: this.miningHeld,
    });
    if (this.pendingLookDx !== 0 || this.pendingLookDy !== 0) {
      this.unackedLook.push({
        seq: lookSeq,
        yaw: -this.pendingLookDx * 0.0022 * lookSens,
        pitch: -this.pendingLookDy * 0.0022 * lookSens,
      });
      // Bound the queue in case snapshots stop arriving while the mouse moves.
      if (this.unackedLook.length > 64) this.unackedLook.splice(0, this.unackedLook.length - 64);
    }
    this.pendingLookDx = 0;
    this.pendingLookDy = 0;

    this.updateRenderPosition();

    if (this.toastTimer > 0) {
      this.toastTimer = Math.max(0, this.toastTimer - dt);
      if (this.toastTimer === 0) this.toastText = null;
    }

    // Client-only entity visuals (no authoritative state). Anchor them to the
    // same smoothed position as the camera so they don't jitter relative to it.
    if (this.phase === 'playing') {
      this.droppedItems.update(
        dt, this.world, this.renderPos, true,
        (item, count, durability) => {
          this.send({ type: 'pickupItem', item, count, durability });
          return true;
        },
      );
      this.particles.update(dt, this.world);
      this.wildlife.update(dt, this.world, this.renderPos);
      this.hostiles.update(
        dt, this.world, this.renderPos, this.dayFactor < 0.45,
        this.mode === 'survival', this.particles,
        (dmg, kx, kz) => this.send({ type: 'playerDamage', amount: dmg, knockX: kx, knockZ: kz }),
        () => {},
      );
      this.clouds.syncMatrices(this.renderPos.x, this.renderPos.z, dt);
    } else {
      this.clouds.syncMatrices(this.renderPos.x, this.renderPos.z, dt * 0.25);
    }

    if (this.phase === 'title') {
      this.renderSys.updatePanorama(dt);
    }
    this.renderSys.updateAnimatedAtlas(dt);
    this.renderSys.updateAtmosphere(dt);
    this.updateAnimatedItemIcons();

    if (this.crosshairPulse > 0) {
      this.crosshairPulse = Math.max(0, this.crosshairPulse - dt * 6);
    }

    this.camera.position.set(
      this.renderPos.x,
      this.renderPos.y + EYE_HEIGHT,
      this.renderPos.z,
    );

    this.renderFrame();

    this.hudAccumulator += dt;
    if (this.hudAccumulator >= 0.08) {
      this.hudAccumulator = 0;
      this.emitHud();
    }

    this.scheduleNextFrame();
  };

  renderFrame() {
    return this.renderSys.renderFrame();
  }
  onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.handCamera.aspect = w / h;
    this.handCamera.updateProjectionMatrix();
    this.panoramaCamera.aspect = w / h;
    this.panoramaCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  onPointerLockChange = () => {
    const wasLocked = this.pointerLocked;
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.pointerLocked = locked;
    if (locked) {
      this.pendingRelockOnInput = false;
    }

    // Browsers consume Esc to cancel pointer lock without firing keydown('Escape').
    // Open the Pause Menu cleanly whenever pointer lock is cancelled during gameplay,
    // unless we just closed a modal (crafting/inventory/furnace) with Escape.
    if (
      wasLocked &&
      !locked &&
      this.phase === 'playing' &&
      performance.now() >= this.suppressAutoPauseUntil
    ) {
      this.resetMiningState();
      this.setPhase('paused');
      return;
    }

    this.emitHud();
  };

  onMouseMove = (e: MouseEvent) => {
    if (this.phase !== 'playing') return;

    // Raw movement deltas are forwarded to the authoritative server, which
    // applies sensitivity once when updating yaw/pitch.
    if (this.pointerLocked) {
      this.pendingLookDx += e.movementX;
      this.pendingLookDy += e.movementY;
      // Predict locally so the camera responds immediately; the server applies
      // the same delta and the next snapshot reconciles authoritative values.
      this.yaw -= e.movementX * 0.0022 * this.mouseSensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * 0.0022 * this.mouseSensitivity,
        -Math.PI / 2 + 0.04,
        Math.PI / 2 - 0.04,
      );
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    } else if (this.isDraggingLook) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      if (Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY) > 5) {
        this.dragMoved = true;
        this.miningHeld = false;
      }
      // Drag-look used a slightly higher sensitivity in the old client; keep
      // the same feel by scaling the raw delta before sending it.
      const dragScale = 0.0045 / 0.0022;
      this.pendingLookDx += dx * dragScale;
      this.pendingLookDy += dy * dragScale;
      this.yaw -= dx * 0.0045 * this.mouseSensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - dy * 0.0045 * this.mouseSensitivity,
        -Math.PI / 2 + 0.04,
        Math.PI / 2 - 0.04,
      );
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
  };

  onMouseDown = (e: MouseEvent) => {
    if (this.phase !== 'playing') return;
    if (e.target !== this.renderer.domElement) return;
    this.sound.unlock();

    if (this.pendingRelockOnInput && !this.pointerLocked) {
      this.pendingRelockOnInput = false;
      this.requestPointerLockSafe();
    }

    if (this.pointerLocked) {
      if (e.button === 0) {
        if (this.mode === 'creative') {
          this.breakTargetedBlock();
        } else {
          // Survival: melee hit immediately if aiming at entity, else hold-to-mine
          if (!this.tryMeleeAttack()) {
            this.miningHeld = true;
          }
        }
      } else if (e.button === 2) {
        this.useOrPlaceAtTarget();
      } else if (e.button === 1) {
        e.preventDefault();
        this.pickTargetedBlock();
      }
    } else {
      if (e.button === 0) {
        this.isDraggingLook = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.dragMoved = false;
        if (this.mode === 'survival') {
          if (!this.tryMeleeAttack()) {
            this.miningHeld = true;
          }
        }
      } else if (e.button === 2) {
        this.useOrPlaceAtTarget();
      } else if (e.button === 1) {
        e.preventDefault();
        this.pickTargetedBlock();
      }
    }
  };

  onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.miningHeld = false;
    }
    if (this.phase !== 'playing') return;
    if (!this.pointerLocked && this.isDraggingLook && e.button === 0) {
      this.isDraggingLook = false;
      if (!this.dragMoved) {
        if (this.mode === 'creative') {
          this.breakTargetedBlock();
        }
        this.requestPointerLockSafe();
      }
    }
  };

  onContextMenu = (e: MouseEvent) => {
    const targetTag = (e.target as HTMLElement | null)?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;
    e.preventDefault();
  };

  onWheel = (e: WheelEvent) => {
    if (this.phase !== 'playing') return;
    if (Math.abs(e.deltaY) < 4) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    this.setActiveSlot(this.activeSlot + dir);
  };

  onKeyDown = (e: KeyboardEvent) => {
    const targetEl = e.target as HTMLElement | null;
    const targetTag = targetEl?.tagName;

    // Escape closes crafting/inventory/furnace menus cleanly even if a search input was focused
    if (e.code === 'Escape') {
      if (e.repeat) return;
      if (
        this.phase === 'inventory' ||
        this.phase === 'crafting' ||
        this.phase === 'furnace'
      ) {
        e.preventDefault();
        if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') {
          targetEl?.blur();
        }
        // Re-request pointer lock immediately and arm silent relock on next input if browser
        // withholds transient user activation on Escape.
        this.pendingRelockOnInput = true;
        this.setPhase('playing');
        return;
      }
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;
      if (this.phase === 'paused') {
        e.preventDefault();
        this.pendingRelockOnInput = true;
        this.setPhase('playing');
        return;
      }
      if (this.phase === 'playing' && performance.now() >= this.suppressAutoPauseUntil) {
        e.preventDefault();
        this.setPhase('paused');
      }
      return;
    }

    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;

    if (e.code === 'KeyP') {
      if (e.repeat) return;
      if (this.phase === 'playing') {
        this.setPhase('paused');
      } else if (
        this.phase === 'paused' ||
        this.phase === 'inventory' ||
        this.phase === 'crafting' ||
        this.phase === 'furnace'
      ) {
        this.setPhase('playing');
      }
      return;
    }

    if (this.phase === 'title') {
      return;
    }

    if (this.phase === 'dead') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.respawnPlayer();
      }
      return;
    }

    if (e.code === 'KeyE') {
      if (e.repeat) return;
      if (this.phase === 'playing') {
        this.setPhase('inventory');
      } else if (
        this.phase === 'inventory' ||
        this.phase === 'crafting' ||
        this.phase === 'furnace'
      ) {
        this.setPhase('playing');
      }
      return;
    }

    if (this.phase !== 'playing') return;

    // If Escape closed a menu and browser blocked pointer lock on Escape, immediately re-lock on first gameplay keypress
    if (this.pendingRelockOnInput && !this.pointerLocked) {
      this.pendingRelockOnInput = false;
      this.requestPointerLockSafe();
    }

    if (e.code === 'F1') {
      e.preventDefault();
      if (!e.repeat) {
        void this.capturePanorama();
      }
      return;
    }

    if (
      e.code === 'Space' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      e.preventDefault();
    }

    const wasHeld = this.heldKeys.has(e.code);
    this.heldKeys.add(e.code);

    if (!wasHeld) {
      if (e.code === 'Space') {
        const now = performance.now();
        if (this.mode === 'creative' && now - this.lastSpaceTap < 270) {
          this.toggleFlyMode();
          this.lastSpaceTap = 0;
        } else {
          this.lastSpaceTap = now;
          this.send({ type: 'jump' });
        }
      } else if (e.code === 'KeyQ') {
        e.preventDefault();
        this.throwHeldItem(e.ctrlKey || e.metaKey);
      } else if (e.code === 'KeyV') {
        this.toggleFlyMode();
      } else if (e.code === 'KeyF') {
        this.pickTargetedBlock();
      } else if (e.code === 'KeyX') {
        if (this.mode === 'creative') {
          this.breakTargetedBlock();
        } else if (!this.tryMeleeAttack()) {
          this.miningHeld = true;
        }
      } else if (e.code === 'KeyB') {
        this.useOrPlaceAtTarget();
      } else if (e.code.startsWith('Digit')) {
        const num = Number(e.code.replace('Digit', ''));
        if (num >= 1 && num <= 9) {
          this.setActiveSlot(num - 1);
        }
      }
    }
  };

  onKeyUp = (e: KeyboardEvent) => {
    this.heldKeys.delete(e.code);
    if (e.code === 'KeyX') {
      this.miningHeld = false;
    }
    if (e.code === 'Escape' && this.pendingRelockOnInput && this.phase === 'playing' && !this.pointerLocked) {
      this.requestPointerLockSafe();
    }
  };

  onWindowBlur = () => {
    this.heldKeys.clear();
    this.isDraggingLook = false;
    this.resetMiningState();
  };

  onContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  onContextRestored = () => {
    this.callbacks.onContextLost(false);
  };

  onVisibilityChange = () => {
    if (document.hidden) {
      void this.saveNow();
    }
  };

  onPageHide = () => {
    void this.saveNow();
  };

  bindEvents() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);

    const dom = this.renderer.domElement;
    dom.addEventListener('mousedown', this.onMouseDown);
    dom.addEventListener('contextmenu', this.onContextMenu);
    dom.addEventListener('wheel', this.onWheel, { passive: true });
    dom.addEventListener('webglcontextlost', this.onContextLost);
    dom.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  public dispose() {
    void this.saveNow();
    this.disposed = true;
    this.serverMessageOff?.();
    this.server.dispose();
    this.transport.dispose();
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    if (this.saveTimeout !== null) window.clearTimeout(this.saveTimeout);

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('pagehide', this.onPageHide);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);

    const dom = this.renderer.domElement;
    dom.removeEventListener('mousedown', this.onMouseDown);
    dom.removeEventListener('contextmenu', this.onContextMenu);
    dom.removeEventListener('wheel', this.onWheel);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('webglcontextrestored', this.onContextRestored);

    for (const pair of this.chunkMeshes.values()) {
      this.disposeChunkPair(pair);
    }
    this.chunkMeshes.clear();

    this.particles.dispose();
    this.wildlife.dispose();
    this.hostiles.dispose();
    this.playerShadowRig.dispose();
    this.droppedItems.dispose();
    this.viewmodel.dispose();
    this.clouds.dispose();

    this.highlightBox.geometry.dispose();
    (this.highlightBox.material as THREE.Material).dispose();
    this.crackOverlayBox.geometry.dispose();
    (this.crackOverlayBox.material as THREE.Material).dispose();
    this.sunMesh.geometry.dispose();
    (this.sunMesh.material as THREE.Material).dispose();
    this.moonMesh.geometry.dispose();
    (this.moonMesh.material as THREE.Material).dispose();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();

    this.opaqueMaterial.dispose();
    this.transparentMaterial.dispose();
    this.atlasTexture.dispose();
    this.crackTexture.dispose();
    for (const tex of this.destroyStageTextures) {
      tex.dispose();
    }
    this.destroyStageTextures = [];
    for (const tex of this.panoramaTextures) {
      tex.dispose();
    }
    this.panoramaTextures = [];
    for (const url of this.panoramaObjectUrls) {
      URL.revokeObjectURL(url);
    }
    this.panoramaObjectUrls = [];
    for (const g of this.panoramaGeometries) g.dispose();
    for (const m of this.panoramaMaterials) m.dispose();
    this.envTexture.dispose();
    this.serverMessageOff?.();
    this.sound.dispose();

    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }

  // ---- server message handling -------------------------------------------

  send(command: ClientCommand): void {
    this.transport.send(command);
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'snapshot':
        this.applySnapshot(message.snapshot);
        break;
      case 'chunk': {
        const { cx, cz, data } = message.chunk;
        this.world.installChunk(cx, cz, data);
        this.rebuildChunk(cx, cz);
        break;
      }
      case 'chunkDelta': {
        const { cx, cz, edits } = message.delta;
        this.world.applyChunkDelta(cx, cz, edits);
        if (edits.length > 0) this.rebuildChunk(cx, cz);
        break;
      }
      case 'chunkUnload':
        this.unloadChunk(message.cx, message.cz);
        break;
      case 'event':
        this.handleEvent(message.event);
        break;
      case 'furnace':
        this.callbacks.onFurnaceChange?.(message.furnace);
        break;
      case 'worldsList':
        this.callbacks.onWorldsUpdated?.(message.worlds);
        break;
      case 'saveResult':
        if (message.worlds) this.callbacks.onWorldsUpdated?.(message.worlds);
        break;
      case 'worldInfo':
        this.mode = message.mode;
        break;
    }
  }

  private applySnapshot(s: ServerSnapshot): void {
    this.snapshot = s;
    const p = s.player;
    this.playerPos.set(p.x, p.y, p.z);
    this.playerVel.set(p.vx, p.vy, p.vz);
    this.serverYaw = p.yaw;
    this.serverPitch = p.pitch;
    this.reconcileLook(p.inputSeq);
    this.grounded = p.grounded;
    this.flying = p.flying;
    this.underwater = p.underwater;
    this.health = p.health;
    this.hunger = p.hunger;
    this.oxygen = p.oxygen;
    this.exhaustion = p.exhaustion;
    this.blocksMined = p.blocksMined;
    this.mobsDefeated = p.mobsDefeated;
    this.survivalSeconds = p.survivalSeconds;
    this.crosshairPulse = p.crosshairPulse;
    this.damageFlash = p.damageFlash;
    this.toastText = p.toastText;
    this.currentTarget = p.currentTarget;
    this.timeOfDay = s.world.timeOfDay;
    this.dayFactor = Math.max(0, Math.min(1, Math.sin(this.timeOfDay * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5));
    this.mode = s.inventory.mode;
    this.creativeHotbar = s.inventory.creativeHotbar;
    this.survivalSlots = s.inventory.survivalSlots;
    this.craftingGrid = s.inventory.craftingGrid;
    this.activeSlot = s.inventory.activeSlot;
    this.furnaces = new Map(Object.entries(s.inventory.furnaces));
    this.activeFurnaceKey = s.inventory.activeFurnaceKey;
    this.worldId = s.world.worldId;
    this.worldName = s.world.worldName;
    this.targetedBlock = s.hud.targetedBlock;
    this.biome = s.hud.biome;

    // Timestamped history lets the render camera stay on a fixed delay even
    // when discrete actions emit extra snapshots mid-tick. Large jumps
    // (respawn / world load) clear the buffer instead of sweeping across map.
    const now = performance.now();
    const last = this.snapshotHistory[this.snapshotHistory.length - 1];
    if (last && (p.x - last.x) ** 2 + (p.y - last.y) ** 2 + (p.z - last.z) ** 2 > 25) {
      this.snapshotHistory.length = 0;
      this.renderPos.set(p.x, p.y, p.z);
    }
    this.snapshotHistory.push({ x: p.x, y: p.y, z: p.z, t: now });
    if (this.snapshotHistory.length > 4) this.snapshotHistory.shift();

    this.viewmodel.setItem(this.survivalSlots[this.activeSlot]?.item ?? null);

    this.emitInventory();
  }

  /**
   * Rebuild predicted angles from the authoritative base plus look deltas the
   * server has not acknowledged yet. Without this, every 20 Hz snapshot would
   * overwrite locally predicted mouse movement and visibly snap the view back.
   */
  private reconcileLook(inputSeq: number): void {
    this.inputSeq = Math.max(this.inputSeq, inputSeq);
    while (this.unackedLook.length > 0 && this.unackedLook[0].seq <= inputSeq) {
      this.unackedLook.shift();
    }

    let yaw = this.serverYaw;
    let pitch = this.serverPitch;
    for (const entry of this.unackedLook) {
      yaw += entry.yaw;
      pitch += entry.pitch;
    }
    if (this.pendingLookDx !== 0 || this.pendingLookDy !== 0) {
      yaw -= this.pendingLookDx * 0.0022 * this.mouseSensitivity;
      pitch -= this.pendingLookDy * 0.0022 * this.mouseSensitivity;
    }
    this.yaw = yaw;
    this.pitch = Math.min(Math.PI / 2 - 0.04, Math.max(-Math.PI / 2 + 0.04, pitch));
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private updateRenderPosition(): void {
    const history = this.snapshotHistory;
    if (history.length === 0) return;
    if (history.length === 1) {
      this.renderPos.set(history[0].x, history[0].y, history[0].z);
      return;
    }

    // Render a fixed snapshot-interval behind the wall clock; jitter in when
    // snapshots arrive only changes which pair we interpolate, not the target.
    const target = performance.now() - SNAPSHOT_INTERVAL * 1000;
    let i = 0;
    while (i < history.length - 2 && history[i + 1].t <= target) i++;
    const a = history[i];
    const b = history[i + 1];
    const span = b.t - a.t;
    const alpha = span > 0 ? Math.min(1, Math.max(0, (target - a.t) / span)) : 1;
    this.renderPos.set(
      a.x + (b.x - a.x) * alpha,
      a.y + (b.y - a.y) * alpha,
      a.z + (b.z - a.z) * alpha,
    );
  }

  private handleEvent(event: GameEvent): void {
    switch (event.type) {
      case 'toast':
        this.toastText = event.text;
        this.toastTimer = 3.2;
        break;
      case 'sound': {
        const fn = (this.sound as unknown as Record<string, ((arg?: unknown) => void) | undefined>)[event.name];
        fn?.call(this.sound, event.arg);
        break;
      }
      case 'particle':
        if (event.kind === 'block') {
          this.particles.spawnBurst(
            event.x, event.y, event.z,
            (event.block ?? BlockType.Stone) as BlockType, event.count,
          );
        } else if (event.kind === 'color') {
          this.particles.spawnColorBurst(event.x, event.y, event.z, event.color ?? '#ffffff', event.count);
        }
        break;
      case 'drop':
        this.droppedItems.spawnDrop(
          event.item, event.count, event.x, event.y, event.z,
          event.vel ? new THREE.Vector3(event.vel.x, event.vel.y, event.vel.z) : undefined,
          event.scale, event.durability,
        );
        break;
      case 'clearEntities':
        this.hostiles.clearAll();
        this.droppedItems.clearAll();
        break;
      case 'clearChunks':
        for (const pair of this.chunkMeshes.values()) this.disposeChunkPair(pair);
        this.chunkMeshes.clear();
        this.world.clearChunks();
        break;
      case 'chunksDirty':
        this.rebuildDirtyChunks(4);
        break;
      case 'fov':
        this.camera.fov = event.value;
        this.camera.updateProjectionMatrix();
        break;
      case 'viewmodel':
        if (event.action === 'swing') this.viewmodel.triggerSwing();
        else this.viewmodel.setItem(this.survivalSlots[this.activeSlot]?.item ?? null);
        break;
      case 'viewmodelFrame':
        this.viewmodel.update(event.dt, event.speedRatio, event.grounded, event.mining);
        break;
      case 'shadow':
        // Follow the smoothed camera position and predicted yaw so the shadow
        // doesn't step at the 20 Hz snapshot boundary.
        this.playerShadowRig.update(0.05, this.world, this.renderPos, this.yaw, 0, event.visible);
        break;
      case 'crack':
        this.applyCrackEvent(event);
        break;
      case 'highlight':
        this.applyHighlightEvent(event);
        break;
      case 'phase':
        // Server-initiated phase changes (e.g. right-clicking a crafting table or
        // furnace) must run the same client transition as local UI actions so the
        // modal opens and pointer lock is released. Duplicate commands are no-ops.
        this.setPhase(event.phase);
        break;
      case 'cameraShake':
        this.cameraShake = Math.max(this.cameraShake, event.amount);
        break;
      case 'hitstop':
        this.hitstopTimer = event.duration;
        break;
      case 'blockBroken':
      case 'blockPlaced':
        this.particles.spawnBurst(event.x, event.y, event.z, event.block, 8);
        break;
    }
  }

  private applyCrackEvent(e: Extract<GameEvent, { type: 'crack' }>): void {
    const m = this.crackOverlayBox.material as THREE.MeshBasicMaterial;
    switch (e.field) {
      case 'visible':
        this.crackOverlayBox.visible = Boolean(e.value);
        break;
      case 'pos':
        this.crackOverlayBox.position.set(e.x ?? 0, e.y ?? 0, e.z ?? 0);
        break;
      case 'scale':
        this.crackOverlayBox.scale.set(e.x ?? 1, e.y ?? 1, e.z ?? 1);
        break;
      case 'stage':
        if (this.destroyStageTextures.length > 0) {
          m.map = this.destroyStageTextures[e.value as number] ?? null;
          m.needsUpdate = true;
        }
        break;
      case 'opacity':
        m.opacity = e.value as number;
        break;
    }
  }

  private applyHighlightEvent(e: Extract<GameEvent, { type: 'highlight' }>): void {
    switch (e.field) {
      case 'visible':
        this.highlightBox.visible = Boolean(e.value);
        break;
      case 'pos':
        this.highlightBox.position.set(e.x ?? 0, e.y ?? 0, e.z ?? 0);
        break;
      case 'scale':
        this.highlightBox.scale.set(e.x ?? 1, e.y ?? 1, e.z ?? 1);
        break;
    }
  }

  private rebuildChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (!this.world.hasChunk(cx, cz)) return;
    const existing = this.chunkMeshes.get(key);
    if (existing) this.disposeChunkPair(existing);
    const bundle = buildChunkGeometry(this.world, cx, cz);
    let opaqueMesh: THREE.Mesh | null = null;
    let transMesh: THREE.Mesh | null = null;
    if (bundle.opaque) {
      opaqueMesh = new THREE.Mesh(bundle.opaque, this.opaqueMaterial);
      opaqueMesh.castShadow = true;
      opaqueMesh.receiveShadow = true;
      this.worldGroup.add(opaqueMesh);
    }
    if (bundle.transparent) {
      transMesh = new THREE.Mesh(bundle.transparent, this.transparentMaterial);
      transMesh.receiveShadow = true;
      transMesh.renderOrder = 2;
      this.worldGroup.add(transMesh);
    }
    this.chunkMeshes.set(key, { opaque: opaqueMesh, transparent: transMesh });
  }

  private unloadChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const pair = this.chunkMeshes.get(key);
    if (pair) {
      this.disposeChunkPair(pair);
      this.chunkMeshes.delete(key);
    }
    this.world.unloadChunk(cx, cz);
  }

  private pendingLookDx = 0;
  private pendingLookDy = 0;
  private biome = 'Sunlit Meadow';
  private targetedBlock: string | null = null;

}
