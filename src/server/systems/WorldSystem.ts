/** Authoritative world lifecycle, persistence, chunk streaming and world rules. */
import { GameServer } from '../GameServer';
import { damp, clamp, Vec3 } from '../../shared/vec';
import { BlockType, DEFAULT_HOTBAR, isBedBlock, isLeafBlock, TerrainPreset } from '../../shared/blocks';
import { addItemToInventory, createStarterSurvivalInventory, FurnaceData, GameMode, HOTBAR_SIZE, ITEM_DEFS, ItemType } from '../../shared/survival';
import type { FullWorldSave, WorldSummary } from '../../shared/save';
import { CHUNK_HEIGHT, CHUNK_SIZE, VoxelWorld } from '../../shared/world';
import { EYE_HEIGHT } from '../../shared/constants';
import { saveOpfsWorld } from '../../game/opfsStorage';

export class WorldSystem {
  constructor(private readonly s: GameServer) {}

  getWorldInfo(): {
    id: string;
    name: string;
    seed: number;
    preset: TerrainPreset;
    mode: GameMode;
  } {
    return {
      id: this.s.worldId,
      name: this.s.worldName,
      seed: this.s.world.seed,
      preset: this.s.world.preset,
      mode: this.s.mode,
    };
  }

  setWorldName(name: string) {
    const trimmed = name.trim();
    if (trimmed) {
      this.s.worldName = trimmed;
    }
  }

  exportFullSave(): FullWorldSave {
    const worldData = this.s.world.exportSave();
    const furnacesRecord: Record<string, FurnaceData> = {};
    for (const [key, data] of this.s.furnaces.entries()) {
      furnacesRecord[key] = this.s.cloneFurnaceData(data);
    }
    return {
      id: this.s.worldId,
      name: this.s.worldName,
      seed: worldData.seed,
      preset: worldData.preset,
      mode: this.s.mode,
      timeOfDay: this.s.timeOfDay,
      createdAt: this.s.worldCreatedAt,
      updatedAt: Date.now(),
      edits: worldData.edits,
      player: {
        x: this.s.playerPos.x,
        y: this.s.playerPos.y,
        z: this.s.playerPos.z,
        yaw: this.s.yaw,
        pitch: this.s.pitch,
        flying: this.s.flying,
        health: this.s.health,
        hunger: this.s.hunger,
        oxygen: this.s.oxygen,
        exhaustion: this.s.exhaustion,
        activeSlot: this.s.activeSlot,
        creativeHotbar: [...this.s.creativeHotbar],
        survivalSlots: this.s.survivalSlots.map((s) => (s ? { ...s } : null)),
        furnaces: furnacesRecord,
        blocksMined: this.s.blocksMined,
        mobsDefeated: this.s.mobsDefeated,
        survivalSeconds: Math.floor(this.s.survivalSeconds),
      },
    };
  }

  async saveNow(): Promise<WorldSummary[] | null> {
    if (this.s.saveTimeout !== null) {
      clearTimeout(this.s.saveTimeout);
      this.s.saveTimeout = null;
    }
    if (!this.s.worldReadyForSave || !this.s.worldId) return null;
    try {
      const { worlds } = await saveOpfsWorld(this.s.exportFullSave());
      if (!this.s.disposed) {
        this.s.fx.worldsUpdated(worlds);
      }
      return worlds;
    } catch {
      return null;
    }
  }

  scheduleSave() {
    if (!this.s.worldReadyForSave || !this.s.worldId) return;
    if (this.s.saveTimeout !== null) {
      clearTimeout(this.s.saveTimeout);
    }
    this.s.saveTimeout = setTimeout(() => {
      this.s.saveTimeout = null;
      void this.s.saveNow();
    }, 400);
  }

  loadWorldState(save: FullWorldSave) {
    if (this.s.saveTimeout !== null) {
      clearTimeout(this.s.saveTimeout);
      this.s.saveTimeout = null;
    }

    this.s.fx.clearChunkMeshes();
    this.s.pendingChunkQueue = [];
    this.s.fx.clearEntities();

    this.s.worldId = save.id;
    this.s.worldName = save.name;
    this.s.worldCreatedAt = save.createdAt;
    this.s.mode = save.mode;
    this.s.timeOfDay = typeof save.timeOfDay === 'number' ? save.timeOfDay : 0.44;
    this.s.targetTimeOfDay = null;
    this.s.autosaveAccumulator = 0;

    this.s.world = new VoxelWorld(save.seed, save.preset, save.edits);
    this.s.resetEntities();

    this.s.craftingGrid.fill(null);
    this.s.furnaces.clear();
    this.s.activeFurnaceKey = null;
    this.s.leafDecayQueue = [];
    this.s.leafDecaySet.clear();
    this.s.leafRandomTickAccum = 0;
    this.s.bedSpawnPoint = null;
    const p = save.player;
    if (p) {
      this.s.flying = this.s.mode === 'creative' ? Boolean(p.flying) : false;
      this.s.health = Math.max(2, Math.min(this.s.maxHealth, p.health ?? this.s.maxHealth));
      this.s.hunger = Math.max(0, Math.min(this.s.maxHunger, p.hunger ?? this.s.maxHunger));
      this.s.oxygen = Math.max(0, Math.min(this.s.maxOxygen, p.oxygen ?? this.s.maxOxygen));
      this.s.exhaustion = Math.max(0, p.exhaustion ?? 0);
      this.s.activeSlot = ((p.activeSlot ?? 0) % HOTBAR_SIZE + HOTBAR_SIZE) % HOTBAR_SIZE;
      this.s.creativeHotbar =
        Array.isArray(p.creativeHotbar) && p.creativeHotbar.length === HOTBAR_SIZE
          ? p.creativeHotbar.map((item, idx) =>
              item in ITEM_DEFS
                ? item
                : ((DEFAULT_HOTBAR[idx] ?? BlockType.WhiteWool) as unknown as ItemType),
            )
          : ([...DEFAULT_HOTBAR] as unknown as ItemType[]);
      this.s.survivalSlots =
        Array.isArray(p.survivalSlots) && p.survivalSlots.length === 27
          ? p.survivalSlots.map((s) => (s && s.item in ITEM_DEFS ? { ...s } : null))
          : createStarterSurvivalInventory();
      if (p.furnaces && typeof p.furnaces === 'object') {
        for (const [k, f] of Object.entries(p.furnaces)) {
          if (f && typeof f === 'object') {
            this.s.furnaces.set(k, this.s.cloneFurnaceData(f));
          }
        }
      }
      this.s.blocksMined = p.blocksMined ?? 0;
      this.s.mobsDefeated = p.mobsDefeated ?? 0;
      this.s.survivalSeconds = p.survivalSeconds ?? 0;
    } else {
      this.s.flying = false;
      this.s.health = this.s.maxHealth;
      this.s.hunger = this.s.maxHunger;
      this.s.oxygen = this.s.maxOxygen;
      this.s.exhaustion = 0;
      this.s.activeSlot = 0;
      this.s.creativeHotbar = [...DEFAULT_HOTBAR] as unknown as ItemType[];
      this.s.survivalSlots = createStarterSurvivalInventory();
      this.s.blocksMined = 0;
      this.s.mobsDefeated = 0;
      this.s.survivalSeconds = 0;
    }

    this.s.damageFlash = 0;
    this.s.hurtCooldown = 0;
    this.s.resetMiningState();

    const hasSavedCoords = p !== null && typeof p.y === 'number' && p.y >= 1 && p.y < CHUNK_HEIGHT;
    const targetX = hasSavedCoords ? p.x : 0.5;
    const targetZ = hasSavedCoords ? p.z : 4.5;
    const centerCX = Math.floor(targetX / CHUNK_SIZE);
    const centerCZ = Math.floor(targetZ / CHUNK_SIZE);

    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.s.world.ensureChunk(centerCX + dx, centerCZ + dz);
      }
    }
    this.s.fx.chunksDirty();

    if (hasSavedCoords) {
      let safeY = p.y;
      if (this.s.collidesAt(targetX, safeY, targetZ)) {
        safeY = this.s.world.getGroundY(targetX, targetZ) + 0.05;
      }
      this.s.playerPos.set(targetX, safeY, targetZ);
      this.s.yaw = typeof p.yaw === 'number' ? p.yaw : -0.35;
      this.s.pitch = typeof p.pitch === 'number' ? p.pitch : -0.06;
    } else {
      const spawnY = this.s.world.getGroundY(0.5, 4.5);
      this.s.playerPos.set(0.5, spawnY + 0.05, 4.5);
      this.s.yaw = -0.35;
      this.s.pitch = -0.06;
    }

    this.s.peakAirY = this.s.playerPos.y;
    this.s.playerVel.set(0, 0, 0);

    this.s.setEyePos(this.s.playerPos.x,
      this.s.playerPos.y + EYE_HEIGHT,
      this.s.playerPos.z,);

    this.s.lastChunkCenterX = Number.NaN;
    this.s.lastChunkCenterZ = Number.NaN;
    this.s.queueServerChunks();

    this.s.worldReadyForSave = true;
    this.s.fx.viewmodelSync();

    this.s.emitInventory();
    this.s.emitHud();
  }

  initializeSpawnAndCoreChunks() {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.s.world.ensureChunk(dx, dz);
      }
    }
    this.s.fx.chunksDirty();

    const spawnY = this.s.world.getGroundY(0.5, 4.5);
    this.s.playerPos.set(0.5, spawnY + 0.05, 4.5);
    this.s.peakAirY = this.s.playerPos.y;
    this.s.playerVel.set(0, 0, 0);
    this.s.yaw = -0.35;
    this.s.pitch = -0.06;

    // Position static scenic spawn camera immediately (no spinning panorama)
    this.s.setEyePos(this.s.playerPos.x,
      this.s.playerPos.y + EYE_HEIGHT,
      this.s.playerPos.z,);

    this.s.lastChunkCenterX = Number.NaN;
    this.s.lastChunkCenterZ = Number.NaN;
    this.s.queueServerChunks();
  }

  regenerateWorld(seed: number, preset: TerrainPreset) {
    this.s.fx.clearChunkMeshes();
    this.s.pendingChunkQueue = [];
    this.s.fx.clearEntities();

    this.s.world = new VoxelWorld(seed, preset);
    this.s.resetEntities();

    this.s.flying = false;
    this.s.health = this.s.maxHealth;
    this.s.hunger = this.s.maxHunger;
    this.s.oxygen = this.s.maxOxygen;
    this.s.exhaustion = 0;
    this.s.timeOfDay = 0.44;
    this.s.targetTimeOfDay = null;
    this.s.survivalSlots = createStarterSurvivalInventory();
    this.s.furnaces.clear();
    this.s.activeFurnaceKey = null;
    this.s.leafDecayQueue = [];
    this.s.leafDecaySet.clear();
    this.s.leafRandomTickAccum = 0;
    this.s.bedSpawnPoint = null;
    this.s.blocksMined = 0;
    this.s.mobsDefeated = 0;
    this.s.survivalSeconds = 0;
    this.s.resetMiningState();

    this.s.initializeSpawnAndCoreChunks();
    this.s.fx.viewmodelSync();

    this.s.emitInventory();
    void this.s.saveNow();
    this.s.emitHud();
  }

  resetWorldEdits() {
    this.s.regenerateWorld(this.s.world.seed, this.s.world.preset);
  }

  respawnPlayer() {
    this.s.health = this.s.maxHealth;
    this.s.hunger = this.s.maxHunger;
    this.s.oxygen = this.s.maxOxygen;
    this.s.exhaustion = 0;
    this.s.damageFlash = 0;
    this.s.hurtCooldown = 1.5;
    this.s.flying = false;
    this.s.fx.clearEntities();
    this.s.resetMiningState();

    let respawnedAtBed = false;
    if (this.s.bedSpawnPoint) {
      const bx = Math.floor(this.s.bedSpawnPoint.x);
      const by = Math.floor(this.s.bedSpawnPoint.y - 0.1);
      const bz = Math.floor(this.s.bedSpawnPoint.z);
      if (isBedBlock(this.s.world.getBlock(bx, by, bz))) {
        this.s.playerPos.set(
          this.s.bedSpawnPoint.x,
          this.s.bedSpawnPoint.y + 0.05,
          this.s.bedSpawnPoint.z,
        );
        respawnedAtBed = true;
      } else {
        this.s.bedSpawnPoint = null;
      }
    }

    if (!respawnedAtBed) {
      const spawnY = this.s.world.getGroundY(0.5, 4.5);
      this.s.playerPos.set(0.5, spawnY + 0.05, 4.5);
    }
    this.s.peakAirY = this.s.playerPos.y;
    this.s.playerVel.set(0, 0, 0);
    this.s.yaw = -0.35;
    this.s.pitch = -0.06;

    this.s.setPhase('playing');
    this.s.fx.toast(respawnedAtBed ? 'Respawned at Bed' : 'Respawned at Trailhead');
    this.s.scheduleSave();
  }

  enqueueLeavesAround(wx: number, wy: number, wz: number, radius = 6) {
    for (let dy = -radius; dy <= radius; dy++) {
      const ny = wy + dy;
      if (ny <= 0 || ny >= CHUNK_HEIGHT) continue;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
          if (dist === 0 || dist > radius + 2) continue;
          const nx = wx + dx;
          const nz = wz + dz;
          const b = this.s.world.getBlock(nx, ny, nz);
          if (!isLeafBlock(b)) continue;
          if (this.s.world.isPlayerPlacedBlock(nx, ny, nz)) continue;

          const key = `${nx},${ny},${nz}`;
          if (this.s.leafDecaySet.has(key)) continue;
          this.s.leafDecaySet.add(key);
          this.s.leafDecayQueue.push({
            x: nx,
            y: ny,
            z: nz,
            delay: 0.35 + dist * 0.35 + Math.random() * 2.4,
          });
        }
      }
    }
  }

  updateLeafDecay(dt: number) {
    let anyDecayed = false;
    let invChanged = false;

    // 1. Advance queued leaf checks (staggered organic decay after chopping trees)
    if (this.s.leafDecayQueue.length > 0) {
      let processed = 0;
      for (let i = this.s.leafDecayQueue.length - 1; i >= 0; i--) {
        const entry = this.s.leafDecayQueue[i];
        entry.delay -= dt;
        if (entry.delay > 0) continue;
        if (processed >= 3) continue;

        processed++;
        this.s.leafDecayQueue.splice(i, 1);
        const key = `${entry.x},${entry.y},${entry.z}`;
        this.s.leafDecaySet.delete(key);

        const b = this.s.world.getBlock(entry.x, entry.y, entry.z);
        if (!isLeafBlock(b)) continue;
        if (this.s.world.isPlayerPlacedBlock(entry.x, entry.y, entry.z)) continue;

        if (!this.s.world.isLeafSupported(entry.x, entry.y, entry.z, 6)) {
          if (this.s.world.setBlock(entry.x, entry.y, entry.z, BlockType.Air)) {
            anyDecayed = true;
            this.s.fx.particleBurst(entry.x, entry.y, entry.z, b, 5);
            const distSq =
              (entry.x + 0.5 - this.s.playerPos.x) ** 2 +
              (entry.y + 0.5 - this.s.playerPos.y) ** 2 +
              (entry.z + 0.5 - this.s.playerPos.z) ** 2;
            if (distSq <= 100) {
              this.s.fx.sound('playMineTick', ['leaves']);
            }
            if (this.s.mode === 'survival' && distSq <= 196) {
              const roll = Math.random();
              if (roll < 0.06) {
                addItemToInventory(this.s.survivalSlots, ItemType.Apple, 1);
                invChanged = true;
              } else if (roll < 0.16) {
                addItemToInventory(this.s.survivalSlots, ItemType.Stick, 1);
                invChanged = true;
              }
            }
            this.s.enqueueLeavesAround(entry.x, entry.y, entry.z, 1);
          }
        }
      }
    }

    // 2. Minecraft-style random ticks around the player to catch any stray unsupported natural leaves
    this.s.leafRandomTickAccum += dt;
    if (this.s.leafRandomTickAccum >= 0.45) {
      this.s.leafRandomTickAccum = 0;
      const px = Math.floor(this.s.playerPos.x);
      const pz = Math.floor(this.s.playerPos.z);
      for (let s = 0; s < 14; s++) {
        const rx = px + Math.floor((Math.random() - 0.5) * 44);
        const rz = pz + Math.floor((Math.random() - 0.5) * 44);
        const ry = 8 + Math.floor(Math.random() * 34);
        if (ry <= 0 || ry >= CHUNK_HEIGHT) continue;
        const b = this.s.world.getBlock(rx, ry, rz);
        if (!isLeafBlock(b)) continue;
        if (this.s.world.isPlayerPlacedBlock(rx, ry, rz)) continue;
        const key = `${rx},${ry},${rz}`;
        if (this.s.leafDecaySet.has(key)) continue;
        if (!this.s.world.isLeafSupported(rx, ry, rz, 6)) {
          this.s.leafDecaySet.add(key);
          this.s.leafDecayQueue.push({
            x: rx,
            y: ry,
            z: rz,
            delay: 0.15 + Math.random() * 0.85,
          });
        }
      }
    }

    if (anyDecayed) {
      this.s.fx.chunksDirty();
      this.s.scheduleSave();
    }
    if (invChanged) {
      this.s.fx.viewmodelSync();
      this.s.emitInventory();
    }
  }
}
