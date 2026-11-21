/**
 * Wire protocol between the presentation client and the authoritative server.
 *
 * Lifecycle:
 *  1. The client creates a Transport, subscribes with `onMessage`, and attaches
 *     the server as the command endpoint (`LocalTransport.attachServer`).
 *  2. Input is streamed every client frame as `InputCommand`; look deltas are
 *     consumed (reset to zero) by the client after each send.
 *  3. Discrete actions (mining, inventory, world management) are one-shot
 *     commands issued in response to user input.
 *  4. The server emits `snapshot` messages on a fixed cadence and `event`
 *     messages for one-shot presentation effects. `chunk`/`chunkUnload` carry
 *     the world mirror the client renders.
 *
 * Ownership:
 *  - Commands are *requests*. The server may ignore them (e.g. `setFlying` in
 *    survival mode) and always re-states the result in the next snapshot.
 *  - Snapshots are the sole source of truth for gameplay state. Clients must
 *    never mutate authoritative fields locally.
 *  - Events are fire-and-forget presentation hints; dropping one is harmless.
 */
import type { TerrainPreset, TimePreset } from './blocks';
import type { FurnaceData, GameMode, ItemType } from './survival';
import type { GamePhase } from './types';
import type { FullWorldSave, WorldSummary } from './save';
import type { ChunkDeltaSnapshot, ChunkSnapshot, GameEvent, ServerSnapshot } from './snapshots';

/**
 * Streamed every client frame. `lookDx`/`lookDy` are deltas since the previous
 * frame; the server applies `sensitivity` once and the client resets them.
 */
export type InputCommand = {
  type: 'input';
  /** Monotonic client sequence; echoed in snapshots so look prediction can be reconciled. */
  seq: number;
  heldKeys: string[];
  lookDx: number;
  lookDy: number;
  sensitivity: number;
  miningHeld: boolean;
};

export type ClientCommand =
  | InputCommand
  // Lifecycle / UI phase
  | { type: 'setPhase'; phase: GamePhase }
  | { type: 'setGameMode'; mode: GameMode }
  | { type: 'setActiveSlot'; slot: number }
  | { type: 'setFlying'; flying: boolean }
  | { type: 'toggleFly' }
  | { type: 'jump' }
  | { type: 'resetMiningState' }
  // Inventory / crafting / furnaces
  | { type: 'assignBlockToActiveSlot'; item: ItemType }
  | { type: 'swapSurvivalSlots'; from: number; to: number }
  | { type: 'placeInventoryItemIntoGrid'; invIdx: number; gridIdx: number; count?: number }
  | { type: 'returnGridCellToInventory'; gridIdx: number }
  | { type: 'clearCraftingGrid'; silent?: boolean }
  | { type: 'fillCraftingGridFromRecipe'; recipeId: string }
  | { type: 'craftFromGrid'; craftAll?: boolean }
  | { type: 'craftRecipeById'; recipeId: string; craftAll?: boolean }
  | { type: 'placeInventoryItemIntoFurnace'; invIdx: number; slot: 'input' | 'fuel'; count?: number }
  | { type: 'takeFromFurnaceSlot'; slot: 'input' | 'fuel' | 'output' }
  | { type: 'quickLoadFurnaceSlot'; invIdx: number; fullStack?: boolean }
  | { type: 'quickLoadFurnaceRecipe'; inputItem: ItemType }
  | { type: 'eatFromSlot'; slot: number }
  // World interaction
  | { type: 'breakBlock' }
  | { type: 'placeBlock' }
  | { type: 'pickBlock' }
  | { type: 'throwItem'; dropWholeStack?: boolean }
  | { type: 'meleeAttack' }
  // Entity interactions reported by client-side visual managers.
  | { type: 'meleeHit'; hit: { kind: 'hostile' | 'wildlife'; x: number; y: number; z: number; killed: boolean } }
  | { type: 'playerDamage'; amount: number; knockX: number; knockZ: number }
  | { type: 'pickupItem'; item: ItemType; count: number; durability?: number }
  | { type: 'respawn' }
  // World lifecycle / persistence (all async, results arrive as messages)
  | { type: 'setTimePreset'; preset: TimePreset }
  | { type: 'setWorldName'; name: string }
  | { type: 'regenerateWorld'; seed: number; preset: TerrainPreset }
  | { type: 'resetWorldEdits' }
  | { type: 'loadWorldState'; save: FullWorldSave }
  | { type: 'saveNow' }
  | { type: 'listWorlds' }
  /** Number of crack-stage textures the client loaded; 0 disables staged cracks. */
  | { type: 'destroyStages'; count: number }
  | { type: 'dispose' };

/**
 * Server -> client messages. The transport is responsible only for delivery;
 * the client must treat snapshots as immutable and apply them in arrival order.
 */
export type ServerMessage =
  | { type: 'ready' }
  | { type: 'snapshot'; snapshot: ServerSnapshot }
  | { type: 'chunk'; chunk: ChunkSnapshot }
  | { type: 'chunkDelta'; delta: ChunkDeltaSnapshot }
  | { type: 'chunkUnload'; cx: number; cz: number }
  | { type: 'event'; event: GameEvent }
  | { type: 'worldsList'; worlds: WorldSummary[] }
  | { type: 'saveResult'; worlds: WorldSummary[] | null }
  | { type: 'worldInfo'; seed: number; preset: TerrainPreset; mode: GameMode }
  | { type: 'furnace'; furnace: FurnaceData | null };
