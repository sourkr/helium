/**
 * Authoritative game simulation. Owns all gameplay state and runs a fixed-step
 * tick. Knows nothing about THREE, the DOM or React. Presentation is expressed
 * as pure data: snapshots + events sent through a Transport.
 */
import {
  BLOCK_DEFS,
  BlockType,
  DEFAULT_HOTBAR,
  TerrainPreset,
  TimePreset,
} from '../shared/blocks';
import { addItemToInventory, ITEM_DEFS } from '../shared/survival';
import {
  createStarterSurvivalInventory,
  FurnaceData,
  GameMode,
  HOTBAR_SIZE,
  InventorySlot,
  ItemType,
} from '../shared/survival';
import {
  CHUNK_HEIGHT,
  CHUNK_SIZE,
  RaycastHit,
  VoxelWorld,
  chunkKey,
} from '../shared/world';
import { DAY_LENGTH_SECONDS, EYE_HEIGHT, MAX_SUBSTEPS, RENDER_RADIUS, SERVER_TICK_DT, SERVER_TICK_MS, SNAPSHOT_INTERVAL, TIME_PRESET_VALUES } from '../shared/constants';
import { Vec3, clamp } from '../shared/vec';
import type { FullWorldSave } from '../shared/save';
import { listOpfsWorlds } from '../game/opfsStorage';
import type { GamePhase, HudSnapshot } from '../shared/types';
import type { ClientCommand, ServerMessage } from '../shared/protocol';
import type { GameEvent, ServerSnapshot } from '../shared/snapshots';

import { PlayerSystem } from './systems/PlayerSystem';
import { SurvivalSystem } from './systems/SurvivalSystem';
import { WorldSystem } from './systems/WorldSystem';
import { _rayDir } from './systems/serverScratch';

/** Presentation side-effects requested by the simulation. */
export interface ServerFx {
  toast(text: string): void;
  sound(name: string, args: unknown[]): void;
  particleBurst(x: number, y: number, z: number, block: number, count: number): void;
  particleColorBurst(x: number, y: number, z: number, color: string, count: number): void;
  drop(item: ItemType, count: number, x: number, y: number, z: number, vel?: { x: number; y: number; z: number }, scale?: number, durability?: number): void;
  viewmodelSync(): void;
  viewmodelSwing(): void;
  viewmodelSetItem(item: ItemType | null): void;
  viewmodelUpdate(dt: number, speedRatio: number, grounded: boolean, mining: boolean): void;
  shadowUpdate(x: number, z: number, yaw: number, visible: boolean): void;
  crackVisible(visible: boolean): void;
  crackPos(x: number, y: number, z: number): void;
  crackScale(x: number, y: number, z: number): void;
  crackStage(stage: number): void;
  crackOpacity(opacity: number): void;
  highlightVisible(visible: boolean): void;
  highlightPos(x: number, y: number, z: number): void;
  highlightScale(x: number, y: number, z: number): void;
  fovChanged(): void;
  chunksDirty(): void;
  clearChunkMeshes(): void;
  clearEntities(): void;
  furnaceChange(furnace: FurnaceData | null): void;
  worldsUpdated(worlds: import('../shared/save').WorldSummary[]): void;
}

export class GameServer {
  // ---- authoritative world ----
  world: VoxelWorld = new VoxelWorld(42817, 'meadows');
  worldId = '';
  worldName = 'Meadows Valley';
  worldCreatedAt = Date.now();
  worldReadyForSave = false;

  // ---- player physics ----
  playerPos = new Vec3(0.5, 22, 4.5);
  playerVel = new Vec3();
  eyePos = new Vec3(0.5, 23.56, 4.5);
  viewDir = new Vec3(0, 0, -1);
  yaw = -0.35;
  pitch = -0.06;
  grounded = false;
  flying = false;
  underwater = false;
  coyoteTimer = 0;
  jumpBufferTimer = 0;
  lastSpaceTap = 0;
  stepDist = 0;
  cameraShake = 0;
  crosshairPulse = 0;
  currentTarget: RaycastHit | null = null;
  peakAirY = 22;

  // ---- survival vitals ----
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

  // ---- mining ----
  miningHeld = false;
  miningBlockKey: string | null = null;
  miningElapsed = 0;
  miningDuration = 0.5;
  miningTickAccum = 0;

  // ---- world rules ----
  leafDecayQueue: Array<{ x: number; y: number; z: number; delay: number }> = [];
  leafDecaySet = new Set<string>();
  leafRandomTickAccum = 0;
  bedSpawnPoint: { x: number; y: number; z: number } | null = null;
  timeOfDay = 0.44;
  targetTimeOfDay: number | null = null;
  dayFactor = 1;

  // ---- inventory & phase ----
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
  /** Number of staged crack textures available on the client (0 = opacity fallback). */
  destroyStageCount = 0;
  lastCrackStage = -1;

  // ---- input & settings (mirrored from client) ----
  /** Highest InputCommand.seq processed; echoed so the client can reconcile look prediction. */
  inputSeq = 0;
  heldKeys = new Set<string>();
  baseFov = 72;
  fov = 72;
  mouseSensitivity = 1;
  renderRadius = RENDER_RADIUS;
  playerShadowEnabled = true;
  entityShadowsEnabled = true;

  // ---- loop & streaming ----
  disposed = false;
  saveTimeout: ReturnType<typeof setTimeout> | null = null;
  autosaveAccumulator = 0;
  lastChunkCenterX = Number.NaN;
  lastChunkCenterZ = Number.NaN;
  pendingChunkQueue: Array<[number, number]> = [];
  /** Last chunk buffers sent to the client, used to compute sparse deltas. */
  private readonly sentChunks = new Map<string, Uint8Array>();
  private accumulator = 0;
  private snapshotTimer = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastTickMs = 0;
  private listeners = new Set<(message: ServerMessage) => void>();

  readonly fx: ServerFx;
  readonly player: PlayerSystem;
  readonly survival: SurvivalSystem;
  readonly worldRules: WorldSystem;

  constructor() {
    this.player = new PlayerSystem(this);
    this.survival = new SurvivalSystem(this);
    this.worldRules = new WorldSystem(this);
    this.fx = this.createFx();

    this.worldRules.initializeSpawnAndCoreChunks();
    this.updateViewVectors();
  }

  /**
   * Start the authoritative simulation clock. Kept separate from the constructor so
   * the client can attach transport listeners before the first snapshot is emitted.
   */
  start(): void {
    if (this.disposed || this.tickTimer !== null) return;
    this.lastTickMs = performance.now();
    this.tickTimer = setInterval(() => {
      const now = performance.now();
      const dt = (now - this.lastTickMs) / 1000;
      this.lastTickMs = now;
      this.advance(dt);
    }, SERVER_TICK_MS);
  }

  stop(): void {
    if (this.tickTimer === null) return;
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  // ---- transport plumbing -------------------------------------------------

  receive(command: ClientCommand): void {
    if (this.disposed) return;
    try {
      this.handleCommand(command);
    } catch (err) {
      console.error('[GameServer] command failed', command.type, err);
    }
  }

  onMessage(handler: (message: ServerMessage) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private emit(message: ServerMessage): void {
    for (const listener of this.listeners) listener(message);
  }

  private emitEvent(event: GameEvent): void {
    this.emit({ type: 'event', event });
  }

  // ---- FX bridge ----------------------------------------------------------

  private createFx(): ServerFx {
    const ev = (event: GameEvent) => this.emitEvent(event);
    return {
      toast: (text) => {
        this.toastText = text;
        this.toastTimer = 3.2;
        ev({ type: 'toast', text });
      },
      sound: (name, args) => ev({ type: 'sound', name, arg: args[0] as string | number | undefined }),
      particleBurst: (x, y, z, block, count) => ev({ type: 'particle', kind: 'block', x, y, z, block, count }),
      particleColorBurst: (x, y, z, color, count) => ev({ type: 'particle', kind: 'color', x, y, z, color, count }),
      drop: (item, count, x, y, z, vel, scale, durability) =>
        ev({ type: 'drop', item, count, x, y, z, vel, scale, durability }),
      viewmodelSync: () => ev({ type: 'viewmodel', action: 'sync' }),
      viewmodelSwing: () => ev({ type: 'viewmodel', action: 'swing' }),
      viewmodelSetItem: (item) => ev({ type: 'viewmodel', action: 'sync', item }),
      viewmodelUpdate: (dt, speedRatio, grounded, mining) =>
        ev({ type: 'viewmodelFrame', dt, speedRatio, grounded, mining }),
      shadowUpdate: (x, z, yaw, visible) => ev({ type: 'shadow', x, z, yaw, visible }),
      crackVisible: (visible) => ev({ type: 'crack', field: 'visible', value: visible }),
      crackPos: (x, y, z) => ev({ type: 'crack', field: 'pos', x, y, z }),
      crackScale: (x, y, z) => ev({ type: 'crack', field: 'scale', x, y, z }),
      crackStage: (stage) => ev({ type: 'crack', field: 'stage', value: stage }),
      crackOpacity: (opacity) => ev({ type: 'crack', field: 'opacity', value: opacity }),
      highlightVisible: (visible) => ev({ type: 'highlight', field: 'visible', value: visible }),
      highlightPos: (x, y, z) => ev({ type: 'highlight', field: 'pos', x, y, z }),
      highlightScale: (x, y, z) => ev({ type: 'highlight', field: 'scale', x, y, z }),
      fovChanged: () => ev({ type: 'fov', value: this.fov }),
      chunksDirty: () => ev({ type: 'chunksDirty' }),
      clearChunkMeshes: () => {
        this.sentChunks.clear();
        ev({ type: 'clearChunks' });
      },
      clearEntities: () => ev({ type: 'clearEntities' }),
      furnaceChange: (furnace) => this.emit({ type: 'furnace', furnace }),
      worldsUpdated: (worlds) => this.emit({ type: 'worldsList', worlds }),
    };
  }

  // ---- commands -----------------------------------------------------------

  private handleCommand(cmd: ClientCommand): void {
    switch (cmd.type) {
      case 'input':
        this.inputSeq = Math.max(this.inputSeq, cmd.seq);
        this.heldKeys = new Set(cmd.heldKeys);
        this.yaw -= cmd.lookDx * 0.0022 * cmd.sensitivity;
        this.pitch = clamp(this.pitch - cmd.lookDy * 0.0022 * cmd.sensitivity, -Math.PI / 2 + 0.04, Math.PI / 2 - 0.04);
        this.miningHeld = cmd.miningHeld;
        break;
      case 'setPhase':
        this.setPhase(cmd.phase);
        break;
      case 'setGameMode':
        this.survival.setGameMode(cmd.mode);
        break;
      case 'setActiveSlot':
        this.survival.setActiveSlot(cmd.slot);
        break;
      case 'setFlying':
        this.flying = cmd.flying && this.mode === 'creative';
        this.playerVel.y = 0;
        break;
      case 'jump':
        this.jumpBufferTimer = 0.12;
        break;
      case 'toggleFly':
        this.player.toggleFlyMode();
        break;
      case 'assignBlockToActiveSlot':
        this.survival.assignBlockToActiveSlot(cmd.item);
        break;
      case 'swapSurvivalSlots':
        this.survival.swapSurvivalSlots(cmd.from, cmd.to);
        break;
      case 'placeInventoryItemIntoGrid':
        this.survival.placeInventoryItemIntoGrid(cmd.invIdx, cmd.gridIdx, cmd.count ?? 1);
        break;
      case 'returnGridCellToInventory':
        this.survival.returnGridCellToInventory(cmd.gridIdx);
        break;
      case 'clearCraftingGrid':
        this.survival.clearCraftingGrid(cmd.silent ?? false);
        break;
      case 'fillCraftingGridFromRecipe':
        this.survival.fillCraftingGridFromRecipe(cmd.recipeId);
        break;
      case 'craftFromGrid':
        this.survival.craftFromGrid(cmd.craftAll ?? false);
        break;
      case 'craftRecipeById':
        this.survival.craftRecipeById(cmd.recipeId, cmd.craftAll ?? false);
        break;
      case 'placeInventoryItemIntoFurnace':
        this.survival.placeInventoryItemIntoFurnace(cmd.invIdx, cmd.slot, cmd.count ?? 1);
        break;
      case 'takeFromFurnaceSlot':
        this.survival.takeFromFurnaceSlot(cmd.slot);
        break;
      case 'quickLoadFurnaceSlot':
        this.survival.quickLoadFurnaceSlot(cmd.invIdx, cmd.fullStack ?? true);
        break;
      case 'quickLoadFurnaceRecipe':
        this.survival.quickLoadFurnaceRecipe(cmd.inputItem);
        break;
      case 'eatFromSlot':
        this.survival.eatFromSlot(cmd.slot);
        break;
      case 'breakBlock':
        this.survival.breakTargetedBlock();
        break;
      case 'placeBlock':
        this.survival.useOrPlaceAtTarget();
        break;
      case 'pickBlock':
        this.survival.pickTargetedBlock();
        break;
      case 'throwItem':
        this.survival.throwHeldItem(cmd.dropWholeStack ?? false);
        break;
      case 'respawn':
        this.worldRules.respawnPlayer();
        break;
      case 'setTimePreset':
        this.targetTimeOfDay = TIME_PRESET_VALUES[cmd.preset];
        break;
      case 'resetMiningState':
        this.resetMiningState();
        break;
      case 'setWorldName':
        this.worldRules.setWorldName(cmd.name);
        break;
      case 'regenerateWorld':
        this.worldRules.regenerateWorld(cmd.seed, cmd.preset);
        this.sendWorldInfo();
        break;
      case 'resetWorldEdits':
        this.worldRules.resetWorldEdits();
        break;
      case 'loadWorldState':
        this.worldRules.loadWorldState(cmd.save);
        this.sendWorldInfo();
        break;
      case 'saveNow':
        void this.saveNow().then((worlds) => this.emit({ type: 'saveResult', worlds }));
        break;
      case 'listWorlds':
        void this.listWorlds();
        break;
      case 'meleeHit':
        this.applyMeleeResult(cmd.hit);
        break;
      case 'playerDamage':
        this.applyPlayerDamage(cmd.amount, cmd.knockX, cmd.knockZ);
        break;
      case 'destroyStages':
        this.destroyStageCount = Math.max(0, Math.min(32, cmd.count));
        break;
      case 'pickupItem': {
        const added = addItemToInventory(this.survivalSlots, cmd.item, cmd.count, cmd.durability);
        if (added) {
          this.fx.sound('playPickup', []);
          this.fx.toast(`+${cmd.count} ${ITEM_DEFS[cmd.item]?.name ?? 'Item'}`);
          this.emitInventory();
          this.scheduleSave();
        }
        break;
      }
      case 'dispose':
        this.dispose();
        break;
    }
  }

  /** Applied after the client resolves a melee swing against entity visuals. */
  private applyMeleeResult(hit: { kind: 'hostile' | 'wildlife'; x: number; y: number; z: number; killed: boolean }): void {
    // Entity visuals live on the client, so validate the reported hit against
    // the player's authoritative position before granting rewards.
    const dx = hit.x - this.playerPos.x;
    const dz = hit.z - this.playerPos.z;
    const dy = hit.y - (this.playerPos.y + EYE_HEIGHT);
    if (!Number.isFinite(dx + dy + dz) || dx * dx + dz * dz > 25 || Math.abs(dy) > 5) return;

    const equipped = this.getEquippedItem();
    this.fx.viewmodelSwing();
    this.fx.sound('playStrike', []);
    this.cameraShake = hit.kind === 'hostile' ? 0.035 : 0.025;
    this.crosshairPulse = 1;
    this.hitstopTimer = hit.kind === 'hostile' ? 0.035 : 0;
    if (this.mode === 'survival' && equipped !== null) {
      const toolKind = ITEM_DEFS[equipped]?.toolKind;
      if (toolKind && toolKind !== 'hand') {
        this.consumeActiveToolDurability(toolKind === 'sword' ? 1 : 2, hit);
      }
    }
    if (hit.killed) {
      this.mobsDefeated += 1;
      if (hit.kind === 'hostile') {
        const roll = Math.random();
        const drop = roll < 0.48 ? ItemType.Coal : roll < 0.85 ? ItemType.RawIron : ItemType.Stick;
        this.fx.drop(drop, 1, hit.x, hit.y - 0.35, hit.z);
        this.fx.toast('Defeated Night Walker');
        this.fx.particleColorBurst(hit.x, hit.y, hit.z, '#72a367', 18);
      } else {
        this.fx.drop(ItemType.RawMutton, 1, hit.x, hit.y - 0.25, hit.z);
        this.fx.drop(ItemType.WhiteWool, 1, hit.x, hit.y - 0.25, hit.z);
        this.fx.particleColorBurst(hit.x, hit.y, hit.z, '#f2efe6', 16);
      }
      this.scheduleSave();
    }
    this.emitInventory();
  }

  // ---- tick ---------------------------------------------------------------

  /** Advance the simulation by real elapsed time using fixed substeps. */
  advance(realDt: number): void {
    if (this.disposed) return;
    this.accumulator += Math.min(realDt, 0.25);
    let steps = 0;
    while (this.accumulator >= SERVER_TICK_DT && steps < MAX_SUBSTEPS) {
      this.tick(SERVER_TICK_DT);
      this.accumulator -= SERVER_TICK_DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) this.accumulator = 0;

    // Keep the surplus: resetting to zero stretches a slightly-long frame into
    // a missed snapshot, which makes client interpolation hitch every other tick.
    this.snapshotTimer += realDt;
    if (this.snapshotTimer >= SNAPSHOT_INTERVAL) {
      this.snapshotTimer %= SNAPSHOT_INTERVAL;
      this.emitSnapshot();
    }
  }

  private tick(dt: number): void {
    this.queueServerChunks();
    this.processServerChunks();

    if (this.toastTimer > 0) {
      this.toastTimer = Math.max(0, this.toastTimer - dt);
      if (this.toastTimer === 0) this.toastText = null;
    }
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    if (this.phase === 'playing') {
      this.player.updatePlayer(dt);
      this.survival.updateFurnaces(dt);
      this.worldRules.updateLeafDecay(dt);
      this.survival.updateSurvivalVitals(dt, this.isSprinting(), this.isMoving());
      this.survival.updateSurvivalMining(dt);
      this.updateTime(dt);
      this.autosaveAccumulator += dt;
      if (this.autosaveAccumulator >= 10) {
        this.autosaveAccumulator = 0;
        void this.saveNow();
      }
    } else if (this.phase === 'furnace' || this.phase === 'crafting' || this.phase === 'inventory') {
      this.survival.updateFurnaces(dt);
    }

    if (this.crosshairPulse > 0) this.crosshairPulse = Math.max(0, this.crosshairPulse - dt * 6);
    this.survivalSeconds += dt;
    this.updateViewVectors();
  }

  private updateTime(dt: number): void {
    if (this.targetTimeOfDay !== null) {
      const diff = this.targetTimeOfDay - this.timeOfDay;
      this.timeOfDay += Math.sign(diff) * Math.min(Math.abs(diff), dt * 0.28);
      if (Math.abs(diff) < 0.001) this.timeOfDay = this.targetTimeOfDay;
    } else {
      this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH_SECONDS) % 1;
    }
    this.dayFactor = clamp(Math.sin(this.timeOfDay * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5, 0, 1);
  }

  private updateViewVectors(): void {
    this.eyePos.set(this.playerPos.x, this.playerPos.y + EYE_HEIGHT, this.playerPos.z);
    const cp = Math.cos(this.pitch);
    this.viewDir.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
  }

  setEyePos(x: number, y: number, z: number): void {
    this.playerPos.set(x, y - EYE_HEIGHT, z);
    this.updateViewVectors();
  }

  isSprinting(): boolean {
    if (this.mode !== 'survival' || this.hunger <= 4) return false;
    return (this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight')) && this.isMoving();
  }

  isMoving(): boolean {
    return (
      this.heldKeys.has('KeyW') || this.heldKeys.has('KeyS') ||
      this.heldKeys.has('KeyA') || this.heldKeys.has('KeyD')
    );
  }

  // ---- server-side chunk ownership ---------------------------------------

  /** Queue chunk columns for generation around the player on the server. */
  queueServerChunks(): void {
    const cx = Math.floor(this.playerPos.x / CHUNK_SIZE);
    const cz = Math.floor(this.playerPos.z / CHUNK_SIZE);
    if (cx === this.lastChunkCenterX && cz === this.lastChunkCenterZ) return;
    this.lastChunkCenterX = cx;
    this.lastChunkCenterZ = cz;
    const needed = new Set<string>();
    const toLoad: Array<{ cx: number; cz: number; d: number }> = [];
    const r = this.renderRadius;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > (r + 0.5) * (r + 0.5)) continue;
        const wx = cx + dx;
        const wz = cz + dz;
        needed.add(chunkKey(wx, wz));
        if (!this.world.hasChunk(wx, wz)) toLoad.push({ cx: wx, cz: wz, d: dx * dx + dz * dz });
      }
    }
    toLoad.sort((a, b) => a.d - b.d);
    this.pendingChunkQueue = toLoad.map((c) => [c.cx, c.cz]);
    for (const key of this.world.getLoadedChunkKeys()) {
      if (!needed.has(key)) {
        const [ucx, ucz] = key.split(',').map(Number);
        if (Math.hypot(ucx - cx, ucz - cz) > r + 1.5) {
          this.world.unloadChunk(ucx, ucz);
          this.sentChunks.delete(chunkKey(ucx, ucz));
          this.emit({ type: 'chunkUnload', cx: ucx, cz: ucz });
        }
      }
    }
  }

  private processServerChunks(): void {
    let loaded = 0;
    while (this.pendingChunkQueue.length > 0 && loaded < 2) {
      const [cx, cz] = this.pendingChunkQueue.shift()!;
      this.world.ensureChunk(cx, cz);
      this.sendChunk(cx, cz);
      loaded++;
    }
    for (const [cx, cz] of this.world.consumeDirtyChunks()) this.sendChunk(cx, cz);
  }

  private sendChunk(cx: number, cz: number): void {
    if (!this.world.hasChunk(cx, cz)) return;
    const key = chunkKey(cx, cz);
    const current = this.world.ensureChunk(cx, cz);
    const baseline = this.sentChunks.get(key);

    if (!baseline) {
      // Copy so later world mutations never alias the transport payload.
      const data = current.slice();
      this.sentChunks.set(key, data);
      this.emit({ type: 'chunk', chunk: { cx, cz, data } });
      return;
    }

    const edits: Array<{ index: number; block: number }> = [];
    for (let i = 0; i < current.length; i++) {
      if (current[i] !== baseline[i]) edits.push({ index: i, block: current[i] });
    }
    if (edits.length === 0) return;
    baseline.set(current);
    this.emit({ type: 'chunkDelta', delta: { cx, cz, edits } });
  }

  /** Push all currently loaded chunks (used after world load / regenerate). */
  sendAllChunks(): void {
    for (const key of this.world.getLoadedChunkKeys()) {
      const [cx, cz] = key.split(',').map(Number);
      this.sendChunk(cx, cz);
    }
  }

  private sendWorldInfo(): void {
    this.emit({ type: 'worldInfo', seed: this.world.seed, preset: this.world.preset, mode: this.mode });
  }

  // ---- snapshots ----------------------------------------------------------

  private buildSnapshot(): ServerSnapshot {
    return {
      player: {
        x: this.playerPos.x, y: this.playerPos.y, z: this.playerPos.z,
        vx: this.playerVel.x, vy: this.playerVel.y, vz: this.playerVel.z,
        yaw: this.yaw, pitch: this.pitch, inputSeq: this.inputSeq,
        grounded: this.grounded, flying: this.flying, underwater: this.underwater,
        sprinting: this.isSprinting(),
        health: this.health, hunger: this.hunger, oxygen: this.oxygen,
        exhaustion: this.exhaustion,
        blocksMined: this.blocksMined, mobsDefeated: this.mobsDefeated,
        survivalSeconds: this.survivalSeconds,
        crosshairPulse: this.crosshairPulse, damageFlash: this.damageFlash,
        toastText: this.toastText, miningProgress: this.miningProgress(),
        currentTarget: this.currentTarget,
      },
      inventory: {
        mode: this.mode,
        creativeHotbar: [...this.creativeHotbar],
        survivalSlots: this.survivalSlots.map((s) => (s ? { ...s } : null)),
        craftingGrid: this.craftingGrid.map((s) => (s ? { ...s } : null)),
        activeSlot: this.activeSlot,
        furnaces: Object.fromEntries([...this.furnaces].map(([k, v]) => [k, this.cloneFurnaceData(v)])),
        activeFurnaceKey: this.activeFurnaceKey,
      },
      world: {
        seed: this.world.seed,
        preset: this.world.preset,
        timeOfDay: this.timeOfDay,
        editCount: this.world.getEditCount(),
        worldId: this.worldId,
        worldName: this.worldName,
      },
      hud: {
        biome: this.world.getBiomeAt(this.playerPos.x, this.playerPos.z),
        targetedBlock: this.targetedBlockName(),
        fps: 0,
        pointerLocked: false,
      },
      entities: [],
    };
  }

  private emitSnapshot(): void {
    const snapshot = this.buildSnapshot();
    this.lastSnapshot = snapshot;
    this.emit({ type: 'snapshot', snapshot });
  }

  private miningProgress(): number {
    if (this.mode !== 'survival' || !this.miningHeld || !this.miningBlockKey) return 0;
    return Math.min(1, this.miningElapsed / Math.max(0.08, this.miningDuration));
  }

  private targetedBlockName(): string | null {
    if (!this.currentTarget) return null;
    const name = this.currentTargetName(this.currentTarget.block);
    return name;
  }

  private currentTargetName(block: BlockType): string {
    if (block === BlockType.CraftingTable) return 'Crafting Table (RMB to craft)';
    if (block === BlockType.Furnace || block === BlockType.FurnaceLit) return 'Furnace (RMB to smelt)';
    return BLOCK_DEFS[block]?.name ?? null;
  }

  buildHud(fps: number, pointerLocked: boolean): HudSnapshot {
    const s = this.lastSnapshot;
    return {
      mode: this.mode,
      fps,
      x: Math.floor(this.playerPos.x),
      y: Math.floor(this.playerPos.y),
      z: Math.floor(this.playerPos.z),
      biome: this.world.getBiomeAt(this.playerPos.x, this.playerPos.z),
      flying: this.flying,
      underwater: this.underwater,
      pointerLocked,
      targetedBlock: s?.hud.targetedBlock ?? null,
      editCount: this.world.getEditCount(),
      timeOfDay: this.timeOfDay,
      crosshairPulse: this.crosshairPulse,
      health: this.health,
      maxHealth: this.maxHealth,
      hunger: this.hunger,
      maxHunger: this.maxHunger,
      oxygen: this.oxygen,
      maxOxygen: this.maxOxygen,
      miningProgress: this.miningProgress(),
      damageFlash: this.damageFlash,
      toastText: this.toastText,
      blocksMined: this.blocksMined,
      mobsDefeated: this.mobsDefeated,
      survivalSeconds: Math.floor(this.survivalSeconds),
    };
  }

  private lastSnapshot: ServerSnapshot | null = null;

  /** Force an immediate snapshot (used after discrete state changes). */
  emitHud(): void {
    this.emitSnapshot();
  }

  emitInventory(): void {
    this.emitSnapshot();
  }

  emitActiveFurnace(): void {
    const key = this.activeFurnaceKey;
    const furnace = key ? this.furnaces.get(key) ?? null : null;
    this.emit({ type: 'furnace', furnace: furnace ? this.cloneFurnaceData(furnace) : null });
  }

  // ---- system delegates --------------------------------------------------

  setPhase(phase: GamePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.emitEvent({ type: 'phase', phase });
  }

  cloneFurnaceData(f: FurnaceData): FurnaceData {
    return structuredClone(f);
  }

  resetMiningState(): void {
    this.miningHeld = false;
    this.miningBlockKey = null;
    this.miningElapsed = 0;
    this.lastCrackStage = -1;
  }

  getEquippedItem(): ItemType | null {
    const slot = this.survivalSlots[this.activeSlot];
    return slot?.item ?? null;
  }

  setActiveSlot(slot: number): void {
    this.survival.setActiveSlot(slot);
  }

  assignBlockToActiveSlot(item: ItemType): void {
    this.survival.assignBlockToActiveSlot(item);
  }

  clearCraftingGrid(silent = false): void {
    this.survival.clearCraftingGrid(silent);
  }

  eatFromSlot(slot: number): boolean {
    return this.survival.eatFromSlot(slot);
  }

  updateSurvivalVitals(dt: number, sprinting: boolean, moving: boolean): void {
    this.survival.updateSurvivalVitals(dt, sprinting, moving);
  }

  updateSurvivalMining(dt: number): void {
    this.survival.updateSurvivalMining(dt);
  }

  initializeSpawnAndCoreChunks(): void {
    this.worldRules.initializeSpawnAndCoreChunks();
  }

  regenerateWorld(seed: number, preset: TerrainPreset): void {
    this.worldRules.regenerateWorld(seed, preset);
  }

  getOrCreateFurnace(key: string): FurnaceData {
    return this.survival.getOrCreateFurnace(key);
  }

  getActiveCraftingGridSize(): 2 | 3 {
    return this.survival.getActiveCraftingGridSize();
  }

  placeInventoryItemIntoFurnace(invIdx: number, slot: 'input' | 'fuel', count = 1): boolean {
    return this.survival.placeInventoryItemIntoFurnace(invIdx, slot, count);
  }

  consumeActiveToolDurability(amount: number, at: { x: number; y: number; z: number }): void {
    this.survival.consumeActiveToolDurability(amount, at);
  }

  applyPlayerDamage(amount: number, knockX = 0, knockZ = 0): void {
    this.survival.applyPlayerDamage(amount, knockX, knockZ);
  }

  collidesAt(x: number, y: number, z: number): boolean {
    return this.player.collidesAt(x, y, z);
  }

  blockIntersectsPlayer(bx: number, by: number, bz: number): boolean {
    return this.player.blockIntersectsPlayer(bx, by, bz);
  }

  updatePlayer(dt: number): void {
    this.player.updatePlayer(dt);
  }

  updateFurnaces(dt: number): void {
    this.survival.updateFurnaces(dt);
  }

  updateLeafDecay(dt: number): void {
    this.worldRules.updateLeafDecay(dt);
  }

  enqueueLeavesAround(x: number, y: number, z: number, radius = 6): void {
    this.worldRules.enqueueLeavesAround(x, y, z, radius);
  }

  completeBlockBreak(t: RaycastHit): void {
    this.survival.completeBlockBreak(t);
  }

  resetEntities(): void {
    this.fx.clearEntities();
  }

  exportFullSave(): FullWorldSave {
    return this.worldRules.exportFullSave();
  }

  async saveNow(): Promise<import('../shared/save').WorldSummary[] | null> {
    return this.worldRules.saveNow();
  }

  scheduleSave(): void {
    this.worldRules.scheduleSave();
  }

  private async listWorlds(): Promise<void> {
    const { worlds } = await listOpfsWorlds();
    this.emit({ type: 'worldsList', worlds });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    if (this.saveTimeout !== null) clearTimeout(this.saveTimeout);
    this.listeners.clear();
    // The transport is owned by the client; the server only reads/writes it.
  }
}
