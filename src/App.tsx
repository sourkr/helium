import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import {
  DeathModal,
  FurnaceModal,
  InventoryModal,
  PauseModal,
  SettingsModal,
} from './components/Modals';
import { TitleOverlay } from './components/TitleOverlay';
import { WorldManagerModal } from './components/WorldManagerModal';
import { getDirtTextureUrl } from './game/assetPack';
import { DEFAULT_HOTBAR, TerrainPreset, TimePreset } from './game/blocks';
import { EngineSettings, GamePhase, HudSnapshot, VoxelEngine } from './game/engine';
import {
  bootstrapOpfsWorlds,
  createOpfsWorld,
  deleteOpfsWorld,
  duplicateOpfsWorld,
  loadOpfsWorld,
  renameOpfsWorld,
  WorldSummary,
} from './game/opfsStorage';
import {
  createEmptyFurnaceData,
  createStarterSurvivalInventory,
  FurnaceData,
  GameMode,
  InventorySlot,
  ItemType,
} from './game/survival';

const INITIAL_HUD: HudSnapshot = {
  mode: 'survival',
  fps: 60,
  x: 0,
  y: 16,
  z: 4,
  biome: 'Sunlit Meadow',
  flying: false,
  underwater: false,
  pointerLocked: false,
  targetedBlock: null,
  editCount: 0,
  timeOfDay: 0.44,
  crosshairPulse: 0,
  health: 20,
  maxHealth: 20,
  hunger: 20,
  maxHunger: 20,
  oxygen: 10,
  maxOxygen: 10,
  miningProgress: 0,
  damageFlash: 0,
  toastText: null,
  blocksMined: 0,
  mobsDefeated: 0,
  survivalSeconds: 0,
};

const SETTINGS_STORAGE_KEY = 'voxelvale_settings_v1';

const DEFAULT_SETTINGS: EngineSettings = {
  fov: 72,
  mouseSensitivity: 1.0,
  renderDistance: 4,
  muted: false,
  showFps: true,
  playerShadow: true,
  entityShadows: true,
};

function loadSavedSettings(): EngineSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<EngineSettings>;
    return {
      fov: typeof parsed.fov === 'number' ? Math.max(60, Math.min(100, parsed.fov)) : DEFAULT_SETTINGS.fov,
      mouseSensitivity:
        typeof parsed.mouseSensitivity === 'number'
          ? Math.max(0.4, Math.min(2.2, parsed.mouseSensitivity))
          : DEFAULT_SETTINGS.mouseSensitivity,
      renderDistance:
        typeof parsed.renderDistance === 'number'
          ? Math.max(3, Math.min(5, Math.round(parsed.renderDistance)))
          : DEFAULT_SETTINGS.renderDistance,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_SETTINGS.muted,
      showFps: typeof parsed.showFps === 'boolean' ? parsed.showFps : DEFAULT_SETTINGS.showFps,
      playerShadow:
        typeof parsed.playerShadow === 'boolean'
          ? parsed.playerShadow
          : DEFAULT_SETTINGS.playerShadow,
      entityShadows:
        typeof parsed.entityShadows === 'boolean'
          ? parsed.entityShadows
          : DEFAULT_SETTINGS.entityShadows,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface ActiveWorldInfo {
  id: string;
  name: string;
  seed: number;
  preset: TerrainPreset;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<VoxelEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [mode, setMode] = useState<GameMode>('survival');
  const [creativeHotbar, setCreativeHotbar] = useState<ItemType[]>(
    () => [...DEFAULT_HOTBAR] as unknown as ItemType[],
  );
  const [survivalSlots, setSurvivalSlots] = useState<Array<InventorySlot | null>>(() =>
    createStarterSurvivalInventory(),
  );
  const [craftingGrid, setCraftingGrid] = useState<Array<InventorySlot | null>>(() =>
    new Array(9).fill(null),
  );
  const [activeFurnace, setActiveFurnace] = useState<FurnaceData | null>(null);
  const [activeSlot, setActiveSlot] = useState(0);
  const [itemIcons, setItemIcons] = useState<Record<number, string>>({});
  const [settings, setSettings] = useState<EngineSettings>(() => loadSavedSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [worldInfo, setWorldInfo] = useState<ActiveWorldInfo>({
    id: '',
    name: 'Meadows Valley',
    seed: 42817,
    preset: 'meadows',
  });
  const [worldModalView, setWorldModalView] = useState<'list' | 'create' | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [hasPanorama, setHasPanorama] = useState(false);
  const [dirtTextureUrl] = useState<string | null>(() => getDirtTextureUrl());

  // Mount isolated WebGL viewport once; bootstrap OPFS worlds right after mount
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;
    let cancelled = false;

    const engine = new VoxelEngine(container, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onInventoryChange: (nextMode, nextCreative, nextSurvival, nextGrid, nextSlot) => {
        setMode(nextMode);
        setCreativeHotbar(nextCreative);
        setSurvivalSlots(nextSurvival);
        setCraftingGrid(nextGrid);
        setActiveSlot(nextSlot);
      },
      onFurnaceChange: (furnace) => setActiveFurnace(furnace),
      onPhaseChange: (nextPhase) => {
        setPhase(nextPhase);
        if (nextPhase === 'playing') {
          setWorldModalView(null);
          setSettingsOpen(false);
        }
      },
      onAssetsReady: (icons) => setItemIcons(icons),
      onContextLost: (lost) => setContextLost(lost),
      onWorldsUpdated: (nextWorlds) => setWorlds(nextWorlds),
      onPanoramaChange: (has) => setHasPanorama(has),
    });

    engineRef.current = engine;
    engine.applySettings(loadSavedSettings());

    void bootstrapOpfsWorlds().then(({ worlds: initialWorlds, activeWorld }) => {
      if (cancelled) return;
      engine.loadWorldState(activeWorld);
      setWorlds(initialWorlds);
      setWorldInfo({
        id: activeWorld.id,
        name: activeWorld.name,
        seed: activeWorld.seed,
        preset: activeWorld.preset,
      });
      setMode(activeWorld.mode);
    });

    return () => {
      cancelled = true;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleUpdateSettings = useCallback((patch: Partial<EngineSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      engineRef.current?.applySettings(next);
      try {
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }, []);

  const handleResetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    engineRef.current?.applySettings(DEFAULT_SETTINGS);
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  // Global Mute shortcut ('M')
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'KeyM') {
        setSettings((prev) => {
          const next = { ...prev, muted: !prev.muted };
          engineRef.current?.applySettings(next);
          try {
            window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
          } catch {
            // Ignore storage quota errors
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleSelectMode = useCallback((nextMode: GameMode) => {
    engineRef.current?.setGameMode(nextMode);
    setMode(nextMode);
  }, []);

  const handleOpenWorlds = useCallback(async () => {
    await engineRef.current?.saveNow();
    setWorldModalView('list');
  }, []);

  const handleOpenNewWorld = useCallback(async () => {
    await engineRef.current?.saveNow();
    setWorldModalView('create');
  }, []);

  const handleSelectWorld = useCallback(
    async (worldId: string) => {
      const engine = engineRef.current;
      if (!engine || worldId === worldInfo.id) return;
      await engine.saveNow();
      const loaded = await loadOpfsWorld(worldId);
      if (!loaded) return;
      engine.loadWorldState(loaded);
      setWorldInfo({
        id: loaded.id,
        name: loaded.name,
        seed: loaded.seed,
        preset: loaded.preset,
      });
      setMode(loaded.mode);
    },
    [worldInfo.id],
  );

  const handlePlayWorld = useCallback(
    async (worldId: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (worldId !== worldInfo.id) {
        await engine.saveNow();
        const loaded = await loadOpfsWorld(worldId);
        if (!loaded) return;
        engine.loadWorldState(loaded);
        setWorldInfo({
          id: loaded.id,
          name: loaded.name,
          seed: loaded.seed,
          preset: loaded.preset,
        });
        setMode(loaded.mode);
      }
      setWorldModalView(null);
      engine.setPhase('playing');
    },
    [worldInfo.id],
  );

  const handleCreateWorld = useCallback(
    async (options: {
      name: string;
      seed: number;
      preset: TerrainPreset;
      mode: GameMode;
      enterImmediately: boolean;
    }) => {
      const engine = engineRef.current;
      if (!engine) return;
      await engine.saveNow();
      const { save, worlds: nextWorlds } = await createOpfsWorld({
        name: options.name,
        seed: options.seed,
        preset: options.preset,
        mode: options.mode,
      });
      engine.loadWorldState(save);
      setWorlds(nextWorlds);
      setWorldInfo({
        id: save.id,
        name: save.name,
        seed: save.seed,
        preset: save.preset,
      });
      setMode(save.mode);
      setWorldModalView(null);
      if (options.enterImmediately) {
        engine.setPhase('playing');
      }
    },
    [],
  );

  const handleRenameWorld = useCallback(
    async (worldId: string, nextName: string) => {
      const nextWorlds = await renameOpfsWorld(worldId, nextName);
      setWorlds(nextWorlds);
      if (worldId === worldInfo.id) {
        engineRef.current?.setWorldName(nextName);
        setWorldInfo((prev) => ({ ...prev, name: nextName.trim() || prev.name }));
      }
    },
    [worldInfo.id],
  );

  const handleDuplicateWorld = useCallback(
    async (worldId: string) => {
      if (worldId === worldInfo.id) {
        await engineRef.current?.saveNow();
      }
      const res = await duplicateOpfsWorld(worldId);
      if (res) {
        setWorlds(res.worlds);
      }
    },
    [worldInfo.id],
  );

  const handleDeleteWorld = useCallback(
    async (worldId: string) => {
      const engine = engineRef.current;
      const { worlds: nextWorlds, nextActiveWorld } = await deleteOpfsWorld(worldId);
      setWorlds(nextWorlds);
      if (worldId === worldInfo.id && engine) {
        engine.loadWorldState(nextActiveWorld);
        setWorldInfo({
          id: nextActiveWorld.id,
          name: nextActiveWorld.name,
          seed: nextActiveWorld.seed,
          preset: nextActiveWorld.preset,
        });
        setMode(nextActiveWorld.mode);
      }
    },
    [worldInfo.id],
  );

  const handleSaveNow = useCallback(async () => {
    await engineRef.current?.saveNow();
  }, []);

  const handleResetEdits = useCallback(() => {
    engineRef.current?.resetWorldEdits();
  }, []);

  const handleReturnTitle = useCallback(async () => {
    await engineRef.current?.saveNow();
    setWorldModalView(null);
    setSettingsOpen(false);
    engineRef.current?.setPhase('title');
  }, []);

  const handleSelectSlot = useCallback((slot: number) => {
    engineRef.current?.setActiveSlot(slot);
  }, []);

  const handleSelectCreativeItem = useCallback((item: ItemType) => {
    engineRef.current?.assignBlockToActiveSlot(item);
  }, []);

  const handleSwapSurvivalSlots = useCallback((fromIdx: number, toIdx: number) => {
    engineRef.current?.swapSurvivalSlots(fromIdx, toIdx);
  }, []);

  const handlePlaceIntoGrid = useCallback((invIdx: number, gridIdx: number, count = 1) => {
    engineRef.current?.placeInventoryItemIntoGrid(invIdx, gridIdx, count);
  }, []);

  const handleReturnGridCell = useCallback((gridIdx: number) => {
    engineRef.current?.returnGridCellToInventory(gridIdx);
  }, []);

  const handleClearGrid = useCallback(() => {
    engineRef.current?.clearCraftingGrid();
  }, []);

  const handleFillGridFromRecipe = useCallback((recipeId: string) => {
    engineRef.current?.fillCraftingGridFromRecipe(recipeId);
  }, []);

  const handleCraftFromGrid = useCallback((craftAll: boolean) => {
    engineRef.current?.craftFromGrid(craftAll);
  }, []);

  const handleCraftRecipe = useCallback((recipeId: string, craftAll: boolean) => {
    engineRef.current?.craftRecipeById(recipeId, craftAll);
  }, []);

  const handleEatSlot = useCallback((slotIdx: number) => {
    engineRef.current?.eatFromSlot(slotIdx);
  }, []);

  const handlePlaceIntoFurnace = useCallback(
    (invIdx: number, slot: 'input' | 'fuel', count = 1) => {
      engineRef.current?.placeInventoryItemIntoFurnace(invIdx, slot, count);
    },
    [],
  );

  const handleTakeFurnaceSlot = useCallback((slot: 'input' | 'fuel' | 'output') => {
    engineRef.current?.takeFromFurnaceSlot(slot);
  }, []);

  const handleQuickLoadFurnaceSlot = useCallback((invIdx: number, fullStack: boolean) => {
    engineRef.current?.quickLoadFurnaceSlot(invIdx, fullStack);
  }, []);

  const handleQuickLoadFurnaceRecipe = useCallback((inputItem: ItemType) => {
    engineRef.current?.quickLoadFurnaceRecipe(inputItem);
  }, []);

  const handleRespawn = useCallback(() => {
    engineRef.current?.respawnPlayer();
  }, []);

  const handleSetTime = useCallback((preset: TimePreset) => {
    engineRef.current?.setTimePreset(preset);
  }, []);

  const handleToggleMute = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, muted: !prev.muted };
      engineRef.current?.applySettings(next);
      try {
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }, []);

  const handleToggleFly = useCallback(() => {
    engineRef.current?.toggleFlyMode();
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#111820]">
      {/* Isolated WebGL Canvas Container */}
      <div
        ref={canvasMountRef}
        className="w-full h-full"
        aria-label="Voxelvale 3D Voxel World"
      />

      {/* WebGL Context Lost Fallback */}
      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111820] text-stone-100 p-6">
          <div className="max-w-sm text-center space-y-3">
            <h2 className="font-display text-xl font-bold">Graphics Context Paused</h2>
            <p className="text-sm text-stone-400">
              WebGL rendering was interrupted. Reload the view to restore your world.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-[#5CA03A] text-[#0E160D] text-sm font-bold cursor-pointer"
            >
              Reload World
            </button>
          </div>
        </div>
      )}

      {/* Title Screen Shell (3-Button Main Menu) */}
      {phase === 'title' && (
        <TitleOverlay
          fps={hud.fps}
          showFps={settings.showFps}
          hasPanorama={hasPanorama}
          dirtTextureUrl={dirtTextureUrl}
          onOpenSingleplayer={handleOpenWorlds}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {/* Active Gameplay HUD */}
      {phase === 'playing' && (
        <GameHud
          hud={hud}
          mode={mode}
          creativeHotbar={creativeHotbar}
          survivalSlots={survivalSlots}
          activeSlot={activeSlot}
          itemIcons={itemIcons}
          muted={settings.muted}
          showFps={settings.showFps}
          onSelectSlot={handleSelectSlot}
          onOpenInventory={() => engineRef.current?.setPhase('inventory')}
          onOpenPause={() => engineRef.current?.setPhase('paused')}
          onToggleMute={handleToggleMute}
          onToggleFly={handleToggleFly}
        />
      )}

      {/* Survival Pocket Crafting (2x2) / Crafting Table (3x3) / Creative Palette Modal */}
      {(phase === 'inventory' || phase === 'crafting') && (
        <InventoryModal
          mode={mode}
          gridSize={phase === 'crafting' ? 3 : 2}
          activeItem={creativeHotbar[activeSlot] ?? ItemType.Grass}
          survivalSlots={survivalSlots}
          craftingGrid={craftingGrid}
          itemIcons={itemIcons}
          onSelectCreativeItem={handleSelectCreativeItem}
          onSwapSurvivalSlots={handleSwapSurvivalSlots}
          onPlaceIntoGrid={handlePlaceIntoGrid}
          onReturnGridCell={handleReturnGridCell}
          onClearGrid={handleClearGrid}
          onFillGridFromRecipe={handleFillGridFromRecipe}
          onCraftFromGrid={handleCraftFromGrid}
          onCraftRecipe={handleCraftRecipe}
          onEatSlot={handleEatSlot}
          onClose={() => engineRef.current?.setPhase('playing')}
        />
      )}

      {/* Furnace Smelting Modal */}
      {phase === 'furnace' && (
        <FurnaceModal
          furnace={activeFurnace ?? createEmptyFurnaceData()}
          survivalSlots={survivalSlots}
          itemIcons={itemIcons}
          onSwapSurvivalSlots={handleSwapSurvivalSlots}
          onPlaceIntoFurnace={handlePlaceIntoFurnace}
          onTakeFurnaceSlot={handleTakeFurnaceSlot}
          onQuickLoadSlot={handleQuickLoadFurnaceSlot}
          onQuickLoadRecipe={handleQuickLoadFurnaceRecipe}
          onClose={() => engineRef.current?.setPhase('playing')}
        />
      )}

      {/* Pause & World Settings Modal */}
      {phase === 'paused' && worldModalView === null && !settingsOpen && (
        <PauseModal
          worldName={worldInfo.name}
          worldCount={Math.max(1, worlds.length)}
          currentMode={mode}
          currentSeed={worldInfo.seed}
          currentPreset={worldInfo.preset}
          editCount={hud.editCount}
          onSelectMode={handleSelectMode}
          onResume={() => engineRef.current?.setPhase('playing')}
          onSetTime={handleSetTime}
          onSaveNow={handleSaveNow}
          onOpenWorlds={handleOpenWorlds}
          onOpenNewWorld={handleOpenNewWorld}
          onOpenSettings={() => setSettingsOpen(true)}
          onResetEdits={handleResetEdits}
          onReturnTitle={handleReturnTitle}
        />
      )}

      {/* Multi-World Manager & New World Creator Modal (OPFS) */}
      {worldModalView !== null && (
        <WorldManagerModal
          worlds={worlds}
          activeWorldId={worldInfo.id}
          initialView={worldModalView}
          dirtTextureUrl={dirtTextureUrl}
          onSelectWorld={handleSelectWorld}
          onPlayWorld={handlePlayWorld}
          onCreateWorld={handleCreateWorld}
          onRenameWorld={handleRenameWorld}
          onDuplicateWorld={handleDuplicateWorld}
          onDeleteWorld={handleDeleteWorld}
          onClose={() => setWorldModalView(null)}
        />
      )}

      {/* Game Settings Modal */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          hasPanorama={hasPanorama}
          onClearPanorama={() => void engineRef.current?.clearPanorama()}
          onChange={handleUpdateSettings}
          onResetDefaults={handleResetSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Survival Death & Respawn Modal */}
      {phase === 'dead' && (
        <DeathModal
          blocksMined={hud.blocksMined}
          mobsDefeated={hud.mobsDefeated}
          survivalSeconds={hud.survivalSeconds}
          onRespawn={handleRespawn}
          onReturnTitle={handleReturnTitle}
        />
      )}
    </main>
  );
}

