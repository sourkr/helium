import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SoundEngine } from './audio';
import {
  BLOCK_DEFS,
  BlockType,
  DEFAULT_HOTBAR,
  isBedBlock,
  isDoorBlock,
  isLeafBlock,
  isLiquidBlock,
  isLogBlock,
  isPlantBlock,
  isReplaceableBlock,
  isSolidBlock,
  TerrainPreset,
  TimePreset,
} from './blocks';
import {
  DroppedItemManager,
  HeldBlockViewmodel,
  HostileMobManager,
  ParticlePool,
  PlayerShadowRig,
  VoxelClouds,
  WildlifeManager,
} from './entities';
import { buildChunkGeometry } from './mesher';
import {
  addItemToInventory,
  CRAFTING_RECIPES,
  createEmptyFurnaceData,
  createStarterSurvivalInventory,
  createSurvivalItemIcons,
  damageToolSlot,
  executeCraftRecipeBatch,
  FurnaceData,
  GameMode,
  getBlockDrop,
  getFuelBurnTime,
  getMiningDuration,
  getRecipeGridPreview,
  getSmeltingRecipe,
  HOTBAR_SIZE,
  InventorySlot,
  ITEM_DEFS,
  ItemType,
  matchCraftingGrid,
  recipeFitsInGridSize,
} from './survival';
import {
  AnimatedAtlasTile,
  applyUserAssetsToAtlas,
  buildVoxelSpriteGeometriesFromUrls,
} from './assetPack';
import {
  deleteOpfsPanorama,
  FullWorldSave,
  loadOpfsPanorama,
  saveOpfsPanorama,
  saveOpfsWorld,
  WorldSummary,
} from './opfsStorage';
import {
  ATLAS_COLS,
  buildBlockIconsFromAtlas,
  createProceduralAtlas,
  TILE_PIXELS,
} from './textures';
import {
  CHUNK_HEIGHT,
  CHUNK_SIZE,
  chunkKey,
  RaycastHit,
  SEA_LEVEL,
  VoxelWorld,
} from './world';

export type GamePhase =
  | 'title'
  | 'playing'
  | 'paused'
  | 'inventory'
  | 'crafting'
  | 'furnace'
  | 'dead';

export interface HudSnapshot {
  mode: GameMode;
  fps: number;
  x: number;
  y: number;
  z: number;
  biome: string;
  flying: boolean;
  underwater: boolean;
  pointerLocked: boolean;
  targetedBlock: string | null;
  editCount: number;
  timeOfDay: number;
  crosshairPulse: number;
  // Survival vitals & stats
  health: number;
  maxHealth: number;
  hunger: number;
  maxHunger: number;
  oxygen: number;
  maxOxygen: number;
  miningProgress: number;
  damageFlash: number;
  toastText: string | null;
  blocksMined: number;
  mobsDefeated: number;
  survivalSeconds: number;
}

export interface EngineSettings {
  fov: number;
  mouseSensitivity: number;
  renderDistance: number;
  muted: boolean;
  showFps: boolean;
  playerShadow: boolean;
  entityShadows: boolean;
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onInventoryChange: (
    mode: GameMode,
    creativeHotbar: ItemType[],
    survivalSlots: Array<InventorySlot | null>,
    craftingGrid: Array<InventorySlot | null>,
    activeSlot: number,
  ) => void;
  onFurnaceChange?: (furnace: FurnaceData | null) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onAssetsReady: (itemIcons: Record<number, string>) => void;
  onContextLost: (lost: boolean) => void;
  onWorldsUpdated?: (worlds: WorldSummary[]) => void;
  onPanoramaChange?: (hasPanorama: boolean) => void;
}

interface ChunkMeshPair {
  opaque: THREE.Mesh | null;
  transparent: THREE.Mesh | null;
}

const RENDER_RADIUS = 4;
const PLAYER_HALF_WIDTH = 0.3;
const PLAYER_HEIGHT = 1.75;
const EYE_HEIGHT = 1.56;
const GRAVITY = 24.5;
const JUMP_SPEED = 8.4;
const WALK_SPEED = 5.4;
const SPRINT_SPEED = 8.2;
const FLY_SPEED = 11.5;

const TIME_PRESET_VALUES: Record<TimePreset, number> = {
  dawn: 0.24,
  noon: 0.48,
  sunset: 0.74,
  night: 0.96,
};

// Module-scoped zero-GC math helpers
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _skyDay = new THREE.Color('#8bc6f7');
const _skySunset = new THREE.Color('#e38b5b');
const _skyDawn = new THREE.Color('#f0a875');
const _skyNight = new THREE.Color('#0f192b');
const _curSky = new THREE.Color();
const _sunColorDay = new THREE.Color('#fff5dc');
const _sunColorWarm = new THREE.Color('#ffaa66');
const _sunColorNight = new THREE.Color('#6b88c9');
const _curSunColor = new THREE.Color();
const _hemiSkyDay = new THREE.Color('#9ad0ff');
const _hemiSkyNight = new THREE.Color('#2a3d66');
const _curHemiSky = new THREE.Color();
const _hemiGroundDay = new THREE.Color('#5a6b4e');
const _hemiGroundNight = new THREE.Color('#161b24');
const _curHemiGround = new THREE.Color();
const _cloudDay = new THREE.Color('#ffffff');
const _cloudWarm = new THREE.Color('#ffd4b0');
const _cloudNight = new THREE.Color('#2d3e5e');
const _curCloud = new THREE.Color();

function detectSoftwareGl(): boolean {
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) || '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

function createCrackTexture(): THREE.CanvasTexture {
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

export class VoxelEngine {
  private readonly container: HTMLDivElement;
  private readonly callbacks: EngineCallbacks;
  private readonly isSoftwareGl: boolean;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly handScene: THREE.Scene;
  private readonly handCamera: THREE.PerspectiveCamera;
  private readonly handHemiLight: THREE.HemisphereLight;
  private readonly handDirLight: THREE.DirectionalLight;
  private readonly panoramaScene: THREE.Scene;
  private readonly panoramaCamera: THREE.PerspectiveCamera;
  private readonly panoramaMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly panoramaGeometries: THREE.BufferGeometry[] = [];
  private panoramaTextures: THREE.Texture[] = [];
  private panoramaObjectUrls: string[] = [];
  private hasPanorama = false;
  private panoramaYaw = 0;
  private panoramaTime = 0;
  private capturingPanorama = false;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly fog: THREE.Fog;
  private readonly envTexture: THREE.Texture;

  private readonly atlasCanvas: HTMLCanvasElement;
  private readonly atlasTexture: THREE.CanvasTexture;
  private animatedAtlasTiles: AnimatedAtlasTile[] = [];
  private animatedAtlasLastFrames: number[] = [];
  private animatedAtlasClock = 0;
  private readonly crackTexture: THREE.CanvasTexture;
  private destroyStageTextures: THREE.Texture[] = [];
  private lastCrackStage = -1;
  private readonly opaqueMaterial: THREE.MeshStandardMaterial;
  private readonly transparentMaterial: THREE.MeshStandardMaterial;

  private readonly worldGroup = new THREE.Group();
  private readonly chunkMeshes = new Map<string, ChunkMeshPair>();
  private readonly highlightBox: THREE.LineSegments;
  private readonly crackOverlayBox: THREE.Mesh;

  private readonly particles: ParticlePool;
  private readonly viewmodel: HeldBlockViewmodel;
  private readonly clouds: VoxelClouds;
  private readonly celestialGroup = new THREE.Group();
  private readonly sunMesh: THREE.Mesh;
  private readonly moonMesh: THREE.Mesh;
  private readonly stars: THREE.Points;

  private wildlife: WildlifeManager;
  private readonly hostiles: HostileMobManager;
  private readonly playerShadowRig: PlayerShadowRig;
  private readonly droppedItems: DroppedItemManager;
  private world: VoxelWorld;
  public readonly sound = new SoundEngine();

  // Active World Metadata (persisted in OPFS)
  private worldId = '';
  private worldName = 'Meadows Valley';
  private worldCreatedAt = Date.now();
  private worldReadyForSave = false;

  // Game, Inventory & Furnace state
  private phase: GamePhase = 'title';
  private mode: GameMode = 'survival';
  private creativeHotbar: ItemType[] = [...DEFAULT_HOTBAR] as unknown as ItemType[];
  private survivalSlots: Array<InventorySlot | null> = createStarterSurvivalInventory();
  private craftingGrid: Array<InventorySlot | null> = new Array(9).fill(null);
  private furnaces = new Map<string, FurnaceData>();
  private activeFurnaceKey: string | null = null;
  private furnaceUiAccum = 0;
  private activeSlot = 0;
  private pendingRelockOnInput = false;

  // Player physics & vitals
  private playerPos = new THREE.Vector3(0.5, 22, 4.5);
  private playerVel = new THREE.Vector3();
  private yaw = -0.35;
  private pitch = -0.06;
  private grounded = false;
  private flying = false;
  private underwater = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private lastSpaceTap = 0;
  private stepDist = 0;
  private cameraShake = 0;
  private crosshairPulse = 0;
  private currentTarget: RaycastHit | null = null;
  private peakAirY = 22;

  // Survival vitals & combat
  private health = 20;
  private readonly maxHealth = 20;
  private hunger = 20;
  private readonly maxHunger = 20;
  private oxygen = 10;
  private readonly maxOxygen = 10;
  private exhaustion = 0;
  private regenTimer = 0;
  private starveTimer = 0;
  private drownTimer = 0;
  private hurtCooldown = 0;
  private damageFlash = 0;
  private hitstopTimer = 0;
  private blocksMined = 0;
  private mobsDefeated = 0;
  private survivalSeconds = 0;
  private toastText: string | null = null;
  private toastTimer = 0;

  // Progressive survival mining state
  private miningHeld = false;
  private miningBlockKey: string | null = null;
  private miningElapsed = 0;
  private miningDuration = 0.5;
  private miningTickAccum = 0;

  // Minecraft-style natural leaf decay & bed respawn point
  private leafDecayQueue: Array<{ x: number; y: number; z: number; delay: number }> = [];
  private leafDecaySet = new Set<string>();
  private leafRandomTickAccum = 0;
  private bedSpawnPoint: { x: number; y: number; z: number } | null = null;

  // Dynamic time of day
  private timeOfDay = 0.44;
  private targetTimeOfDay: number | null = null;
  private dayFactor = 1;

  // Input tracking
  private readonly heldKeys = new Set<string>();
  private pointerLocked = false;
  private isDraggingLook = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragMoved = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private suppressAutoPauseUntil = 0;

  // User-configurable settings
  private baseFov = 72;
  private mouseSensitivity = 1.0;
  private renderRadius = RENDER_RADIUS;
  private playerShadowEnabled = true;
  private entityShadowsEnabled = true;

  // Loop & lifecycle
  private disposed = false;
  private frameId = 0;
  private lastFrameMs = 0;
  private fps = 60;
  private fpsFrames = 0;
  private fpsAccum = 0;
  private hudAccumulator = 0;
  private autosaveAccumulator = 0;
  private saveTimeout: number | null = null;
  private lastChunkCenterX = Number.NaN;
  private lastChunkCenterZ = Number.NaN;
  private pendingChunkQueue: Array<[number, number]> = [];

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
    this.atlasTexture = atlas.atlasTexture;
    this.crackTexture = createCrackTexture();
    this.callbacks.onAssetsReady({ ...atlas.blockIcons, ...survivalIcons });

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
      (itemOverrides, itemGeometries, destroyStages, _loadedCount, animatedTiles) => {
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
        this.callbacks.onAssetsReady({
          ...updatedBlockIcons,
          ...survivalIcons,
          ...itemOverrides,
        });
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

    this.initializeSpawnAndCoreChunks();
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

  private applyPanoramaTextures(textures: THREE.Texture[], objectUrls: string[] = []) {
    for (const prev of this.panoramaTextures) prev.dispose();
    for (const prevUrl of this.panoramaObjectUrls) URL.revokeObjectURL(prevUrl);
    this.panoramaTextures = textures;
    this.panoramaObjectUrls = objectUrls;

    for (let i = 0; i < this.panoramaMaterials.length; i++) {
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
      this.panoramaMaterials[i].map = tex;
      this.panoramaMaterials[i].needsUpdate = true;
    }

    this.hasPanorama = textures.length === 6;
    this.callbacks.onPanoramaChange?.(this.hasPanorama);
  }

  private async loadSavedPanoramaFromOpfs(): Promise<void> {
    const urls = await loadOpfsPanorama();
    if (!urls || this.disposed) {
      if (urls) {
        urls.forEach((u) => {
          if (u.startsWith('blob:')) URL.revokeObjectURL(u);
        });
      }
      this.callbacks.onPanoramaChange?.(false);
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
    if (this.disposed || imgs.some((img) => !img)) {
      blobUrls.forEach((u) => URL.revokeObjectURL(u));
      if (!this.disposed) this.callbacks.onPanoramaChange?.(false);
      return;
    }

    const textures = imgs.map((img) => new THREE.Texture(img!));
    this.applyPanoramaTextures(textures, blobUrls);
  }

  public async clearPanorama(): Promise<void> {
    await deleteOpfsPanorama();
    if (this.disposed) return;
    this.applyPanoramaTextures([], []);
  }

  public async capturePanorama(): Promise<boolean> {
    if (this.disposed || this.capturingPanorama || this.phase !== 'playing') return false;
    this.capturingPanorama = true;

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

    const prevHighlightVis = this.highlightBox.visible;
    const prevCrackVis = this.crackOverlayBox.visible;
    const prevHandVis = this.viewmodel.group.visible;
    const prevPlayerShadowVis = this.playerShadowRig.root.visible;
    const prevPixelRatio = this.renderer.getPixelRatio();
    const prevSize = new THREE.Vector2();
    this.renderer.getSize(prevSize);

    const capturedCanvases: HTMLCanvasElement[] = [];

    try {
      this.highlightBox.visible = false;
      this.crackOverlayBox.visible = false;
      this.viewmodel.group.visible = false;
      this.playerShadowRig.root.visible = false;

      const panoCam = new THREE.PerspectiveCamera(90, 1, 0.08, 220);
      panoCam.position.copy(this.camera.position);

      this.renderer.setPixelRatio(1);
      this.renderer.setSize(faceSize, faceSize, false);

      for (const orient of faceOrientations) {
        panoCam.up.set(orient.up[0], orient.up[1], orient.up[2]);
        panoCam.lookAt(
          panoCam.position.x + orient.dir[0],
          panoCam.position.y + orient.dir[1],
          panoCam.position.z + orient.dir[2],
        );
        panoCam.updateMatrixWorld();

        this.renderer.clear();
        this.renderer.render(this.scene, panoCam);

        const c = document.createElement('canvas');
        c.width = faceSize;
        c.height = faceSize;
        const cctx = c.getContext('2d')!;
        cctx.drawImage(this.renderer.domElement, 0, 0, faceSize, faceSize);
        capturedCanvases.push(c);
      }
    } finally {
      this.renderer.setPixelRatio(prevPixelRatio);
      this.renderer.setSize(prevSize.x, prevSize.y, false);
      this.highlightBox.visible = prevHighlightVis;
      this.crackOverlayBox.visible = prevCrackVis;
      this.viewmodel.group.visible = prevHandVis;
      this.playerShadowRig.root.visible = prevPlayerShadowVis;
      this.renderFrame();
    }

    if (capturedCanvases.length !== 6) {
      this.capturingPanorama = false;
      return false;
    }

    try {
      const liveTextures = capturedCanvases.map((c) => new THREE.CanvasTexture(c));
      this.applyPanoramaTextures(liveTextures, []);

      const blobs = await Promise.all(
        capturedCanvases.map(
          (c) =>
            new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/png')),
        ),
      );
      if (blobs.some((b) => !b)) {
        this.capturingPanorama = false;
        return false;
      }

      const saved = await saveOpfsPanorama(blobs as Blob[]);
      if (!this.disposed) {
        this.sound.playCraft();
        this.showToast(
          saved
            ? 'Panorama saved for Main Menu!'
            : 'Panorama captured for this session',
        );
      }
      this.capturingPanorama = false;
      return saved;
    } catch {
      this.capturingPanorama = false;
      return false;
    }
  }

  public getWorldInfo(): {
    id: string;
    name: string;
    seed: number;
    preset: TerrainPreset;
    mode: GameMode;
  } {
    return {
      id: this.worldId,
      name: this.worldName,
      seed: this.world.seed,
      preset: this.world.preset,
      mode: this.mode,
    };
  }

  public setWorldName(name: string) {
    const trimmed = name.trim();
    if (trimmed) {
      this.worldName = trimmed;
    }
  }

  private cloneFurnaceData(f: FurnaceData): FurnaceData {
    return {
      input: f.input ? { ...f.input } : null,
      fuel: f.fuel ? { ...f.fuel } : null,
      output: f.output ? { ...f.output } : null,
      burnTime: f.burnTime,
      burnTotal: f.burnTotal,
      cookTime: f.cookTime,
      cookTotal: f.cookTotal,
    };
  }

  public exportFullSave(): FullWorldSave {
    const worldData = this.world.exportSave();
    const furnacesRecord: Record<string, FurnaceData> = {};
    for (const [key, data] of this.furnaces.entries()) {
      furnacesRecord[key] = this.cloneFurnaceData(data);
    }
    return {
      id: this.worldId,
      name: this.worldName,
      seed: worldData.seed,
      preset: worldData.preset,
      mode: this.mode,
      timeOfDay: this.timeOfDay,
      createdAt: this.worldCreatedAt,
      updatedAt: Date.now(),
      edits: worldData.edits,
      player: {
        x: this.playerPos.x,
        y: this.playerPos.y,
        z: this.playerPos.z,
        yaw: this.yaw,
        pitch: this.pitch,
        flying: this.flying,
        health: this.health,
        hunger: this.hunger,
        oxygen: this.oxygen,
        exhaustion: this.exhaustion,
        activeSlot: this.activeSlot,
        creativeHotbar: [...this.creativeHotbar],
        survivalSlots: this.survivalSlots.map((s) => (s ? { ...s } : null)),
        furnaces: furnacesRecord,
        blocksMined: this.blocksMined,
        mobsDefeated: this.mobsDefeated,
        survivalSeconds: Math.floor(this.survivalSeconds),
      },
    };
  }

  public async saveNow(): Promise<WorldSummary[] | null> {
    if (this.saveTimeout !== null) {
      window.clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    if (!this.worldReadyForSave || !this.worldId) return null;
    try {
      const { worlds } = await saveOpfsWorld(this.exportFullSave());
      if (!this.disposed) {
        this.callbacks.onWorldsUpdated?.(worlds);
      }
      return worlds;
    } catch {
      return null;
    }
  }

  private scheduleSave() {
    if (!this.worldReadyForSave || !this.worldId) return;
    if (this.saveTimeout !== null) {
      window.clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = window.setTimeout(() => {
      this.saveTimeout = null;
      void this.saveNow();
    }, 400);
  }

  public loadWorldState(save: FullWorldSave) {
    if (this.saveTimeout !== null) {
      window.clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    for (const pair of this.chunkMeshes.values()) {
      this.disposeChunkPair(pair);
    }
    this.chunkMeshes.clear();
    this.pendingChunkQueue = [];
    this.hostiles.clearAll();
    this.droppedItems.clearAll();

    this.scene.remove(this.wildlife.root);
    this.wildlife.dispose();

    this.worldId = save.id;
    this.worldName = save.name;
    this.worldCreatedAt = save.createdAt;
    this.mode = save.mode;
    this.timeOfDay = typeof save.timeOfDay === 'number' ? save.timeOfDay : 0.44;
    this.targetTimeOfDay = null;
    this.autosaveAccumulator = 0;

    this.world = new VoxelWorld(save.seed, save.preset, save.edits);
    this.wildlife = new WildlifeManager(this.world, 7);
    this.wildlife.setShadowsEnabled(this.entityShadowsEnabled);
    this.scene.add(this.wildlife.root);

    this.craftingGrid.fill(null);
    this.furnaces.clear();
    this.activeFurnaceKey = null;
    this.leafDecayQueue = [];
    this.leafDecaySet.clear();
    this.leafRandomTickAccum = 0;
    this.bedSpawnPoint = null;
    const p = save.player;
    if (p) {
      this.flying = this.mode === 'creative' ? Boolean(p.flying) : false;
      this.health = Math.max(2, Math.min(this.maxHealth, p.health ?? this.maxHealth));
      this.hunger = Math.max(0, Math.min(this.maxHunger, p.hunger ?? this.maxHunger));
      this.oxygen = Math.max(0, Math.min(this.maxOxygen, p.oxygen ?? this.maxOxygen));
      this.exhaustion = Math.max(0, p.exhaustion ?? 0);
      this.activeSlot = ((p.activeSlot ?? 0) % HOTBAR_SIZE + HOTBAR_SIZE) % HOTBAR_SIZE;
      this.creativeHotbar =
        Array.isArray(p.creativeHotbar) && p.creativeHotbar.length === HOTBAR_SIZE
          ? p.creativeHotbar.map((item, idx) =>
              item in ITEM_DEFS
                ? item
                : ((DEFAULT_HOTBAR[idx] ?? BlockType.WhiteWool) as unknown as ItemType),
            )
          : ([...DEFAULT_HOTBAR] as unknown as ItemType[]);
      this.survivalSlots =
        Array.isArray(p.survivalSlots) && p.survivalSlots.length === 27
          ? p.survivalSlots.map((s) => (s && s.item in ITEM_DEFS ? { ...s } : null))
          : createStarterSurvivalInventory();
      if (p.furnaces && typeof p.furnaces === 'object') {
        for (const [k, f] of Object.entries(p.furnaces)) {
          if (f && typeof f === 'object') {
            this.furnaces.set(k, this.cloneFurnaceData(f));
          }
        }
      }
      this.blocksMined = p.blocksMined ?? 0;
      this.mobsDefeated = p.mobsDefeated ?? 0;
      this.survivalSeconds = p.survivalSeconds ?? 0;
    } else {
      this.flying = false;
      this.health = this.maxHealth;
      this.hunger = this.maxHunger;
      this.oxygen = this.maxOxygen;
      this.exhaustion = 0;
      this.activeSlot = 0;
      this.creativeHotbar = [...DEFAULT_HOTBAR] as unknown as ItemType[];
      this.survivalSlots = createStarterSurvivalInventory();
      this.blocksMined = 0;
      this.mobsDefeated = 0;
      this.survivalSeconds = 0;
    }

    this.damageFlash = 0;
    this.hurtCooldown = 0;
    this.resetMiningState();

    const hasSavedCoords = p !== null && typeof p.y === 'number' && p.y >= 1 && p.y < CHUNK_HEIGHT;
    const targetX = hasSavedCoords ? p.x : 0.5;
    const targetZ = hasSavedCoords ? p.z : 4.5;
    const centerCX = Math.floor(targetX / CHUNK_SIZE);
    const centerCZ = Math.floor(targetZ / CHUNK_SIZE);

    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.world.ensureChunk(centerCX + dx, centerCZ + dz);
      }
    }
    this.rebuildDirtyChunks(30);

    if (hasSavedCoords) {
      let safeY = p.y;
      if (this.collidesAt(targetX, safeY, targetZ)) {
        safeY = this.world.getGroundY(targetX, targetZ) + 0.05;
      }
      this.playerPos.set(targetX, safeY, targetZ);
      this.yaw = typeof p.yaw === 'number' ? p.yaw : -0.35;
      this.pitch = typeof p.pitch === 'number' ? p.pitch : -0.06;
    } else {
      const spawnY = this.world.getGroundY(0.5, 4.5);
      this.playerPos.set(0.5, spawnY + 0.05, 4.5);
      this.yaw = -0.35;
      this.pitch = -0.06;
    }

    this.peakAirY = this.playerPos.y;
    this.playerVel.set(0, 0, 0);

    this.camera.position.set(
      this.playerPos.x,
      this.playerPos.y + EYE_HEIGHT,
      this.playerPos.z,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    this.lastChunkCenterX = Number.NaN;
    this.lastChunkCenterZ = Number.NaN;
    this.queueSurroundingChunks();

    this.worldReadyForSave = true;
    this.syncViewmodel();
    this.updateAtmosphere(0);
    this.emitInventory();
    this.emitHud();
  }

  private initializeSpawnAndCoreChunks() {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.world.ensureChunk(dx, dz);
      }
    }
    this.rebuildDirtyChunks(30);

    const spawnY = this.world.getGroundY(0.5, 4.5);
    this.playerPos.set(0.5, spawnY + 0.05, 4.5);
    this.peakAirY = this.playerPos.y;
    this.playerVel.set(0, 0, 0);
    this.yaw = -0.35;
    this.pitch = -0.06;

    // Position static scenic spawn camera immediately (no spinning panorama)
    this.camera.position.set(
      this.playerPos.x,
      this.playerPos.y + EYE_HEIGHT,
      this.playerPos.z,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    this.lastChunkCenterX = Number.NaN;
    this.lastChunkCenterZ = Number.NaN;
    this.queueSurroundingChunks();
  }

  public setGameMode(nextMode: GameMode) {
    if (this.mode === nextMode) return;
    this.mode = nextMode;
    this.resetMiningState();
    if (nextMode === 'survival') {
      this.flying = false;
      this.health = Math.max(this.health, 20);
      this.hunger = Math.max(this.hunger, 20);
      this.oxygen = this.maxOxygen;
      this.showToast('Survival Mode');
    } else {
      this.hostiles.clearAll();
      this.damageFlash = 0;
      this.showToast('Creative Mode');
    }
    this.syncViewmodel();
    this.emitInventory();
    this.scheduleSave();
    this.emitHud();
  }

  public regenerateWorld(seed: number, preset: TerrainPreset) {
    for (const pair of this.chunkMeshes.values()) {
      this.disposeChunkPair(pair);
    }
    this.chunkMeshes.clear();
    this.pendingChunkQueue = [];
    this.hostiles.clearAll();
    this.droppedItems.clearAll();

    this.scene.remove(this.wildlife.root);
    this.wildlife.dispose();

    this.world = new VoxelWorld(seed, preset);
    this.wildlife = new WildlifeManager(this.world, 7);
    this.wildlife.setShadowsEnabled(this.entityShadowsEnabled);
    this.scene.add(this.wildlife.root);

    this.flying = false;
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.oxygen = this.maxOxygen;
    this.exhaustion = 0;
    this.timeOfDay = 0.44;
    this.targetTimeOfDay = null;
    this.survivalSlots = createStarterSurvivalInventory();
    this.furnaces.clear();
    this.activeFurnaceKey = null;
    this.leafDecayQueue = [];
    this.leafDecaySet.clear();
    this.leafRandomTickAccum = 0;
    this.bedSpawnPoint = null;
    this.blocksMined = 0;
    this.mobsDefeated = 0;
    this.survivalSeconds = 0;
    this.resetMiningState();

    this.initializeSpawnAndCoreChunks();
    this.syncViewmodel();
    this.updateAtmosphere(0);
    this.emitInventory();
    void this.saveNow();
    this.emitHud();
  }

  public resetWorldEdits() {
    this.regenerateWorld(this.world.seed, this.world.preset);
  }

  public respawnPlayer() {
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.oxygen = this.maxOxygen;
    this.exhaustion = 0;
    this.damageFlash = 0;
    this.hurtCooldown = 1.5;
    this.flying = false;
    this.hostiles.clearAll();
    this.resetMiningState();

    let respawnedAtBed = false;
    if (this.bedSpawnPoint) {
      const bx = Math.floor(this.bedSpawnPoint.x);
      const by = Math.floor(this.bedSpawnPoint.y - 0.1);
      const bz = Math.floor(this.bedSpawnPoint.z);
      if (isBedBlock(this.world.getBlock(bx, by, bz))) {
        this.playerPos.set(
          this.bedSpawnPoint.x,
          this.bedSpawnPoint.y + 0.05,
          this.bedSpawnPoint.z,
        );
        respawnedAtBed = true;
      } else {
        this.bedSpawnPoint = null;
      }
    }

    if (!respawnedAtBed) {
      const spawnY = this.world.getGroundY(0.5, 4.5);
      this.playerPos.set(0.5, spawnY + 0.05, 4.5);
    }
    this.peakAirY = this.playerPos.y;
    this.playerVel.set(0, 0, 0);
    this.yaw = -0.35;
    this.pitch = -0.06;

    this.setPhase('playing');
    this.showToast(respawnedAtBed ? 'Respawned at Bed' : 'Respawned at Trailhead');
    this.scheduleSave();
  }

  public setPhase(phase: GamePhase, options?: { skipPointerLock?: boolean }) {
    if (this.phase === phase) return;
    const prevPhase = this.phase;
    this.phase = phase;
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
        this.playerPos.x,
        this.playerPos.y + EYE_HEIGHT,
        this.playerPos.z,
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

  public requestPointerLockSafe() {
    try {
      const el = this.renderer.domElement;
      if (el.requestPointerLock) {
        const res = el.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      }
    } catch {
      // Fallback drag-look remains active automatically
    }
  }

  public setTimePreset(preset: TimePreset) {
    this.targetTimeOfDay = TIME_PRESET_VALUES[preset];
    this.sound.playUiTick();
    this.scheduleSave();
  }

  public setActiveSlot(slot: number) {
    const clamped = ((slot % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    if (clamped !== this.activeSlot) {
      this.activeSlot = clamped;
      this.resetMiningState();
      this.syncViewmodel();
      this.sound.playUiTick();
      this.emitInventory();
      this.scheduleSave();
    }
  }

  public assignBlockToActiveSlot(item: ItemType) {
    if (this.mode !== 'creative') return;
    const existingIdx = this.creativeHotbar.indexOf(item);
    if (existingIdx !== -1) {
      this.activeSlot = existingIdx;
    } else {
      this.creativeHotbar[this.activeSlot] = item;
    }
    this.syncViewmodel();
    this.sound.playUiTick();
    this.emitInventory();
    this.scheduleSave();
  }

  public swapSurvivalSlots(fromIdx: number, toIdx: number) {
    if (
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= this.survivalSlots.length ||
      toIdx >= this.survivalSlots.length ||
      fromIdx === toIdx
    ) {
      return;
    }
    const a = this.survivalSlots[fromIdx];
    const b = this.survivalSlots[toIdx];
    // Merge stacks if identical stackable item
    if (a && b && a.item === b.item) {
      const maxStack = ITEM_DEFS[a.item]?.maxStack ?? 64;
      if (maxStack > 1 && b.count < maxStack) {
        const transfer = Math.min(maxStack - b.count, a.count);
        b.count += transfer;
        a.count -= transfer;
        if (a.count <= 0) this.survivalSlots[fromIdx] = null;
        this.sound.playUiTick();
        this.syncViewmodel();
        this.emitInventory();
        this.scheduleSave();
        return;
      }
    }
    this.survivalSlots[fromIdx] = b;
    this.survivalSlots[toIdx] = a;
    this.sound.playUiTick();
    this.syncViewmodel();
    this.emitInventory();
    this.scheduleSave();
  }

  private getActiveCraftingGridSize(): 2 | 3 {
    return this.phase === 'crafting' ? 3 : 2;
  }

  public placeInventoryItemIntoGrid(invIdx: number, gridIdx: number, count = 1): boolean {
    const gridSize = this.getActiveCraftingGridSize();
    const maxCells = gridSize * gridSize;
    if (
      invIdx < 0 ||
      invIdx >= this.survivalSlots.length ||
      gridIdx < 0 ||
      gridIdx >= maxCells
    ) {
      return false;
    }
    const src = this.survivalSlots[invIdx];
    if (!src || src.count <= 0) return false;

    const dst = this.craftingGrid[gridIdx];
    const maxStack = ITEM_DEFS[src.item]?.maxStack ?? 64;
    if (dst && dst.item !== src.item) {
      // Return previous item in cell before placing the new one
      addItemToInventory(this.survivalSlots, dst.item, dst.count, dst.durability);
      this.craftingGrid[gridIdx] = null;
    }

    const activeDst = this.craftingGrid[gridIdx];
    const space = activeDst ? maxStack - activeDst.count : maxStack;
    const move = Math.min(src.count, count, space);
    if (move <= 0) return false;

    if (activeDst) {
      activeDst.count += move;
    } else {
      this.craftingGrid[gridIdx] =
        src.durability !== undefined
          ? { item: src.item, count: move, durability: src.durability }
          : { item: src.item, count: move };
    }
    src.count -= move;
    if (src.count <= 0) {
      this.survivalSlots[invIdx] = null;
    }

    this.sound.playUiTick();
    this.syncViewmodel();
    this.emitInventory();
    this.scheduleSave();
    return true;
  }

  public returnGridCellToInventory(gridIdx: number) {
    if (gridIdx < 0 || gridIdx >= 9) return;
    const cell = this.craftingGrid[gridIdx];
    if (!cell) return;
    addItemToInventory(this.survivalSlots, cell.item, cell.count, cell.durability);
    this.craftingGrid[gridIdx] = null;
    this.sound.playUiTick();
    this.syncViewmodel();
    this.emitInventory();
    this.scheduleSave();
  }

  public clearCraftingGrid(silent = false) {
    let changed = false;
    for (let i = 0; i < 9; i++) {
      const cell = this.craftingGrid[i];
      if (cell) {
        addItemToInventory(this.survivalSlots, cell.item, cell.count, cell.durability);
        this.craftingGrid[i] = null;
        changed = true;
      }
    }
    if (changed) {
      if (!silent) this.sound.playUiTick();
      this.syncViewmodel();
      this.emitInventory();
      this.scheduleSave();
    }
  }

  public fillCraftingGridFromRecipe(recipeId: string): boolean {
    const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return false;
    const gridSize = this.getActiveCraftingGridSize();
    if (!recipeFitsInGridSize(recipe, gridSize)) {
      this.showToast('Requires a Crafting Table');
      return false;
    }

    this.clearCraftingGrid(true);

    // Check ingredients exist
    const patternCells = getRecipeGridPreview(recipe, gridSize);
    const needed = new Map<ItemType, number>();
    for (const item of patternCells) {
      if (item !== null) {
        needed.set(item, (needed.get(item) ?? 0) + 1);
      }
    }
    for (const [item, req] of needed.entries()) {
      let have = 0;
      for (const s of this.survivalSlots) {
        if (s && s.item === item) have += s.count;
      }
      if (have < req) {
        this.syncViewmodel();
        this.emitInventory();
        return false;
      }
    }

    // Pull 1 unit per pattern cell from inventory into the active crafting grid
    const cellCount = gridSize * gridSize;
    for (let i = 0; i < cellCount; i++) {
      const item = patternCells[i];
      if (item === null) continue;
      for (let sIdx = 0; sIdx < this.survivalSlots.length; sIdx++) {
        const s = this.survivalSlots[sIdx];
        if (s && s.item === item && s.count > 0) {
          s.count -= 1;
          if (s.count <= 0) this.survivalSlots[sIdx] = null;
          this.craftingGrid[i] = { item, count: 1 };
          break;
        }
      }
    }

    this.sound.playUiTick();
    this.syncViewmodel();
    this.emitInventory();
    this.scheduleSave();
    return true;
  }

  public craftFromGrid(craftAll = false): boolean {
    const gridSize = this.getActiveCraftingGridSize();
    const cellCount = gridSize * gridSize;
    const recipe = matchCraftingGrid(this.craftingGrid, gridSize);
    if (!recipe) return false;

    let maxFromGrid = Infinity;
    for (let i = 0; i < cellCount; i++) {
      const cell = this.craftingGrid[i];
      if (cell && cell.count > 0) {
        maxFromGrid = Math.min(maxFromGrid, cell.count);
      }
    }
    if (!Number.isFinite(maxFromGrid) || maxFromGrid <= 0) return false;

    let times = craftAll ? maxFromGrid : 1;
    const outDef = ITEM_DEFS[recipe.output.item];
    if (outDef && outDef.maxStack === 1) {
      const emptySlots = this.survivalSlots.filter((s) => s === null).length;
      times = Math.min(times, Math.max(1, emptySlots));
    }

    for (let i = 0; i < cellCount; i++) {
      const cell = this.craftingGrid[i];
      if (cell) {
        cell.count -= times;
        if (cell.count <= 0) this.craftingGrid[i] = null;
      }
    }

    addItemToInventory(this.survivalSlots, recipe.output.item, recipe.output.count * times);
    this.sound.playCraft();
    this.showToast(
      times > 1
        ? `Crafted ${ITEM_DEFS[recipe.output.item].name} ×${recipe.output.count * times}`
        : `Crafted ${recipe.name}`,
    );
    this.syncViewmodel();
    this.emitInventory();
    this.scheduleSave();
    return true;
  }

  public craftRecipeById(recipeId: string, craftAll = false): boolean {
    const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return false;
    const gridSize = this.getActiveCraftingGridSize();
    if (!recipeFitsInGridSize(recipe, gridSize)) {
      this.showToast('Requires a Crafting Table');
      return false;
    }
    const crafted = executeCraftRecipeBatch(
      this.survivalSlots,
      recipe,
      craftAll ? 64 : 1,
    );
    if (crafted > 0) {
      this.sound.playCraft();
      this.showToast(
        crafted > 1
          ? `Crafted ${ITEM_DEFS[recipe.output.item].name} ×${recipe.output.count * crafted}`
          : `Crafted ${recipe.name}`,
      );
      this.syncViewmodel();
      this.emitInventory();
      this.scheduleSave();
      return true;
    }
    return false;
  }

  // --- Furnace Helpers & Interaction ---

  private getOrCreateFurnace(key: string): FurnaceData {
    let f = this.furnaces.get(key);
    if (!f) {
      f = createEmptyFurnaceData();
      this.furnaces.set(key, f);
    }
    return f;
  }

  private emitActiveFurnace() {
    if (!this.activeFurnaceKey) {
      this.callbacks.onFurnaceChange?.(null);
      return;
    }
    const f = this.furnaces.get(this.activeFurnaceKey);
    this.callbacks.onFurnaceChange?.(f ? this.cloneFurnaceData(f) : createEmptyFurnaceData());
  }

  public placeInventoryItemIntoFurnace(
    invIdx: number,
    targetSlot: 'input' | 'fuel',
    count = 1,
  ): boolean {
    if (!this.activeFurnaceKey) return false;
    if (invIdx < 0 || invIdx >= this.survivalSlots.length) return false;
    const src = this.survivalSlots[invIdx];
    if (!src || src.count <= 0) return false;

    if (targetSlot === 'input' && !getSmeltingRecipe(src.item)) {
      this.showToast('Cannot smelt this item');
      return false;
    }
    if (targetSlot === 'fuel' && getFuelBurnTime(src.item) <= 0) {
      this.showToast('Cannot burn this as fuel');
      return false;
    }

    const furnace = this.getOrCreateFurnace(this.activeFurnaceKey);
    const dst = furnace[targetSlot];
    const maxStack = ITEM_DEFS[src.item]?.maxStack ?? 64;

    if (dst && dst.item !== src.item) {
      addItemToInventory(this.survivalSlots, dst.item, dst.count, dst.durability);
      furnace[targetSlot] = null;
      if (targetSlot === 'input') furnace.cookTime = 0;
    }

    const activeDst = furnace[targetSlot];
    const space = activeDst ? maxStack - activeDst.count : maxStack;
    const move = Math.min(src.count, count, space);
    if (move <= 0) return false;

    if (activeDst) {
      activeDst.count += move;
    } else {
      const nextSlot: InventorySlot = { item: src.item, count: move };
      if (src.durability !== undefined) {
        nextSlot.durability = src.durability;
      }
      furnace[targetSlot] = nextSlot;
    }
    src.count -= move;
    if (src.count <= 0) {
      this.survivalSlots[invIdx] = null;
    }

    this.sound.playUiTick();
    this.syncViewmodel();
    this.emitInventory();
    this.emitActiveFurnace();
    this.scheduleSave();
    return true;
  }

  public takeFromFurnaceSlot(slot: 'input' | 'fuel' | 'output'): boolean {
    if (!this.activeFurnaceKey) return false;
    const furnace = this.furnaces.get(this.activeFurnaceKey);
    if (!furnace) return false;
    const existing = furnace[slot];
    if (!existing || existing.count <= 0) return false;

    const added = addItemToInventory(
      this.survivalSlots,
      existing.item,
      existing.count,
      existing.durability,
    );
    if (!added) {
      this.showToast('Inventory is full');
      return false;
    }
    furnace[slot] = null;
    if (slot === 'input') furnace.cookTime = 0;

    if (slot === 'output') {
      this.sound.playCraft();
      this.showToast(`Collected ${ITEM_DEFS[existing.item].name} ×${existing.count}`);
    } else {
      this.sound.playUiTick();
    }
    this.syncViewmodel();
    this.emitInventory();
    this.emitActiveFurnace();
    this.scheduleSave();
    return true;
  }

  public quickLoadFurnaceSlot(invIdx: number, fullStack = true): boolean {
    if (!this.activeFurnaceKey) return false;
    const src = this.survivalSlots[invIdx];
    if (!src || src.count <= 0) return false;
    const furnace = this.getOrCreateFurnace(this.activeFurnaceKey);
    const isSmeltable = getSmeltingRecipe(src.item) !== null;
    const isFuel = getFuelBurnTime(src.item) > 0;
    const amt = fullStack ? src.count : 1;

    if (isSmeltable && isFuel) {
      // Logs can be smelted into Coal OR burned as fuel
      if (furnace.input && furnace.input.item !== src.item) {
        return this.placeInventoryItemIntoFurnace(invIdx, 'fuel', amt);
      }
      if (furnace.fuel || furnace.burnTime > 0) {
        return this.placeInventoryItemIntoFurnace(invIdx, 'input', amt);
      }
      return this.placeInventoryItemIntoFurnace(invIdx, 'fuel', amt);
    }
    if (isSmeltable) {
      return this.placeInventoryItemIntoFurnace(invIdx, 'input', amt);
    }
    if (isFuel) {
      return this.placeInventoryItemIntoFurnace(invIdx, 'fuel', amt);
    }
    return false;
  }

  public quickLoadFurnaceRecipe(inputItem: ItemType): boolean {
    if (!this.activeFurnaceKey) return false;
    const invIdx = this.survivalSlots.findIndex((s) => s !== null && s.item === inputItem);
    if (invIdx === -1) return false;

    const furnace = this.getOrCreateFurnace(this.activeFurnaceKey);
    const placed = this.placeInventoryItemIntoFurnace(
      invIdx,
      'input',
      this.survivalSlots[invIdx]?.count ?? 1,
    );
    if (!placed) return false;

    // Auto-add fuel if furnace is unlit and empty of fuel
    if (furnace.burnTime <= 0 && !furnace.fuel) {
      const preferredFuels: ItemType[] = [
        ItemType.Coal,
        ItemType.OakPlanks,
        ItemType.Stick,
        ItemType.OakLog,
        ItemType.BirchLog,
        ItemType.WoodPickaxe,
        ItemType.WoodAxe,
        ItemType.WoodSword,
      ];
      for (const fuelType of preferredFuels) {
        if (fuelType === inputItem) continue;
        const fuelIdx = this.survivalSlots.findIndex((s) => s !== null && s.item === fuelType);
        if (fuelIdx !== -1) {
          this.placeInventoryItemIntoFurnace(fuelIdx, 'fuel', 1);
          break;
        }
      }
    }
    return true;
  }

  private updateFurnaces(dt: number) {
    if (this.furnaces.size === 0) return;
    let activeChanged = false;
    let anyFinished = false;
    let blockStateChanged = false;

    for (const [key, f] of this.furnaces.entries()) {
      const isActive = key === this.activeFurnaceKey;
      const wasBurning = f.burnTime > 0;
      if (f.burnTime > 0) {
        f.burnTime = Math.max(0, f.burnTime - dt);
        if (f.burnTime === 0) {
          f.burnTotal = 0;
        }
      }

      const recipe = f.input ? getSmeltingRecipe(f.input.item) : null;
      let canOutput = false;
      if (recipe) {
        const outDef = ITEM_DEFS[recipe.output.item];
        const maxStack = outDef?.maxStack ?? 64;
        if (!f.output) {
          canOutput = true;
        } else if (
          f.output.item === recipe.output.item &&
          f.output.count + recipe.output.count <= maxStack
        ) {
          canOutput = true;
        }
      }

      if (recipe && canOutput) {
        f.cookTotal = recipe.cookSeconds;
        if (f.burnTime <= 0 && f.fuel && f.fuel.count > 0) {
          const burnSec = getFuelBurnTime(f.fuel.item);
          if (burnSec > 0) {
            f.burnTime = burnSec;
            f.burnTotal = burnSec;
            f.fuel.count -= 1;
            if (f.fuel.count <= 0) f.fuel = null;
            if (isActive) activeChanged = true;
          }
        }

        if (f.burnTime > 0) {
          f.cookTime += dt;
          if (f.cookTime >= f.cookTotal) {
            f.cookTime -= f.cookTotal;
            if (f.input) {
              f.input.count -= 1;
              if (f.input.count <= 0) {
                f.input = null;
                f.cookTime = 0;
              }
            }
            if (f.output) {
              f.output.count += recipe.output.count;
            } else {
              f.output = { item: recipe.output.item, count: recipe.output.count };
            }
            anyFinished = true;
            if (isActive) activeChanged = true;
          }
        } else if (f.cookTime > 0) {
          f.cookTime = Math.max(0, f.cookTime - dt * 1.5);
        }
      } else {
        if (f.cookTime > 0) f.cookTime = 0;
      }

      const isBurningNow = f.burnTime > 0;
      if (wasBurning !== isBurningNow) {
        const parts = key.split(',').map(Number);
        if (parts.length === 3 && parts.every(Number.isFinite)) {
          const [fx, fy, fz] = parts;
          const curBlock = this.world.getBlock(fx, fy, fz);
          if (curBlock === BlockType.Furnace || curBlock === BlockType.FurnaceLit) {
            const desired = isBurningNow ? BlockType.FurnaceLit : BlockType.Furnace;
            if (curBlock !== desired && this.world.setBlock(fx, fy, fz, desired)) {
              blockStateChanged = true;
            }
          }
        }
      }

      if (isActive && (wasBurning || isBurningNow || f.cookTime > 0)) {
        this.furnaceUiAccum += dt;
        if (this.furnaceUiAccum >= 0.08) {
          this.furnaceUiAccum = 0;
          activeChanged = true;
        }
      }
    }

    if (blockStateChanged) {
      this.rebuildDirtyChunks(4);
    }
    if (activeChanged && this.phase === 'furnace') {
      this.emitActiveFurnace();
    }
    if (anyFinished || blockStateChanged) {
      this.scheduleSave();
    }
  }

  public eatFromSlot(slotIdx: number): boolean {
    if (this.mode !== 'survival') return false;
    const slot = this.survivalSlots[slotIdx];
    if (!slot) return false;
    const def = ITEM_DEFS[slot.item];
    if (!def?.foodRestore) return false;
    if (this.hunger >= this.maxHunger && this.health >= this.maxHealth) {
      this.showToast('Already full');
      return false;
    }

    this.hunger = Math.min(this.maxHunger, this.hunger + def.foodRestore);
    if (def.healthRestore) {
      this.health = Math.min(this.maxHealth, this.health + def.healthRestore);
    }
    slot.count -= 1;
    if (slot.count <= 0) {
      this.survivalSlots[slotIdx] = null;
    }
    this.sound.playEat();
    this.viewmodel.triggerSwing();
    this.showToast(`Ate ${def.name}`);
    this.syncViewmodel();
    this.emitInventory();
    this.scheduleSave();
    this.emitHud();
    return true;
  }

  public toggleFlyMode() {
    if (this.mode === 'survival') {
      this.showToast('Flight is available in Creative Mode');
      return;
    }
    this.flying = !this.flying;
    this.playerVel.y = 0;
    this.sound.playUiTick();
    this.emitHud();
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

  private getEquippedItem(): ItemType | null {
    if (this.mode === 'creative') {
      return this.creativeHotbar[this.activeSlot] ?? null;
    }
    return this.survivalSlots[this.activeSlot]?.item ?? null;
  }

  private consumeActiveToolDurability(
    cost: number,
    fxPos?: { x: number; y: number; z: number },
  ): boolean {
    if (this.mode !== 'survival' || cost <= 0) return false;
    const res = damageToolSlot(this.survivalSlots, this.activeSlot, cost);
    if (!res.damaged) return false;

    if (res.broken) {
      this.sound.playToolBreak();
      if (fxPos) {
        this.particles.spawnColorBurst(
          fxPos.x,
          fxPos.y,
          fxPos.z,
          res.accentColor ?? '#c8cfd8',
          12,
        );
      }
      this.showToast(`${res.itemName ?? 'Tool'} broke!`);
    }
    this.syncViewmodel();
    this.emitInventory();
    this.scheduleSave();
    return true;
  }

  private syncViewmodel() {
    this.viewmodel.setItem(this.getEquippedItem());
  }

  private emitInventory() {
    this.callbacks.onInventoryChange(
      this.mode,
      [...this.creativeHotbar],
      this.survivalSlots.map((s) => (s ? { ...s } : null)),
      this.craftingGrid.map((s) => (s ? { ...s } : null)),
      this.activeSlot,
    );
  }

  private showToast(text: string) {
    this.toastText = text;
    this.toastTimer = 2.0;
    this.emitHud();
  }

  private resetMiningState() {
    this.miningHeld = false;
    this.miningBlockKey = null;
    this.miningElapsed = 0;
    this.miningTickAccum = 0;
    this.crackOverlayBox.visible = false;
  }

  private applyPlayerDamage(amount: number, knockX = 0, knockZ = 0) {
    if (this.mode !== 'survival' || this.phase !== 'playing') return;
    if (this.hurtCooldown > 0) return;

    this.health = Math.max(0, this.health - amount);
    this.hurtCooldown = 0.45;
    this.damageFlash = 1.0;
    this.cameraShake = Math.max(this.cameraShake, 0.09);
    this.sound.playHurt();

    if (knockX !== 0 || knockZ !== 0) {
      this.playerVel.x += knockX * 6.5;
      this.playerVel.z += knockZ * 6.5;
      this.playerVel.y = Math.max(this.playerVel.y, 4.2);
    }

    if (this.health <= 0) {
      this.setPhase('dead');
    } else {
      this.emitHud();
    }
    this.scheduleSave();
  }

  private disposeChunkPair(pair: ChunkMeshPair) {
    if (pair.opaque) {
      this.worldGroup.remove(pair.opaque);
      pair.opaque.geometry.dispose();
    }
    if (pair.transparent) {
      this.worldGroup.remove(pair.transparent);
      pair.transparent.geometry.dispose();
    }
  }

  private queueSurroundingChunks() {
    const centerCX = Math.floor(this.playerPos.x / CHUNK_SIZE);
    const centerCZ = Math.floor(this.playerPos.z / CHUNK_SIZE);
    if (centerCX === this.lastChunkCenterX && centerCZ === this.lastChunkCenterZ) return;

    this.lastChunkCenterX = centerCX;
    this.lastChunkCenterZ = centerCZ;

    const needed = new Set<string>();
    const toLoad: Array<{ cx: number; cz: number; distSq: number }> = [];

    for (let dz = -this.renderRadius; dz <= this.renderRadius; dz++) {
      for (let dx = -this.renderRadius; dx <= this.renderRadius; dx++) {
        if (dx * dx + dz * dz > (this.renderRadius + 0.5) * (this.renderRadius + 0.5)) continue;
        const cx = centerCX + dx;
        const cz = centerCZ + dz;
        const key = chunkKey(cx, cz);
        needed.add(key);
        if (!this.world.hasChunk(cx, cz)) {
          toLoad.push({ cx, cz, distSq: dx * dx + dz * dz });
        }
      }
    }

    toLoad.sort((a, b) => a.distSq - b.distSq);
    this.pendingChunkQueue = toLoad.map((c) => [c.cx, c.cz]);

    for (const [key, pair] of this.chunkMeshes.entries()) {
      if (!needed.has(key)) {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.hypot(cx - centerCX, cz - centerCZ) > this.renderRadius + 1.5) {
          this.disposeChunkPair(pair);
          this.chunkMeshes.delete(key);
          this.world.unloadChunk(cx, cz);
        }
      }
    }
  }

  private processChunkStreaming() {
    let loaded = 0;
    while (this.pendingChunkQueue.length > 0 && loaded < 2) {
      const next = this.pendingChunkQueue.shift()!;
      this.world.ensureChunk(next[0], next[1]);
      loaded++;
    }
    this.rebuildDirtyChunks(4);
  }

  private rebuildDirtyChunks(limit: number) {
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
      if (existing) {
        this.disposeChunkPair(existing);
      }

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

    for (const [cx, cz] of leftover) {
      this.world.markChunkDirty(cx, cz);
    }
  }

  private updateAtmosphere(dt: number) {
    if (this.targetTimeOfDay !== null) {
      let diff = this.targetTimeOfDay - this.timeOfDay;
      if (diff > 0.5) diff -= 1;
      if (diff < -0.5) diff += 1;
      if (Math.abs(diff) < 0.002) {
        this.timeOfDay = this.targetTimeOfDay;
        this.targetTimeOfDay = null;
      } else {
        this.timeOfDay = (this.timeOfDay + diff * Math.min(1, dt * 4.5) + 1) % 1;
      }
    } else if (this.phase === 'playing') {
      // Natural day/night rhythm (~5.5 minutes per full day in survival)
      this.timeOfDay = (this.timeOfDay + dt * 0.003) % 1;
    }

    const sunAngle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const sunY = Math.sin(sunAngle);
    const sunX = Math.cos(sunAngle);
    const sunZ = 0.36;

    const anchorX = this.playerPos.x;
    const anchorZ = this.playerPos.z;

    this.celestialGroup.position.set(anchorX, 0, anchorZ);
    this.sunMesh.position.set(sunX * 110, sunY * 110, sunZ * 55);
    this.moonMesh.position.set(-sunX * 110, -sunY * 110, -sunZ * 55);

    if (sunY >= -0.05) {
      this.sunLight.position.set(anchorX + sunX * 56, Math.max(8, sunY * 56), anchorZ + sunZ * 32);
    } else {
      this.sunLight.position.set(anchorX - sunX * 56, Math.max(10, -sunY * 56), anchorZ - sunZ * 32);
    }
    this.sunLight.target.position.set(anchorX, 14, anchorZ);
    this.sunLight.target.updateMatrixWorld();

    this.dayFactor = THREE.MathUtils.clamp((sunY + 0.12) / 0.45, 0, 1);
    const horizonGlow = Math.max(0, 1 - Math.abs(sunY) * 4.2);
    const isDawn = this.timeOfDay < 0.5;

    _curSky.copy(_skyNight).lerp(_skyDay, this.dayFactor);
    if (horizonGlow > 0.01) {
      _curSky.lerp(isDawn ? _skyDawn : _skySunset, horizonGlow * 0.72);
    }

    if (this.phase === 'playing' && this.underwater) {
      _curSky.lerp(new THREE.Color('#1d6ca3'), 0.75);
      this.fog.near = 2;
      this.fog.far = 22;
    } else {
      this.fog.near = Math.max(18, this.renderRadius * CHUNK_SIZE * 0.52);
      this.fog.far = this.renderRadius * CHUNK_SIZE + 8;
    }

    (this.scene.background as THREE.Color).copy(_curSky);
    this.fog.color.copy(_curSky);

    _curSunColor.copy(_sunColorNight).lerp(_sunColorDay, this.dayFactor);
    if (horizonGlow > 0.01) {
      _curSunColor.lerp(_sunColorWarm, horizonGlow * 0.8);
    }
    this.sunLight.color.copy(_curSunColor);
    this.sunLight.intensity = 0.32 + this.dayFactor * 1.18;

    _curHemiSky.copy(_hemiSkyNight).lerp(_hemiSkyDay, this.dayFactor);
    _curHemiGround.copy(_hemiGroundNight).lerp(_hemiGroundDay, this.dayFactor);
    this.hemiLight.color.copy(_curHemiSky);
    this.hemiLight.groundColor.copy(_curHemiGround);
    this.hemiLight.intensity = 0.34 + this.dayFactor * 0.44;

    _curCloud.copy(_cloudNight).lerp(_cloudDay, this.dayFactor);
    if (horizonGlow > 0.01) _curCloud.lerp(_cloudWarm, horizonGlow * 0.65);
    this.clouds.setTint(_curCloud);

    const starMat = this.stars.material as THREE.PointsMaterial;
    starMat.opacity = THREE.MathUtils.clamp((0.25 - sunY) * 2.2, 0, 0.92);
  }

  private collidesAt(x: number, y: number, z: number): boolean {
    const minX = Math.floor(x - PLAYER_HALF_WIDTH);
    const maxX = Math.floor(x + PLAYER_HALF_WIDTH);
    const minY = Math.floor(y);
    const maxY = Math.floor(y + PLAYER_HEIGHT - 0.01);
    const minZ = Math.floor(z - PLAYER_HALF_WIDTH);
    const maxZ = Math.floor(z + PLAYER_HALF_WIDTH);

    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let bx = minX; bx <= maxX; bx++) {
          if (isSolidBlock(this.world.getBlock(bx, by, bz))) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private blockIntersectsPlayer(bx: number, by: number, bz: number): boolean {
    const pMinX = this.playerPos.x - PLAYER_HALF_WIDTH;
    const pMaxX = this.playerPos.x + PLAYER_HALF_WIDTH;
    const pMinY = this.playerPos.y;
    const pMaxY = this.playerPos.y + PLAYER_HEIGHT;
    const pMinZ = this.playerPos.z - PLAYER_HALF_WIDTH;
    const pMaxZ = this.playerPos.z + PLAYER_HALF_WIDTH;

    return (
      bx < pMaxX &&
      bx + 1 > pMinX &&
      by < pMaxY &&
      by + 1 > pMinY &&
      bz < pMaxZ &&
      bz + 1 > pMinZ
    );
  }

  private updateSurvivalVitals(dt: number, sprinting: boolean, moving: boolean) {
    if (this.mode !== 'survival') return;

    this.survivalSeconds += dt;
    if (this.hurtCooldown > 0) this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2.8);

    // Oxygen & drowning
    if (this.underwater) {
      this.oxygen = Math.max(0, this.oxygen - dt * 1.0);
      if (this.oxygen <= 0) {
        this.drownTimer += dt;
        if (this.drownTimer >= 1.2) {
          this.drownTimer = 0;
          this.applyPlayerDamage(2);
        }
      }
    } else {
      this.oxygen = Math.min(this.maxOxygen, this.oxygen + dt * 3.5);
      this.drownTimer = 0;
    }

    // Hunger exhaustion
    if (moving) {
      this.exhaustion += dt * (sprinting ? 0.042 : 0.01);
    } else {
      this.exhaustion += dt * 0.0025;
    }
    if (this.exhaustion >= 1.0) {
      this.exhaustion -= 1.0;
      if (this.hunger > 0) {
        this.hunger = Math.max(0, this.hunger - 1);
      }
    }

    // Natural regeneration when well-fed
    if (this.hunger >= 16 && this.health < this.maxHealth && this.health > 0) {
      this.regenTimer += dt;
      if (this.regenTimer >= 3.2) {
        this.regenTimer = 0;
        this.health = Math.min(this.maxHealth, this.health + 1);
        this.exhaustion += 0.35;
      }
    } else {
      this.regenTimer = 0;
    }

    // Starvation warning tick down to 1 HP
    if (this.hunger <= 0 && this.health > 1) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4.0) {
        this.starveTimer = 0;
        this.applyPlayerDamage(1);
      }
    } else {
      this.starveTimer = 0;
    }
  }

  private updateSurvivalMining(dt: number) {
    if (this.mode !== 'survival' || !this.miningHeld || !this.currentTarget) {
      this.miningBlockKey = null;
      this.miningElapsed = 0;
      this.crackOverlayBox.visible = false;
      return;
    }

    const t = this.currentTarget;
    const def = BLOCK_DEFS[t.block];
    if (!def.breakable) {
      this.crackOverlayBox.visible = false;
      return;
    }

    const key = `${t.x},${t.y},${t.z}`;
    if (this.miningBlockKey !== key) {
      this.miningBlockKey = key;
      this.miningElapsed = 0;
      this.miningTickAccum = 0;
      this.miningDuration = getMiningDuration(t.block, this.getEquippedItem());
    }

    this.miningElapsed += dt;
    this.miningTickAccum += dt;
    if (this.miningTickAccum >= 0.22) {
      this.miningTickAccum = 0;
      this.sound.playMineTick(def.sound);
      this.particles.spawnBurst(t.x, t.y, t.z, t.block, 3);
    }

    const ratio = Math.min(1, this.miningElapsed / Math.max(0.08, this.miningDuration));
    this.crackOverlayBox.visible = true;
    if (isBedBlock(t.block)) {
      this.crackOverlayBox.scale.set(1, 9 / 16, 1);
      this.crackOverlayBox.position.set(t.x + 0.5, t.y + 9 / 32, t.z + 0.5);
    } else {
      this.crackOverlayBox.scale.set(1, 1, 1);
      this.crackOverlayBox.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
    }
    const crackMat = this.crackOverlayBox.material as THREE.MeshBasicMaterial;
    if (this.destroyStageTextures.length > 0) {
      const stage = Math.min(
        this.destroyStageTextures.length - 1,
        Math.floor(ratio * this.destroyStageTextures.length),
      );
      if (stage !== this.lastCrackStage) {
        this.lastCrackStage = stage;
        crackMat.map = this.destroyStageTextures[stage];
        crackMat.needsUpdate = true;
      }
      crackMat.opacity = 0.88;
    } else {
      crackMat.opacity = 0.16 + ratio * 0.72;
    }

    if (this.miningElapsed >= this.miningDuration) {
      this.completeBlockBreak(t);
      this.miningBlockKey = null;
      this.miningElapsed = 0;
      this.lastCrackStage = -1;
      this.crackOverlayBox.visible = false;
    }
  }

  private updatePlayer(dt: number) {
    const keyTurnSpeed = 2.0;
    if (this.heldKeys.has('ArrowLeft')) this.yaw += keyTurnSpeed * dt;
    if (this.heldKeys.has('ArrowRight')) this.yaw -= keyTurnSpeed * dt;
    if (this.heldKeys.has('ArrowUp')) {
      this.pitch = Math.min(Math.PI / 2 - 0.04, this.pitch + keyTurnSpeed * 0.8 * dt);
    }
    if (this.heldKeys.has('ArrowDown')) {
      this.pitch = Math.max(-Math.PI / 2 + 0.04, this.pitch - keyTurnSpeed * 0.8 * dt);
    }

    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _moveDir.set(0, 0, 0);

    if (this.heldKeys.has('KeyW')) _moveDir.add(_forward);
    if (this.heldKeys.has('KeyS')) _moveDir.sub(_forward);
    if (this.heldKeys.has('KeyD')) _moveDir.add(_right);
    if (this.heldKeys.has('KeyA')) _moveDir.sub(_right);

    const moving = _moveDir.lengthSq() > 0.001;
    if (moving) _moveDir.normalize();

    const canSprint = this.mode === 'creative' || this.hunger > 4;
    const sprinting =
      canSprint &&
      (this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight')) &&
      moving;

    const headBlock = this.world.getBlock(
      Math.floor(this.playerPos.x),
      Math.floor(this.playerPos.y + EYE_HEIGHT),
      Math.floor(this.playerPos.z),
    );
    const feetBlock = this.world.getBlock(
      Math.floor(this.playerPos.x),
      Math.floor(this.playerPos.y + 0.25),
      Math.floor(this.playerPos.z),
    );
    const wasUnderwater = this.underwater;
    this.underwater = isLiquidBlock(headBlock);
    const inWater = isLiquidBlock(feetBlock) || this.underwater;
    if (!wasUnderwater && this.underwater) {
      this.sound.playStep('water');
    }

    const targetFov = sprinting
      ? this.baseFov + 6
      : this.flying && moving
        ? this.baseFov + 4
        : this.baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 9, dt);
      this.camera.updateProjectionMatrix();
    }

    const speed = this.flying
      ? sprinting
        ? FLY_SPEED * 1.45
        : FLY_SPEED
      : inWater
        ? WALK_SPEED * 0.62
        : sprinting
          ? SPRINT_SPEED
          : WALK_SPEED;

    const accel = this.grounded || this.flying ? 16 : 6.5;
    this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, _moveDir.x * speed, accel, dt);
    this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, _moveDir.z * speed, accel, dt);

    if (this.flying) {
      let targetVy = 0;
      if (this.heldKeys.has('Space')) targetVy += 8.5;
      if (this.heldKeys.has('KeyC') || this.heldKeys.has('ControlLeft')) targetVy -= 8.5;
      this.playerVel.y = THREE.MathUtils.damp(this.playerVel.y, targetVy, 12, dt);
      this.grounded = false;
      this.peakAirY = this.playerPos.y;
    } else if (inWater) {
      const targetWaterVy = this.heldKeys.has('Space') ? 4.2 : -1.8;
      this.playerVel.y = THREE.MathUtils.damp(this.playerVel.y, targetWaterVy, 6, dt);
      this.grounded = false;
      this.peakAirY = this.playerPos.y;
    } else {
      if (this.grounded) {
        this.coyoteTimer = 0.11;
        this.peakAirY = this.playerPos.y;
      } else {
        this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
        if (this.playerPos.y > this.peakAirY) this.peakAirY = this.playerPos.y;
      }

      if (this.jumpBufferTimer > 0) {
        this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
      }

      if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
        this.playerVel.y = JUMP_SPEED;
        this.grounded = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        if (this.mode === 'survival') this.exhaustion += 0.05;
        this.sound.playJump();
      }

      this.playerVel.y = Math.max(-34, this.playerVel.y - GRAVITY * dt);
    }

    const prevX = this.playerPos.x;
    const prevZ = this.playerPos.z;
    const prevVy = this.playerVel.y;

    // X axis
    const nextX = this.playerPos.x + this.playerVel.x * dt;
    if (!this.collidesAt(nextX, this.playerPos.y, this.playerPos.z)) {
      this.playerPos.x = nextX;
    } else {
      this.playerVel.x = 0;
    }

    // Z axis
    const nextZ = this.playerPos.z + this.playerVel.z * dt;
    if (!this.collidesAt(this.playerPos.x, this.playerPos.y, nextZ)) {
      this.playerPos.z = nextZ;
    } else {
      this.playerVel.z = 0;
    }

    // Y axis
    const nextY = this.playerPos.y + this.playerVel.y * dt;
    const wasGrounded = this.grounded;
    if (!this.collidesAt(this.playerPos.x, nextY, this.playerPos.z)) {
      this.playerPos.y = nextY;
      this.grounded = false;
    } else {
      if (this.playerVel.y < 0) {
        this.playerPos.y = Math.floor(nextY) + 1.0001;
        this.grounded = true;
        if (!wasGrounded) {
          const fallDist = this.peakAirY - this.playerPos.y;
          if (this.mode === 'survival' && !inWater && fallDist > 3.6) {
            const fallDmg = Math.max(1, Math.floor(fallDist - 3.0));
            this.applyPlayerDamage(fallDmg);
          } else if (prevVy < -6.5) {
            this.sound.playLand(Math.min(1.6, Math.abs(prevVy) / 10));
            this.cameraShake = Math.max(
              this.cameraShake,
              Math.min(0.05, Math.abs(prevVy) * 0.0025),
            );
          }
          this.peakAirY = this.playerPos.y;
        }
      } else if (this.playerVel.y > 0) {
        this.playerPos.y = Math.floor(nextY + PLAYER_HEIGHT) - PLAYER_HEIGHT - 0.001;
      }
      this.playerVel.y = 0;
    }

    if (this.playerPos.y < 1.5) {
      const safeY = this.world.getGroundY(this.playerPos.x, this.playerPos.z);
      this.playerPos.y = safeY + 1;
      this.playerVel.y = 0;
      this.peakAirY = this.playerPos.y;
    }

    const horizDist = Math.hypot(this.playerPos.x - prevX, this.playerPos.z - prevZ);
    if (this.grounded && horizDist > 0.001) {
      this.stepDist += horizDist;
      if (this.stepDist >= 2.15) {
        this.stepDist = 0;
        const under = this.world.getBlock(
          Math.floor(this.playerPos.x),
          Math.floor(this.playerPos.y - 0.2),
          Math.floor(this.playerPos.z),
        );
        this.sound.playStep(BLOCK_DEFS[under]?.sound ?? 'grass');
      }
    } else if (inWater && horizDist > 0.001) {
      this.stepDist += horizDist;
      if (this.stepDist >= 2.5) {
        this.stepDist = 0;
        this.sound.playStep('water');
      }
    }

    this.updateSurvivalVitals(dt, sprinting, moving);

    this.cameraShake = Math.max(0, this.cameraShake - dt * 0.35);
    const shakeX = this.cameraShake > 0 ? (Math.random() - 0.5) * this.cameraShake : 0;
    const shakeY = this.cameraShake > 0 ? (Math.random() - 0.5) * this.cameraShake : 0;

    this.camera.position.set(
      this.playerPos.x + shakeX,
      this.playerPos.y + EYE_HEIGHT + shakeY,
      this.playerPos.z,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    const speedRatio = Math.min(1, Math.hypot(this.playerVel.x, this.playerVel.z) / SPRINT_SPEED);
    const isActivelyMining =
      this.mode === 'survival' && this.miningHeld && this.currentTarget !== null;
    this.viewmodel.update(dt, speedRatio, this.grounded && !this.flying, isActivelyMining);
    this.playerShadowRig.update(
      dt,
      this.world,
      this.playerPos,
      this.yaw,
      speedRatio,
      this.grounded && !this.flying,
    );

    _rayOrigin.copy(this.camera.position);
    this.camera.getWorldDirection(_rayDir);
    this.currentTarget = this.world.raycast(_rayOrigin, _rayDir, 6.5);

    if (this.currentTarget) {
      const t = this.currentTarget;
      this.highlightBox.visible = true;
      if (isBedBlock(t.block)) {
        this.highlightBox.scale.set(1, 9 / 16, 1);
        this.highlightBox.position.set(t.x + 0.5, t.y + 9 / 32, t.z + 0.5);
      } else {
        this.highlightBox.scale.set(1, 1, 1);
        this.highlightBox.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
      }
    } else {
      this.highlightBox.visible = false;
    }

    this.updateSurvivalMining(dt);
    this.queueSurroundingChunks();
  }

  private tryMeleeAttack(): boolean {
    if (this.phase !== 'playing') return false;
    _rayOrigin.copy(this.camera.position);
    this.camera.getWorldDirection(_rayDir);

    const equipped = this.getEquippedItem();
    const dmg = (equipped ? ITEM_DEFS[equipped]?.attackDamage : undefined) ?? 2;

    // Check hostile Night Walkers first
    const hostileHit = this.hostiles.tryMeleeHit(_rayOrigin, _rayDir, dmg, 4.5);
    if (hostileHit) {
      this.viewmodel.triggerSwing();
      this.sound.playStrike();
      this.particles.spawnColorBurst(
        hostileHit.pos.x,
        hostileHit.pos.y,
        hostileHit.pos.z,
        '#72a367',
        hostileHit.killed ? 18 : 8,
      );
      this.cameraShake = 0.035;
      this.crosshairPulse = 1;
      this.hitstopTimer = 0.035;

      if (this.mode === 'survival' && equipped !== null) {
        const toolKind = ITEM_DEFS[equipped]?.toolKind;
        if (toolKind && toolKind !== 'hand') {
          this.consumeActiveToolDurability(toolKind === 'sword' ? 1 : 2, hostileHit.pos);
        }
      }

      if (hostileHit.killed) {
        this.mobsDefeated += 1;
        const roll = Math.random();
        const drop =
          roll < 0.48
            ? ItemType.Coal
            : roll < 0.85
              ? ItemType.RawIron
              : ItemType.Stick;
        this.droppedItems.spawnDrop(
          drop,
          1,
          hostileHit.pos.x,
          hostileHit.pos.y - 0.35,
          hostileHit.pos.z,
        );
        this.showToast('Defeated Night Walker');
        this.scheduleSave();
      }
      return true;
    }

    // Check Sheep (drops Raw Mutton & White Wool onto the ground when defeated)
    const sheepHit = this.wildlife.tryMeleeHit(_rayOrigin, _rayDir, dmg, 4.2);
    if (sheepHit) {
      this.viewmodel.triggerSwing();
      this.sound.playStrike();
      this.particles.spawnColorBurst(
        sheepHit.pos.x,
        sheepHit.pos.y,
        sheepHit.pos.z,
        '#f2efe6',
        sheepHit.killed ? 16 : 7,
      );
      this.cameraShake = 0.025;
      this.crosshairPulse = 1;
      if (this.mode === 'survival' && equipped !== null) {
        const toolKind = ITEM_DEFS[equipped]?.toolKind;
        if (toolKind && toolKind !== 'hand') {
          this.consumeActiveToolDurability(toolKind === 'sword' ? 1 : 2, sheepHit.pos);
        }
      }
      if (sheepHit.killed) {
        this.droppedItems.spawnDrop(
          ItemType.RawMutton,
          1,
          sheepHit.pos.x,
          sheepHit.pos.y - 0.25,
          sheepHit.pos.z,
        );
        this.droppedItems.spawnDrop(
          ItemType.WhiteWool,
          1,
          sheepHit.pos.x,
          sheepHit.pos.y - 0.25,
          sheepHit.pos.z,
        );
        this.scheduleSave();
      }
      return true;
    }

    return false;
  }

  private enqueueLeavesAround(wx: number, wy: number, wz: number, radius = 6) {
    for (let dy = -radius; dy <= radius; dy++) {
      const ny = wy + dy;
      if (ny <= 0 || ny >= CHUNK_HEIGHT) continue;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
          if (dist === 0 || dist > radius + 2) continue;
          const nx = wx + dx;
          const nz = wz + dz;
          const b = this.world.getBlock(nx, ny, nz);
          if (!isLeafBlock(b)) continue;
          if (this.world.isPlayerPlacedBlock(nx, ny, nz)) continue;

          const key = `${nx},${ny},${nz}`;
          if (this.leafDecaySet.has(key)) continue;
          this.leafDecaySet.add(key);
          this.leafDecayQueue.push({
            x: nx,
            y: ny,
            z: nz,
            delay: 0.35 + dist * 0.35 + Math.random() * 2.4,
          });
        }
      }
    }
  }

  private updateLeafDecay(dt: number) {
    let anyDecayed = false;
    let invChanged = false;

    // 1. Advance queued leaf checks (staggered organic decay after chopping trees)
    if (this.leafDecayQueue.length > 0) {
      let processed = 0;
      for (let i = this.leafDecayQueue.length - 1; i >= 0; i--) {
        const entry = this.leafDecayQueue[i];
        entry.delay -= dt;
        if (entry.delay > 0) continue;
        if (processed >= 3) continue;

        processed++;
        this.leafDecayQueue.splice(i, 1);
        const key = `${entry.x},${entry.y},${entry.z}`;
        this.leafDecaySet.delete(key);

        const b = this.world.getBlock(entry.x, entry.y, entry.z);
        if (!isLeafBlock(b)) continue;
        if (this.world.isPlayerPlacedBlock(entry.x, entry.y, entry.z)) continue;

        if (!this.world.isLeafSupported(entry.x, entry.y, entry.z, 6)) {
          if (this.world.setBlock(entry.x, entry.y, entry.z, BlockType.Air)) {
            anyDecayed = true;
            this.particles.spawnBurst(entry.x, entry.y, entry.z, b, 5);
            const distSq =
              (entry.x + 0.5 - this.playerPos.x) ** 2 +
              (entry.y + 0.5 - this.playerPos.y) ** 2 +
              (entry.z + 0.5 - this.playerPos.z) ** 2;
            if (distSq <= 100) {
              this.sound.playMineTick('leaves');
            }
            if (this.mode === 'survival' && distSq <= 196) {
              const roll = Math.random();
              if (roll < 0.06) {
                addItemToInventory(this.survivalSlots, ItemType.Apple, 1);
                invChanged = true;
              } else if (roll < 0.16) {
                addItemToInventory(this.survivalSlots, ItemType.Stick, 1);
                invChanged = true;
              }
            }
            this.enqueueLeavesAround(entry.x, entry.y, entry.z, 1);
          }
        }
      }
    }

    // 2. Minecraft-style random ticks around the player to catch any stray unsupported natural leaves
    this.leafRandomTickAccum += dt;
    if (this.leafRandomTickAccum >= 0.45) {
      this.leafRandomTickAccum = 0;
      const px = Math.floor(this.playerPos.x);
      const pz = Math.floor(this.playerPos.z);
      for (let s = 0; s < 14; s++) {
        const rx = px + Math.floor((Math.random() - 0.5) * 44);
        const rz = pz + Math.floor((Math.random() - 0.5) * 44);
        const ry = 8 + Math.floor(Math.random() * 34);
        if (ry <= 0 || ry >= CHUNK_HEIGHT) continue;
        const b = this.world.getBlock(rx, ry, rz);
        if (!isLeafBlock(b)) continue;
        if (this.world.isPlayerPlacedBlock(rx, ry, rz)) continue;
        const key = `${rx},${ry},${rz}`;
        if (this.leafDecaySet.has(key)) continue;
        if (!this.world.isLeafSupported(rx, ry, rz, 6)) {
          this.leafDecaySet.add(key);
          this.leafDecayQueue.push({
            x: rx,
            y: ry,
            z: rz,
            delay: 0.15 + Math.random() * 0.85,
          });
        }
      }
    }

    if (anyDecayed) {
      this.rebuildDirtyChunks(4);
      this.scheduleSave();
    }
    if (invChanged) {
      this.syncViewmodel();
      this.emitInventory();
    }
  }

  private completeBlockBreak(t: RaycastHit) {
    const def = BLOCK_DEFS[t.block];
    if (!def.breakable && !(this.mode === 'creative' && t.y > 0)) return;

    const changed = this.world.setBlock(t.x, t.y, t.z, BlockType.Air);
    if (!changed) return;

    // Remove paired half of 2-block Oak Doors, Beds, and Tall Grass
    if (isDoorBlock(t.block)) {
      const partnerY =
        t.block === BlockType.OakDoorTop || t.block === BlockType.OakDoorTopOpen
          ? t.y - 1
          : t.y + 1;
      if (isDoorBlock(this.world.getBlock(t.x, partnerY, t.z))) {
        this.world.setBlock(t.x, partnerY, t.z, BlockType.Air);
      }
    } else if (t.block === BlockType.TallGrassBottom) {
      if (this.world.getBlock(t.x, t.y + 1, t.z) === BlockType.TallGrassTop) {
        this.world.setBlock(t.x, t.y + 1, t.z, BlockType.Air);
      }
    } else if (t.block === BlockType.TallGrassTop) {
      if (this.world.getBlock(t.x, t.y - 1, t.z) === BlockType.TallGrassBottom) {
        this.world.setBlock(t.x, t.y - 1, t.z, BlockType.Air);
      }
    } else if (t.block === BlockType.BedHead) {
      if (this.world.getBlock(t.x, t.y, t.z + 1) === BlockType.BedFoot) {
        this.world.setBlock(t.x, t.y, t.z + 1, BlockType.Air);
      }
    } else if (t.block === BlockType.BedFoot) {
      if (this.world.getBlock(t.x, t.y, t.z - 1) === BlockType.BedHead) {
        this.world.setBlock(t.x, t.y, t.z - 1, BlockType.Air);
      }
    }

    // Pop off unsupported plant blocks resting directly on top of a broken block
    const plantAbove = this.world.getBlock(t.x, t.y + 1, t.z);
    if (isPlantBlock(plantAbove)) {
      this.world.setBlock(t.x, t.y + 1, t.z, BlockType.Air);
      if (
        plantAbove === BlockType.TallGrassBottom &&
        this.world.getBlock(t.x, t.y + 2, t.z) === BlockType.TallGrassTop
      ) {
        this.world.setBlock(t.x, t.y + 2, t.z, BlockType.Air);
      }
    }

    // Trigger natural leaf decay check around broken tree logs or leaves
    if (isLogBlock(t.block) || isLeafBlock(t.block)) {
      this.enqueueLeavesAround(t.x, t.y, t.z, 6);
    }

    this.viewmodel.triggerSwing();
    this.particles.spawnBurst(t.x, t.y, t.z, t.block, 15);
    this.sound.playBreak(def.sound);
    this.cameraShake = 0.022;
    this.crosshairPulse = 1;
    this.blocksMined += 1;

    if (t.block === BlockType.Furnace || t.block === BlockType.FurnaceLit) {
      const fKey = `${t.x},${t.y},${t.z}`;
      const existingFurnace = this.furnaces.get(fKey);
      if (existingFurnace) {
        if (this.mode === 'survival') {
          if (existingFurnace.input) {
            addItemToInventory(this.survivalSlots, existingFurnace.input.item, existingFurnace.input.count);
          }
          if (existingFurnace.fuel) {
            addItemToInventory(this.survivalSlots, existingFurnace.fuel.item, existingFurnace.fuel.count);
          }
          if (existingFurnace.output) {
            addItemToInventory(this.survivalSlots, existingFurnace.output.item, existingFurnace.output.count);
          }
        }
        this.furnaces.delete(fKey);
      }
    }

    if (this.mode === 'survival') {
      this.exhaustion += 0.03;
      const equipped = this.getEquippedItem();
      if (equipped !== null) {
        const toolKind = ITEM_DEFS[equipped]?.toolKind;
        if (toolKind && toolKind !== 'hand') {
          this.consumeActiveToolDurability(toolKind === 'sword' ? 2 : 1, {
            x: t.x + 0.5,
            y: t.y + 0.5,
            z: t.z + 0.5,
          });
        }
      }
      const drop = getBlockDrop(t.block);
      if (drop) {
        addItemToInventory(this.survivalSlots, drop.item, drop.count);
      }
      this.syncViewmodel();
      this.emitInventory();
    }

    this.rebuildDirtyChunks(6);
    this.scheduleSave();
    this.emitHud();
  }

  public breakTargetedBlock() {
    if (this.phase !== 'playing') return;
    if (this.tryMeleeAttack()) return;
    if (!this.currentTarget) return;
    this.completeBlockBreak(this.currentTarget);
  }

  public useOrPlaceAtTarget() {
    if (this.phase !== 'playing') return;

    const sneaking =
      this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight');

    // 0. Interact with placed Crafting Table, Furnace, Oak Door, or Bed (unless sneaking)
    if (this.currentTarget && !sneaking) {
      const t = this.currentTarget;
      if (t.block === BlockType.CraftingTable) {
        this.sound.playUiTick();
        this.setPhase('crafting');
        return;
      }
      if (t.block === BlockType.Furnace || t.block === BlockType.FurnaceLit) {
        this.sound.playUiTick();
        const key = `${t.x},${t.y},${t.z}`;
        this.activeFurnaceKey = key;
        this.getOrCreateFurnace(key);
        this.setPhase('furnace');
        return;
      }
      if (isDoorBlock(t.block)) {
        const bottomY =
          t.block === BlockType.OakDoorTop || t.block === BlockType.OakDoorTopOpen
            ? t.y - 1
            : t.y;
        const currentlyOpen =
          t.block === BlockType.OakDoorBottomOpen || t.block === BlockType.OakDoorTopOpen;
        const nextBottom = currentlyOpen
          ? BlockType.OakDoorBottom
          : BlockType.OakDoorBottomOpen;
        const nextTop = currentlyOpen ? BlockType.OakDoorTop : BlockType.OakDoorTopOpen;

        if (isDoorBlock(this.world.getBlock(t.x, bottomY, t.z))) {
          this.world.setBlock(t.x, bottomY, t.z, nextBottom);
        }
        if (isDoorBlock(this.world.getBlock(t.x, bottomY + 1, t.z))) {
          this.world.setBlock(t.x, bottomY + 1, t.z, nextTop);
        }
        this.viewmodel.triggerSwing();
        this.sound.playPlace('wood');
        this.crosshairPulse = 1;
        this.rebuildDirtyChunks(6);
        this.scheduleSave();
        this.emitHud();
        return;
      }
      if (isBedBlock(t.block)) {
        this.bedSpawnPoint = { x: t.x + 0.5, y: t.y + 0.65, z: t.z + 0.5 };
        if (this.dayFactor < 0.65) {
          this.targetTimeOfDay = TIME_PRESET_VALUES.dawn;
          this.hostiles.clearAll();
          this.health = Math.min(this.maxHealth, this.health + 4);
          this.sound.playCraft();
          this.showToast('Slept until dawn · Respawn point set');
        } else {
          this.sound.playUiTick();
          this.showToast('Respawn point set · You can sleep at night');
        }
        this.scheduleSave();
        this.emitHud();
        return;
      }
    }

    const equipped = this.getEquippedItem();
    const equippedDef = equipped !== null ? ITEM_DEFS[equipped] : undefined;

    // 1. Empty Iron Bucket: Scoop water from targeted liquid block
    if (equipped === ItemType.Bucket) {
      _rayOrigin.copy(this.camera.position);
      this.camera.getWorldDirection(_rayDir);
      const liquidHit = this.world.raycast(_rayOrigin, _rayDir, 6.5, true);
      if (liquidHit && liquidHit.block === BlockType.Water) {
        const changed = this.world.setBlock(liquidHit.x, liquidHit.y, liquidHit.z, BlockType.Air);
        if (changed) {
          if (this.mode === 'survival') {
            const slot = this.survivalSlots[this.activeSlot];
            if (slot && slot.item === ItemType.Bucket) {
              if (slot.count <= 1) {
                this.survivalSlots[this.activeSlot] = { item: ItemType.WaterBucket, count: 1 };
              } else {
                slot.count -= 1;
                addItemToInventory(this.survivalSlots, ItemType.WaterBucket, 1);
              }
            }
            this.syncViewmodel();
            this.emitInventory();
            this.showToast('Filled Water Bucket');
          } else {
            this.showToast('Scooped Water');
          }
          this.viewmodel.triggerSwing();
          this.particles.spawnColorBurst(
            liquidHit.x + 0.5,
            liquidHit.y + 0.5,
            liquidHit.z + 0.5,
            '#42a4f5',
            12,
          );
          this.sound.playBucketFill();
          this.crosshairPulse = 1;
          this.rebuildDirtyChunks(6);
          this.scheduleSave();
          this.emitHud();
        }
      }
      return;
    }

    // 2. Water Bucket: Pour a water block at target adjacent face (works even at player feet for MLG water clutch)
    if (equipped === ItemType.WaterBucket) {
      if (!this.currentTarget) return;
      const t = this.currentTarget;
      const px = t.x + t.nx;
      const py = t.y + t.ny;
      const pz = t.z + t.nz;
      if (py <= 0 || py >= CHUNK_HEIGHT) return;

      const existing = this.world.getBlock(px, py, pz);
      if (existing !== BlockType.Air && !isLiquidBlock(existing)) return;

      const changed = this.world.setBlock(px, py, pz, BlockType.Water);
      if (changed) {
        if (this.mode === 'survival') {
          this.survivalSlots[this.activeSlot] = { item: ItemType.Bucket, count: 1 };
          this.syncViewmodel();
          this.emitInventory();
          this.showToast('Poured Water');
        }
        this.viewmodel.triggerSwing();
        this.particles.spawnColorBurst(px + 0.5, py + 0.5, pz + 0.5, '#42a4f5', 14);
        this.sound.playBucketEmpty();
        this.crosshairPulse = 1;
        this.rebuildDirtyChunks(6);
        this.scheduleSave();
        this.emitHud();
      }
      return;
    }

    // 2b. Empty Glass Bottle: Fill from Water block into a Water Bottle (without consuming the water source)
    if (equipped === ItemType.GlassBottle) {
      _rayOrigin.copy(this.camera.position);
      this.camera.getWorldDirection(_rayDir);
      const liquidHit = this.world.raycast(_rayOrigin, _rayDir, 6.5, true);
      if (liquidHit && liquidHit.block === BlockType.Water) {
        if (this.mode === 'survival') {
          const slot = this.survivalSlots[this.activeSlot];
          if (slot && slot.item === ItemType.GlassBottle) {
            if (slot.count <= 1) {
              this.survivalSlots[this.activeSlot] = { item: ItemType.WaterBottle, count: 1 };
            } else {
              slot.count -= 1;
              addItemToInventory(this.survivalSlots, ItemType.WaterBottle, 1);
            }
          }
          this.syncViewmodel();
          this.emitInventory();
          this.showToast('Filled Water Bottle');
        } else {
          this.showToast('Filled Water Bottle');
        }
        this.viewmodel.triggerSwing();
        this.particles.spawnColorBurst(
          liquidHit.x + 0.5,
          liquidHit.y + 0.65,
          liquidHit.z + 0.5,
          '#42a4f5',
          10,
        );
        this.sound.playBucketFill();
        this.crosshairPulse = 1;
        this.scheduleSave();
        this.emitHud();
      }
      return;
    }

    // 2c. Water Bottle: Drink to refresh vitals and return an empty Glass Bottle
    if (equipped === ItemType.WaterBottle) {
      if (this.mode === 'survival') {
        this.hunger = Math.min(this.maxHunger, this.hunger + (equippedDef?.foodRestore ?? 2));
        this.health = Math.min(this.maxHealth, this.health + (equippedDef?.healthRestore ?? 1));
        this.survivalSlots[this.activeSlot] = { item: ItemType.GlassBottle, count: 1 };
        this.syncViewmodel();
        this.emitInventory();
        this.showToast('Drank Water Bottle');
      } else {
        this.showToast('Drank Water Bottle');
      }
      this.viewmodel.triggerSwing();
      this.sound.playBucketEmpty();
      this.crosshairPulse = 1;
      this.scheduleSave();
      this.emitHud();
      return;
    }

    // 3. In Survival Mode, right-click eats food if holding an edible item
    if (this.mode === 'survival' && equippedDef?.foodRestore) {
      this.eatFromSlot(this.activeSlot);
      return;
    }

    if (!this.currentTarget) return;
    const t = this.currentTarget;
    // Replacing Short Grass in-place when aiming directly at it (like Minecraft)
    const replaceInPlace = t.block === BlockType.ShortGrass;
    const px = replaceInPlace ? t.x : t.x + t.nx;
    const py = replaceInPlace ? t.y : t.y + t.ny;
    const pz = replaceInPlace ? t.z : t.z + t.nz;

    if (py <= 0 || py >= CHUNK_HEIGHT) return;

    const chosenBlock = equippedDef?.blockType ?? null;
    if (chosenBlock === null) return;
    const def = BLOCK_DEFS[chosenBlock];
    if (!def?.buildable) return;
    if (def.solid && this.blockIntersectsPlayer(px, py, pz)) return;

    const existing = this.world.getBlock(px, py, pz);
    if (!isReplaceableBlock(existing)) return;

    let changed = false;

    if (chosenBlock === BlockType.OakDoorBottom) {
      if (py + 1 >= CHUNK_HEIGHT) {
        this.showToast('Not enough room for a door');
        return;
      }
      const upper = this.world.getBlock(px, py + 1, pz);
      if (
        !isReplaceableBlock(upper) ||
        this.blockIntersectsPlayer(px, py + 1, pz)
      ) {
        this.showToast('Not enough room for a door');
        return;
      }
      changed =
        this.world.setBlock(px, py, pz, BlockType.OakDoorBottom) &&
        this.world.setBlock(px, py + 1, pz, BlockType.OakDoorTop);
    } else if (chosenBlock === BlockType.TallGrassBottom) {
      const below = this.world.getBlock(px, py - 1, pz);
      if (below !== BlockType.Grass && below !== BlockType.Dirt) {
        this.showToast('Grass must be planted on grass or dirt');
        return;
      }
      if (py + 1 >= CHUNK_HEIGHT || !isReplaceableBlock(this.world.getBlock(px, py + 1, pz))) {
        this.showToast('Not enough room for Tall Grass');
        return;
      }
      changed =
        this.world.setBlock(px, py, pz, BlockType.TallGrassBottom) &&
        this.world.setBlock(px, py + 1, pz, BlockType.TallGrassTop);
    } else if (chosenBlock === BlockType.ShortGrass) {
      const below = this.world.getBlock(px, py - 1, pz);
      if (below !== BlockType.Grass && below !== BlockType.Dirt) {
        this.showToast('Grass must be planted on grass or dirt');
        return;
      }
      changed = this.world.setBlock(px, py, pz, BlockType.ShortGrass);
    } else if (chosenBlock === BlockType.BedFoot) {
      const northExisting = this.world.getBlock(px, py, pz - 1);
      const canPlaceNorth =
        isReplaceableBlock(northExisting) &&
        !this.blockIntersectsPlayer(px, py, pz - 1);
      if (canPlaceNorth) {
        changed =
          this.world.setBlock(px, py, pz, BlockType.BedFoot) &&
          this.world.setBlock(px, py, pz - 1, BlockType.BedHead);
      } else {
        const southExisting = this.world.getBlock(px, py, pz + 1);
        const canPlaceSouth =
          isReplaceableBlock(southExisting) &&
          !this.blockIntersectsPlayer(px, py, pz + 1);
        if (canPlaceSouth) {
          changed =
            this.world.setBlock(px, py, pz, BlockType.BedHead) &&
            this.world.setBlock(px, py, pz + 1, BlockType.BedFoot);
        } else {
          this.showToast('Not enough room for a bed');
          return;
        }
      }
    } else {
      changed = this.world.setBlock(px, py, pz, chosenBlock);
    }

    if (changed) {
      if (this.mode === 'survival') {
        const slot = this.survivalSlots[this.activeSlot];
        if (slot) {
          slot.count -= 1;
          if (slot.count <= 0) {
            this.survivalSlots[this.activeSlot] = null;
          }
        }
        this.syncViewmodel();
        this.emitInventory();
      }

      this.viewmodel.triggerSwing();
      this.particles.spawnBurst(px, py, pz, chosenBlock, 6);
      this.sound.playPlace(def.sound);
      this.crosshairPulse = 1;
      this.rebuildDirtyChunks(6);
      this.scheduleSave();
      this.emitHud();
    }
  }

  public throwHeldItem(dropWholeStack = false) {
    if (this.phase !== 'playing') return;

    let itemToDrop: ItemType | null = null;
    let dropCount = 1;
    let durability: number | undefined;

    if (this.mode === 'survival') {
      const slot = this.survivalSlots[this.activeSlot];
      if (!slot || slot.count <= 0) return;
      itemToDrop = slot.item;
      dropCount = dropWholeStack ? slot.count : 1;
      durability = slot.durability;
      slot.count -= dropCount;
      if (slot.count <= 0) {
        this.survivalSlots[this.activeSlot] = null;
      }
      this.syncViewmodel();
      this.emitInventory();
      this.scheduleSave();
    } else {
      const held = this.creativeHotbar[this.activeSlot];
      if (held === undefined) return;
      itemToDrop = held;
      dropCount = 1;
    }

    if (itemToDrop === null) return;
    const def = ITEM_DEFS[itemToDrop];
    if (!def) return;

    this.camera.getWorldDirection(_rayDir);
    const spawnX = this.camera.position.x + _rayDir.x * 0.55;
    const spawnY = this.camera.position.y - 0.18 + _rayDir.y * 0.25;
    const spawnZ = this.camera.position.z + _rayDir.z * 0.55;
    const throwVel = new THREE.Vector3(
      _rayDir.x * 5.2 + (Math.random() - 0.5) * 0.35,
      Math.max(1.8, _rayDir.y * 4.2 + 2.4),
      _rayDir.z * 5.2 + (Math.random() - 0.5) * 0.35,
    );

    this.droppedItems.spawnDrop(
      itemToDrop,
      dropCount,
      spawnX,
      spawnY,
      spawnZ,
      throwVel,
      1.15,
      durability,
    );
    this.viewmodel.triggerSwing();
    this.sound.playUiTick();
    this.showToast(
      dropCount > 1 ? `Dropped ${def.name} ×${dropCount}` : `Dropped ${def.name}`,
    );
    this.emitHud();
  }

  public pickTargetedBlock() {
    if (this.phase !== 'playing' || !this.currentTarget) return;
    const rawBlock = this.currentTarget.block;
    let b = rawBlock === BlockType.FurnaceLit ? BlockType.Furnace : rawBlock;
    if (isDoorBlock(b)) b = BlockType.OakDoorBottom;
    if (isBedBlock(b)) b = BlockType.BedFoot;
    if (b === BlockType.TallGrassTop) b = BlockType.TallGrassBottom;
    if (!BLOCK_DEFS[b]?.buildable) return;

    if (this.mode === 'creative') {
      this.assignBlockToActiveSlot(b as unknown as ItemType);
    } else {
      // In survival, jump to hotbar slot if you already have that block
      const idx = this.survivalSlots
        .slice(0, HOTBAR_SIZE)
        .findIndex((s) => s !== null && s.item === (b as unknown as ItemType));
      if (idx !== -1) {
        this.setActiveSlot(idx);
      }
    }
  }

  private emitHud() {
    const miningProgress =
      this.mode === 'survival' && this.miningHeld && this.miningBlockKey
        ? Math.min(1, this.miningElapsed / Math.max(0.08, this.miningDuration))
        : 0;

    let targetedName = this.currentTarget ? BLOCK_DEFS[this.currentTarget.block].name : null;
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
      }
    }

    this.callbacks.onHudUpdate({
      mode: this.mode,
      fps: this.fps,
      x: Math.floor(this.playerPos.x),
      y: Math.floor(this.playerPos.y),
      z: Math.floor(this.playerPos.z),
      biome: this.world.getBiomeAt(this.playerPos.x, this.playerPos.z),
      flying: this.flying,
      underwater: this.underwater,
      pointerLocked: this.pointerLocked,
      targetedBlock: targetedName,
      editCount: this.world.getEditCount(),
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

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
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

  private scheduleNextFrame() {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private tick = () => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastFrameMs) / 1000;
    this.lastFrameMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    // Rolling real-time FPS calculation (updates smoothly every 0.4s)
    if (rawDt > 0 && rawDt < 2.0) {
      this.fpsFrames += 1;
      this.fpsAccum += rawDt;
      if (this.fpsAccum >= 0.4) {
        this.fps = Math.max(1, Math.round(this.fpsFrames / this.fpsAccum));
        this.fpsFrames = 0;
        this.fpsAccum = 0;
      }
    }

    this.processChunkStreaming();

    if (this.toastTimer > 0) {
      this.toastTimer = Math.max(0, this.toastTimer - dt);
      if (this.toastTimer === 0) this.toastText = null;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.renderFrame();
      this.scheduleNextFrame();
      return;
    }

    if (this.phase === 'title') {
      if (this.hasPanorama) {
        this.panoramaTime += dt;
        this.panoramaYaw = (this.panoramaYaw - dt * 0.085) % (Math.PI * 2);
        const gentlePitch = -0.07 + Math.sin(this.panoramaTime * 0.22) * 0.06;
        this.panoramaCamera.rotation.set(gentlePitch, this.panoramaYaw, 0, 'YXZ');
      }
    } else if (this.phase === 'playing') {
      this.updatePlayer(dt);
      this.updateFurnaces(dt);
      this.updateLeafDecay(dt);
      this.droppedItems.update(
        dt,
        this.world,
        this.playerPos,
        true,
        (item, count, durability) => {
          if (this.mode === 'survival') {
            const added = addItemToInventory(this.survivalSlots, item, count, durability);
            if (!added) return false;
            this.sound.playPickup();
            this.showToast(`+${count} ${ITEM_DEFS[item]?.name ?? 'Item'}`);
            this.syncViewmodel();
            this.emitInventory();
            this.scheduleSave();
            return true;
          }
          this.sound.playPickup();
          return true;
        },
      );
      this.particles.update(dt, this.world);
      this.wildlife.update(dt, this.world, this.playerPos);
      this.hostiles.update(
        dt,
        this.world,
        this.playerPos,
        this.dayFactor < 0.45,
        this.mode === 'survival',
        this.particles,
        (dmg, kx, kz) => this.applyPlayerDamage(dmg, kx, kz),
        (deathPos) => {
          const roll = Math.random();
          const lootItem =
            roll < 0.45 ? ItemType.Coal : roll < 0.78 ? ItemType.RawIron : ItemType.Stick;
          const lootCount = lootItem === ItemType.RawIron ? 1 : 1 + Math.floor(Math.random() * 2);
          this.droppedItems.spawnDrop(lootItem, lootCount, deathPos.x, deathPos.y, deathPos.z);
        },
      );
      this.clouds.syncMatrices(this.playerPos.x, this.playerPos.z, dt);
      this.updateAtmosphere(dt);

      // Periodic OPFS autosave during active play (position, vitals, time, edits)
      this.autosaveAccumulator += dt;
      if (this.autosaveAccumulator >= 10) {
        this.autosaveAccumulator = 0;
        void this.saveNow();
      }
    } else {
      if (
        this.phase === 'furnace' ||
        this.phase === 'crafting' ||
        this.phase === 'inventory'
      ) {
        this.updateFurnaces(dt);
      }
      this.clouds.syncMatrices(this.playerPos.x, this.playerPos.z, dt * 0.25);
      this.updateAtmosphere(dt);
    }

    if (this.animatedAtlasTiles.length > 0) {
      this.animatedAtlasClock += dt;
      const ctx = this.atlasCanvas.getContext('2d');
      if (ctx) {
        let dirty = false;
        for (let i = 0; i < this.animatedAtlasTiles.length; i++) {
          const anim = this.animatedAtlasTiles[i];
          if (anim.frames.length <= 1) continue;
          const nextFrame =
            Math.floor(this.animatedAtlasClock / anim.frameDurationSec) % anim.frames.length;
          if (nextFrame !== this.animatedAtlasLastFrames[i]) {
            this.animatedAtlasLastFrames[i] = nextFrame;
            const col = anim.tile % ATLAS_COLS;
            const row = Math.floor(anim.tile / ATLAS_COLS);
            const ox = col * TILE_PIXELS;
            const oy = row * TILE_PIXELS;
            ctx.clearRect(ox, oy, TILE_PIXELS, TILE_PIXELS);
            ctx.drawImage(anim.frames[nextFrame], ox, oy);
            dirty = true;
          }
        }
        if (dirty) {
          this.atlasTexture.needsUpdate = true;
        }
      }
    }

    if (this.crosshairPulse > 0) {
      this.crosshairPulse = Math.max(0, this.crosshairPulse - dt * 6);
    }

    this.renderFrame();

    this.hudAccumulator += dt;
    if (this.hudAccumulator >= 0.08) {
      this.hudAccumulator = 0;
      this.emitHud();
    }

    this.scheduleNextFrame();
  };

  private renderFrame() {
    this.renderer.clear();
    if (this.phase === 'title') {
      if (this.hasPanorama) {
        this.renderer.render(this.panoramaScene, this.panoramaCamera);
      }
      return;
    }
    this.renderer.render(this.scene, this.camera);
    if (this.viewmodel.group.visible) {
      const lightScale = 0.48 + this.dayFactor * 0.52;
      this.handHemiLight.intensity = 0.95 * lightScale;
      this.handDirLight.intensity = 1.15 * lightScale;
      this.renderer.clearDepth();
      this.renderer.render(this.handScene, this.handCamera);
    }
  }

  // --- Event Handlers ---

  private onResize = () => {
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

  private onPointerLockChange = () => {
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

  private onMouseMove = (e: MouseEvent) => {
    if (this.phase !== 'playing') return;

    if (this.pointerLocked) {
      const sensitivity = 0.0022 * this.mouseSensitivity;
      this.yaw -= e.movementX * sensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * sensitivity,
        -Math.PI / 2 + 0.04,
        Math.PI / 2 - 0.04,
      );
    } else if (this.isDraggingLook) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      if (Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY) > 5) {
        this.dragMoved = true;
        this.miningHeld = false;
      }
      const sensitivity = 0.0045 * this.mouseSensitivity;
      this.yaw -= dx * sensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - dy * sensitivity,
        -Math.PI / 2 + 0.04,
        Math.PI / 2 - 0.04,
      );
    }
  };

  private onMouseDown = (e: MouseEvent) => {
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

  private onMouseUp = (e: MouseEvent) => {
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

  private onContextMenu = (e: MouseEvent) => {
    const targetTag = (e.target as HTMLElement | null)?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;
    e.preventDefault();
  };

  private onWheel = (e: WheelEvent) => {
    if (this.phase !== 'playing') return;
    if (Math.abs(e.deltaY) < 4) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    this.setActiveSlot(this.activeSlot + dir);
  };

  private onKeyDown = (e: KeyboardEvent) => {
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
          this.jumpBufferTimer = 0.12;
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

  private onKeyUp = (e: KeyboardEvent) => {
    this.heldKeys.delete(e.code);
    if (e.code === 'KeyX') {
      this.miningHeld = false;
    }
    if (e.code === 'Escape' && this.pendingRelockOnInput && this.phase === 'playing' && !this.pointerLocked) {
      this.requestPointerLockSafe();
    }
  };

  private onWindowBlur = () => {
    this.heldKeys.clear();
    this.isDraggingLook = false;
    this.resetMiningState();
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private onContextRestored = () => {
    this.callbacks.onContextLost(false);
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      void this.saveNow();
    }
  };

  private onPageHide = () => {
    void this.saveNow();
  };

  private bindEvents() {
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
    this.sound.dispose();

    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
