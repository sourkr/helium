/**
 * Server -> client data transfer objects. Everything here is plain data so it
 * can travel through a LocalTransport today and a Worker/WebSocket tomorrow.
 */
import type { GameMode, InventorySlot, FurnaceData, ItemType } from './survival';
import type { GamePhase } from './types';
import type { RaycastHit } from './world';

export interface PlayerSnapshot {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  /** Highest client input sequence folded into this snapshot. */
  inputSeq: number;
  grounded: boolean;
  flying: boolean;
  underwater: boolean;
  sprinting: boolean;
  health: number;
  hunger: number;
  oxygen: number;
  exhaustion: number;
  blocksMined: number;
  mobsDefeated: number;
  survivalSeconds: number;
  crosshairPulse: number;
  damageFlash: number;
  toastText: string | null;
  miningProgress: number;
  currentTarget: RaycastHit | null;
}

export interface InventorySnapshot {
  mode: GameMode;
  creativeHotbar: ItemType[];
  survivalSlots: Array<InventorySlot | null>;
  craftingGrid: Array<InventorySlot | null>;
  activeSlot: number;
  furnaces: Record<string, FurnaceData>;
  activeFurnaceKey: string | null;
}

export interface WorldSnapshot {
  seed: number;
  preset: string;
  timeOfDay: number;
  editCount: number;
  worldId: string;
  worldName: string;
}

export interface HudSnapshotData {
  biome: string;
  targetedBlock: string | null;
  fps: number;
  pointerLocked: boolean;
}

export interface EntitySnapshot {
  id: number;
  kind: 'wildlife' | 'hostile' | 'drop';
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Manager-specific state (type, health, item id, count, animation flags). */
  data: Record<string, number | string | boolean | null>;
}

export interface ChunkSnapshot {
  cx: number;
  cz: number;
  /** Packed block ids, length CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE. */
  data: Uint8Array;
}

/** Sparse update against the last full ChunkSnapshot for the same chunk. */
export interface ChunkDeltaSnapshot {
  cx: number;
  cz: number;
  /** Packed-buffer indices and their new block ids. */
  edits: Array<{ index: number; block: number }>;
}

/** Emitted when authoritative state changes discrete presentation state. */
export type GameEvent =
  | { type: 'toast'; text: string }
  | { type: 'sound'; name: string; arg?: string | number }
  | { type: 'particle'; kind: 'block' | 'color'; x: number; y: number; z: number; block?: number; color?: string; count?: number }
  | { type: 'blockBroken'; x: number; y: number; z: number; block: number }
  | { type: 'blockPlaced'; x: number; y: number; z: number; block: number }
  | { type: 'cameraShake'; amount: number }
  | { type: 'phase'; phase: GamePhase }
  | { type: 'hitstop'; duration: number }
  | { type: 'drop'; item: ItemType; count: number; x: number; y: number; z: number; vel?: { x: number; y: number; z: number }; scale?: number; durability?: number }
  | { type: 'clearEntities' }
  | { type: 'clearChunks' }
  | { type: 'chunksDirty' }
  | { type: 'fov'; value: number }
  | { type: 'viewmodel'; action: 'swing' | 'sync'; item?: ItemType | null }
  | { type: 'viewmodelFrame'; dt: number; speedRatio: number; grounded: boolean; mining: boolean }
  | { type: 'shadow'; x: number; z: number; yaw: number; visible: boolean }
  | { type: 'crack'; field: 'visible' | 'pos' | 'scale' | 'stage' | 'opacity'; x?: number; y?: number; z?: number; value?: number | boolean }
  | { type: 'highlight'; field: 'visible' | 'pos' | 'scale'; x?: number; y?: number; z?: number; value?: boolean };

export interface ServerSnapshot {
  player: PlayerSnapshot;
  inventory: InventorySnapshot;
  world: WorldSnapshot;
  hud: HudSnapshotData;
  entities: EntitySnapshot[];
}
