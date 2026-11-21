import { DEFAULT_HOTBAR, TerrainPreset } from '../shared/blocks';
import {
  createStarterSurvivalInventory,
  FurnaceData,
  GameMode,
  InventorySlot,
  ItemType,
} from '../shared/survival';
import type { FullWorldSave, SavedPlayerState, WorldSummary } from '../shared/save';

export type { FullWorldSave, SavedPlayerState, WorldSummary };

interface WorldsIndexFile {
  version: number;
  activeWorldId: string | null;
  worlds: WorldSummary[];
}

interface LegacyLocalSave {
  seed: number;
  preset: TerrainPreset;
  edits: Array<[string, number]>;
  mode?: GameMode;
  survivalSlots?: Array<InventorySlot | null>;
  health?: number;
  hunger?: number;
  blocksMined?: number;
  mobsDefeated?: number;
}

// Typed OPFS helpers (covers createWritable across all TypeScript DOM lib versions)
interface OpfsWritableStream {
  write(data: string | Uint8Array | Blob): Promise<void>;
  close(): Promise<void>;
}

interface OpfsFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<OpfsWritableStream>;
}

interface OpfsDirectoryHandle {
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<OpfsDirectoryHandle>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<OpfsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

const ROOT_DIR_NAME = 'voxelvale';
const WORLDS_DIR_NAME = 'worlds';
const PANORAMA_DIR_NAME = 'panorama';
const INDEX_FILE_NAME = 'worlds.json';
const LEGACY_LOCAL_KEY = 'voxelvale_world_v2';
const FALLBACK_INDEX_KEY = 'voxelvale_opfs_fallback_index_v1';
const FALLBACK_WORLD_PREFIX = 'voxelvale_opfs_fallback_world_v1_';
const FALLBACK_PANORAMA_KEY = 'voxelvale_opfs_fallback_panorama_v1';

export const PANORAMA_FACE_KEYS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;

let opfsRootPromise: Promise<OpfsDirectoryHandle | null> | null = null;
let storageBackend: 'opfs' | 'fallback' = 'opfs';

// Serialize all OPFS mutations so concurrent writes never collide on the same file handle
let writeChain: Promise<unknown> = Promise.resolve();

function enqueueOp<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function getOpfsRoot(): Promise<OpfsDirectoryHandle | null> {
  if (!opfsRootPromise) {
    opfsRootPromise = (async () => {
      try {
        const storage = navigator.storage as unknown as {
          getDirectory?: () => Promise<OpfsDirectoryHandle>;
        };
        if (!storage || typeof storage.getDirectory !== 'function') {
          storageBackend = 'fallback';
          return null;
        }
        const root = await storage.getDirectory();
        const appDir = await root.getDirectoryHandle(ROOT_DIR_NAME, { create: true });
        await appDir.getDirectoryHandle(WORLDS_DIR_NAME, { create: true });
        storageBackend = 'opfs';
        return appDir;
      } catch {
        storageBackend = 'fallback';
        return null;
      }
    })();
  }
  return opfsRootPromise;
}

export function getStorageBackendName(): 'OPFS' | 'Local Storage' {
  return storageBackend === 'opfs' ? 'OPFS' : 'Local Storage';
}

async function readJsonFile<T>(
  dir: OpfsDirectoryHandle,
  filename: string,
): Promise<T | null> {
  try {
    const handle = await dir.getFileHandle(filename);
    const file = await handle.getFile();
    const text = await file.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(
  dir: OpfsDirectoryHandle,
  filename: string,
  data: unknown,
): Promise<void> {
  const handle = await dir.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data));
  await writable.close();
}

function generateWorldId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `w_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function summaryFromSave(save: FullWorldSave): WorldSummary {
  return {
    id: save.id,
    name: save.name,
    seed: save.seed,
    preset: save.preset,
    mode: save.mode,
    editCount: save.edits.length,
    blocksMined: save.player?.blocksMined ?? 0,
    mobsDefeated: save.player?.mobsDefeated ?? 0,
    survivalSeconds: save.player?.survivalSeconds ?? 0,
    createdAt: save.createdAt,
    updatedAt: save.updatedAt,
  };
}

function readFallbackIndex(): WorldsIndexFile {
  try {
    const raw = localStorage.getItem(FALLBACK_INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorldsIndexFile;
      if (Array.isArray(parsed.worlds)) return parsed;
    }
  } catch {
    // Ignore corrupt fallback
  }
  return { version: 1, activeWorldId: null, worlds: [] };
}

function writeFallbackIndex(index: WorldsIndexFile) {
  try {
    localStorage.setItem(FALLBACK_INDEX_KEY, JSON.stringify(index));
  } catch {
    // Ignore quota error
  }
}

async function readIndexInternal(): Promise<WorldsIndexFile> {
  const root = await getOpfsRoot();
  if (!root) return readFallbackIndex();
  const parsed = await readJsonFile<WorldsIndexFile>(root, INDEX_FILE_NAME);
  if (parsed && Array.isArray(parsed.worlds)) {
    return parsed;
  }
  return { version: 1, activeWorldId: null, worlds: [] };
}

async function writeIndexInternal(index: WorldsIndexFile): Promise<void> {
  const root = await getOpfsRoot();
  if (!root) {
    writeFallbackIndex(index);
    return;
  }
  await writeJsonFile(root, INDEX_FILE_NAME, index);
}

async function writeWorldFilesInternal(save: FullWorldSave): Promise<void> {
  const root = await getOpfsRoot();
  if (!root) {
    try {
      localStorage.setItem(FALLBACK_WORLD_PREFIX + save.id, JSON.stringify(save));
    } catch {
      // Ignore quota error
    }
    return;
  }

  const worldsDir = await root.getDirectoryHandle(WORLDS_DIR_NAME, { create: true });
  const worldDir = await worldsDir.getDirectoryHandle(save.id, { create: true });

  const meta = {
    id: save.id,
    name: save.name,
    seed: save.seed,
    preset: save.preset,
    mode: save.mode,
    timeOfDay: save.timeOfDay,
    createdAt: save.createdAt,
    updatedAt: save.updatedAt,
  };

  await writeJsonFile(worldDir, 'meta.json', meta);
  await writeJsonFile(worldDir, 'player.json', save.player);
  await writeJsonFile(worldDir, 'edits.json', { edits: save.edits });
}

async function readWorldFilesInternal(worldId: string): Promise<FullWorldSave | null> {
  const root = await getOpfsRoot();
  if (!root) {
    try {
      const raw = localStorage.getItem(FALLBACK_WORLD_PREFIX + worldId);
      if (!raw) return null;
      return JSON.parse(raw) as FullWorldSave;
    } catch {
      return null;
    }
  }

  try {
    const worldsDir = await root.getDirectoryHandle(WORLDS_DIR_NAME, { create: false });
    const worldDir = await worldsDir.getDirectoryHandle(worldId, { create: false });

    const meta = await readJsonFile<{
      id: string;
      name: string;
      seed: number;
      preset: TerrainPreset;
      mode: GameMode;
      timeOfDay?: number;
      createdAt?: number;
      updatedAt?: number;
    }>(worldDir, 'meta.json');

    if (!meta || typeof meta.seed !== 'number') return null;

    const player = await readJsonFile<SavedPlayerState | null>(worldDir, 'player.json');
    const editsFile = await readJsonFile<{ edits?: Array<[string, number]> }>(
      worldDir,
      'edits.json',
    );

    return {
      id: meta.id || worldId,
      name: meta.name || 'Untitled World',
      seed: meta.seed,
      preset: meta.preset || 'meadows',
      mode: meta.mode || 'survival',
      timeOfDay: typeof meta.timeOfDay === 'number' ? meta.timeOfDay : 0.44,
      createdAt: meta.createdAt ?? Date.now(),
      updatedAt: meta.updatedAt ?? Date.now(),
      edits: Array.isArray(editsFile?.edits) ? editsFile.edits : [],
      player: player ?? null,
    };
  } catch {
    return null;
  }
}

async function deleteWorldFilesInternal(worldId: string): Promise<void> {
  const root = await getOpfsRoot();
  if (!root) {
    try {
      localStorage.removeItem(FALLBACK_WORLD_PREFIX + worldId);
    } catch {
      // Ignore
    }
    return;
  }

  try {
    const worldsDir = await root.getDirectoryHandle(WORLDS_DIR_NAME, { create: true });
    await worldsDir.removeEntry(worldId, { recursive: true });
  } catch {
    // Already removed or missing
  }
}

function tryReadLegacyLocalWorld(): LegacyLocalSave | null {
  try {
    const raw = localStorage.getItem(LEGACY_LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacyLocalSave;
    if (typeof parsed.seed === 'number' && Array.isArray(parsed.edits)) {
      return parsed;
    }
  } catch {
    // Ignore
  }
  return null;
}

export function createFreshWorldSave(options: {
  id?: string;
  name: string;
  seed: number;
  preset: TerrainPreset;
  mode: GameMode;
}): FullWorldSave {
  const now = Date.now();
  return {
    id: options.id ?? generateWorldId(),
    name: options.name.trim() || 'New World',
    seed: options.seed | 0,
    preset: options.preset,
    mode: options.mode,
    timeOfDay: 0.44,
    createdAt: now,
    updatedAt: now,
    edits: [],
    player: null,
  };
}

/**
 * Ensures OPFS is initialized, migrates any legacy localStorage world into OPFS,
 * or creates an initial default world if none exist. Returns the sorted world list
 * and the loaded active world.
 */
export async function bootstrapOpfsWorlds(): Promise<{
  worlds: WorldSummary[];
  activeWorld: FullWorldSave;
}> {
  return enqueueOp(async () => {
    const index = await readIndexInternal();

    if (index.worlds.length === 0) {
      const legacy = tryReadLegacyLocalWorld();
      const now = Date.now();
      let initialSave: FullWorldSave;

      if (legacy) {
        const presetNames: Record<TerrainPreset, string> = {
          meadows: 'Meadows Valley',
          alpine: 'Alpine Peaks',
          archipelago: 'Sunlit Archipelago',
          mesa: 'Mesa Canyon',
        };
        initialSave = {
          id: generateWorldId(),
          name: presetNames[legacy.preset] ?? 'Starter Valley',
          seed: legacy.seed,
          preset: legacy.preset ?? 'meadows',
          mode: legacy.mode ?? 'survival',
          timeOfDay: 0.44,
          createdAt: now,
          updatedAt: now,
          edits: legacy.edits ?? [],
          player: {
            x: 0.5,
            y: -1, // sentinel: let engine snap to spawn ground on first load
            z: 4.5,
            yaw: -0.35,
            pitch: -0.06,
            flying: false,
            health: typeof legacy.health === 'number' ? legacy.health : 20,
            hunger: typeof legacy.hunger === 'number' ? legacy.hunger : 20,
            oxygen: 10,
            exhaustion: 0,
            activeSlot: 0,
            creativeHotbar: [...DEFAULT_HOTBAR] as unknown as ItemType[],
            survivalSlots:
              Array.isArray(legacy.survivalSlots) && legacy.survivalSlots.length === 27
                ? legacy.survivalSlots
                : createStarterSurvivalInventory(),
            blocksMined: legacy.blocksMined ?? 0,
            mobsDefeated: legacy.mobsDefeated ?? 0,
            survivalSeconds: 0,
          },
        };
      } else {
        initialSave = createFreshWorldSave({
          name: 'Meadows Valley',
          seed: 42817,
          preset: 'meadows',
          mode: 'survival',
        });
      }

      await writeWorldFilesInternal(initialSave);
      const summary = summaryFromSave(initialSave);
      const nextIndex: WorldsIndexFile = {
        version: 1,
        activeWorldId: initialSave.id,
        worlds: [summary],
      };
      await writeIndexInternal(nextIndex);
      return { worlds: [summary], activeWorld: initialSave };
    }

    const sorted = [...index.worlds].sort((a, b) => b.updatedAt - a.updatedAt);
    const desiredId =
      index.activeWorldId && sorted.some((w) => w.id === index.activeWorldId)
        ? index.activeWorldId
        : sorted[0].id;

    let active = await readWorldFilesInternal(desiredId);
    if (!active) {
      // Recover gracefully from index metadata if files were missing
      const fallbackMeta = sorted.find((w) => w.id === desiredId) ?? sorted[0];
      active = createFreshWorldSave({
        id: fallbackMeta.id,
        name: fallbackMeta.name,
        seed: fallbackMeta.seed,
        preset: fallbackMeta.preset,
        mode: fallbackMeta.mode,
      });
      await writeWorldFilesInternal(active);
    }

    if (index.activeWorldId !== active.id) {
      index.activeWorldId = active.id;
      await writeIndexInternal(index);
    }

    return { worlds: sorted, activeWorld: active };
  });
}

export async function listOpfsWorlds(): Promise<{
  worlds: WorldSummary[];
  activeWorldId: string | null;
}> {
  return enqueueOp(async () => {
    const index = await readIndexInternal();
    const sorted = [...index.worlds].sort((a, b) => b.updatedAt - a.updatedAt);
    return { worlds: sorted, activeWorldId: index.activeWorldId };
  });
}

export async function loadOpfsWorld(worldId: string): Promise<FullWorldSave | null> {
  return enqueueOp(async () => {
    const save = await readWorldFilesInternal(worldId);
    if (save) {
      const index = await readIndexInternal();
      if (index.activeWorldId !== worldId) {
        index.activeWorldId = worldId;
        await writeIndexInternal(index);
      }
    }
    return save;
  });
}

export async function saveOpfsWorld(
  save: FullWorldSave,
): Promise<{ summary: WorldSummary; worlds: WorldSummary[] }> {
  return enqueueOp(async () => {
    const stamped: FullWorldSave = {
      ...save,
      updatedAt: Date.now(),
    };
    await writeWorldFilesInternal(stamped);

    const summary = summaryFromSave(stamped);
    const index = await readIndexInternal();
    const existingIdx = index.worlds.findIndex((w) => w.id === stamped.id);
    if (existingIdx >= 0) {
      index.worlds[existingIdx] = summary;
    } else {
      index.worlds.push(summary);
    }
    index.activeWorldId = stamped.id;
    await writeIndexInternal(index);

    const sorted = [...index.worlds].sort((a, b) => b.updatedAt - a.updatedAt);
    return { summary, worlds: sorted };
  });
}

export async function createOpfsWorld(options: {
  name: string;
  seed: number;
  preset: TerrainPreset;
  mode: GameMode;
}): Promise<{ save: FullWorldSave; worlds: WorldSummary[] }> {
  return enqueueOp(async () => {
    const save = createFreshWorldSave(options);
    await writeWorldFilesInternal(save);

    const summary = summaryFromSave(save);
    const index = await readIndexInternal();
    index.worlds.push(summary);
    index.activeWorldId = save.id;
    await writeIndexInternal(index);

    const sorted = [...index.worlds].sort((a, b) => b.updatedAt - a.updatedAt);
    return { save, worlds: sorted };
  });
}

export async function renameOpfsWorld(
  worldId: string,
  newName: string,
): Promise<WorldSummary[]> {
  return enqueueOp(async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      const index = await readIndexInternal();
      return [...index.worlds].sort((a, b) => b.updatedAt - a.updatedAt);
    }

    const existing = await readWorldFilesInternal(worldId);
    const now = Date.now();
    if (existing) {
      existing.name = trimmed;
      existing.updatedAt = now;
      await writeWorldFilesInternal(existing);
    }

    const index = await readIndexInternal();
    const entry = index.worlds.find((w) => w.id === worldId);
    if (entry) {
      entry.name = trimmed;
      entry.updatedAt = now;
      await writeIndexInternal(index);
    }

    return [...index.worlds].sort((a, b) => b.updatedAt - a.updatedAt);
  });
}

export async function duplicateOpfsWorld(
  worldId: string,
): Promise<{ save: FullWorldSave; worlds: WorldSummary[] } | null> {
  return enqueueOp(async () => {
    const source = await readWorldFilesInternal(worldId);
    if (!source) return null;

    const now = Date.now();
    const copy: FullWorldSave = {
      ...source,
      id: generateWorldId(),
      name: `${source.name} Copy`,
      createdAt: now,
      updatedAt: now,
      edits: source.edits.map(([k, v]) => [k, v]),
      player: source.player
        ? {
            ...source.player,
            creativeHotbar: [...source.player.creativeHotbar],
            survivalSlots: source.player.survivalSlots.map((s) => (s ? { ...s } : null)),
            furnaces: source.player.furnaces
              ? Object.fromEntries(
                  Object.entries(source.player.furnaces).map(([k, f]) => [
                    k,
                    {
                      ...f,
                      input: f.input ? { ...f.input } : null,
                      fuel: f.fuel ? { ...f.fuel } : null,
                      output: f.output ? { ...f.output } : null,
                    },
                  ]),
                )
              : undefined,
          }
        : null,
    };

    await writeWorldFilesInternal(copy);
    const summary = summaryFromSave(copy);
    const index = await readIndexInternal();
    index.worlds.push(summary);
    await writeIndexInternal(index);

    const sorted = [...index.worlds].sort((a, b) => b.updatedAt - a.updatedAt);
    return { save: copy, worlds: sorted };
  });
}

export async function deleteOpfsWorld(worldId: string): Promise<{
  worlds: WorldSummary[];
  nextActiveWorld: FullWorldSave;
}> {
  return enqueueOp(async () => {
    await deleteWorldFilesInternal(worldId);

    const index = await readIndexInternal();
    index.worlds = index.worlds.filter((w) => w.id !== worldId);

    if (index.worlds.length === 0) {
      const fresh = createFreshWorldSave({
        name: 'Meadows Valley',
        seed: Math.floor(10000 + Math.random() * 89999),
        preset: 'meadows',
        mode: 'survival',
      });
      await writeWorldFilesInternal(fresh);
      const summary = summaryFromSave(fresh);
      index.worlds = [summary];
      index.activeWorldId = fresh.id;
      await writeIndexInternal(index);
      return { worlds: [summary], nextActiveWorld: fresh };
    }

    const sorted = [...index.worlds].sort((a, b) => b.updatedAt - a.updatedAt);
    const nextId =
      index.activeWorldId &&
      index.activeWorldId !== worldId &&
      sorted.some((w) => w.id === index.activeWorldId)
        ? index.activeWorldId
        : sorted[0].id;

    index.activeWorldId = nextId;
    await writeIndexInternal(index);

    let loaded = await readWorldFilesInternal(nextId);
    if (!loaded) {
      const meta = sorted.find((w) => w.id === nextId) ?? sorted[0];
      loaded = createFreshWorldSave({
        id: meta.id,
        name: meta.name,
        seed: meta.seed,
        preset: meta.preset,
        mode: meta.mode,
      });
      await writeWorldFilesInternal(loaded);
    }

    return { worlds: sorted, nextActiveWorld: loaded };
  });
}

// --- Main Menu 6-Face Panorama Persistence (OPFS with localStorage fallback) ---

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function saveOpfsPanorama(faceBlobs: Blob[]): Promise<boolean> {
  if (faceBlobs.length !== PANORAMA_FACE_KEYS.length) return false;
  return enqueueOp(async () => {
    const root = await getOpfsRoot();
    if (!root) {
      try {
        const dataUrls = await Promise.all(faceBlobs.map((b) => blobToDataUrl(b)));
        localStorage.setItem(FALLBACK_PANORAMA_KEY, JSON.stringify(dataUrls));
        return true;
      } catch {
        return false;
      }
    }

    try {
      const panoDir = await root.getDirectoryHandle(PANORAMA_DIR_NAME, { create: true });
      for (let i = 0; i < PANORAMA_FACE_KEYS.length; i++) {
        const handle = await panoDir.getFileHandle(`panorama_${PANORAMA_FACE_KEYS[i]}.png`, {
          create: true,
        });
        const writable = await handle.createWritable();
        await writable.write(faceBlobs[i]);
        await writable.close();
      }
      return true;
    } catch {
      return false;
    }
  });
}

export async function loadOpfsPanorama(): Promise<string[] | null> {
  return enqueueOp(async () => {
    const root = await getOpfsRoot();
    if (!root) {
      try {
        const raw = localStorage.getItem(FALLBACK_PANORAMA_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (
          Array.isArray(parsed) &&
          parsed.length === PANORAMA_FACE_KEYS.length &&
          parsed.every((u) => typeof u === 'string' && u.length > 0)
        ) {
          return parsed;
        }
        return null;
      } catch {
        return null;
      }
    }

    try {
      const panoDir = await root.getDirectoryHandle(PANORAMA_DIR_NAME, { create: false });
      const urls: string[] = [];
      for (let i = 0; i < PANORAMA_FACE_KEYS.length; i++) {
        const handle = await panoDir.getFileHandle(`panorama_${PANORAMA_FACE_KEYS[i]}.png`);
        const file = await handle.getFile();
        if (file.size <= 0) {
          urls.forEach((u) => URL.revokeObjectURL(u));
          return null;
        }
        urls.push(URL.createObjectURL(file));
      }
      return urls;
    } catch {
      return null;
    }
  });
}

export async function deleteOpfsPanorama(): Promise<void> {
  return enqueueOp(async () => {
    const root = await getOpfsRoot();
    if (!root) {
      try {
        localStorage.removeItem(FALLBACK_PANORAMA_KEY);
      } catch {
        // Ignore
      }
      return;
    }

    try {
      const panoDir = await root.getDirectoryHandle(PANORAMA_DIR_NAME, { create: false });
      for (const face of PANORAMA_FACE_KEYS) {
        try {
          await panoDir.removeEntry(`panorama_${face}.png`);
        } catch {
          // Ignore missing face
        }
      }
    } catch {
      // Ignore if directory does not exist
    }
  });
}

