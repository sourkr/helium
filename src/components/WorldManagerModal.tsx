import React, { useEffect, useMemo, useState } from 'react';
import { Dices, Play } from 'lucide-react';
import { TerrainPreset } from '../game/blocks';
import { GUI_SEPARATORS } from '../game/guiAssets';
import { WorldSummary } from '../game/opfsStorage';
import { GameMode } from '../game/survival';

interface WorldManagerModalProps {
  worlds: WorldSummary[];
  activeWorldId: string;
  initialView?: 'list' | 'create';
  dirtTextureUrl?: string | null;
  onSelectWorld: (worldId: string) => void;
  onPlayWorld: (worldId: string) => void;
  onCreateWorld: (options: {
    name: string;
    seed: number;
    preset: TerrainPreset;
    mode: GameMode;
    enterImmediately: boolean;
  }) => void;
  onRenameWorld: (worldId: string, nextName: string) => void;
  onDuplicateWorld: (worldId: string) => void;
  onDeleteWorld: (worldId: string) => void;
  onClose: () => void;
}

const PRESET_OPTIONS: Array<{ id: TerrainPreset; label: string; description: string }> = [
  { id: 'meadows', label: 'Meadows', description: 'Rolling hills, oak forests, sunlit valleys' },
  { id: 'alpine', label: 'Alpine Peaks', description: 'Steep snow-capped ridges & glacial tarns' },
  { id: 'archipelago', label: 'Archipelago', description: 'Oceanic islands, beaches & coastal groves' },
  { id: 'mesa', label: 'Mesa Canyon', description: 'Terraced redrock plateaus & canyon oases' },
];

const PRESET_LABELS: Record<TerrainPreset, string> = {
  meadows: 'Meadows',
  alpine: 'Alpine Peaks',
  archipelago: 'Archipelago',
  mesa: 'Mesa Canyon',
};

const PRESET_ACCENT: Record<TerrainPreset, { sky: string; ground: string; top: string }> = {
  meadows: { sky: '#7ec0ee', ground: '#6e4c32', top: '#63a642' },
  alpine: { sky: '#9ec4e8', ground: '#6d737a', top: '#e9f0f5' },
  archipelago: { sky: '#65b5eb', ground: '#d5c188', top: '#3c77de' },
  mesa: { sky: '#e0a978', ground: '#9c4e31', top: '#c46c43' },
};

function formatPlayedDate(timestamp: number): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Recently';
  }
}

function suggestWorldName(preset: TerrainPreset, existingCount: number): string {
  const bases: Record<TerrainPreset, string> = {
    meadows: 'New World',
    alpine: 'Alpine Peaks',
    archipelago: 'Coral Isles',
    mesa: 'Redrock Mesa',
  };
  return existingCount === 0 && preset === 'meadows'
    ? 'New World'
    : `${bases[preset]} ${existingCount + 1}`;
}

export const WorldManagerModal: React.FC<WorldManagerModalProps> = ({
  worlds,
  activeWorldId,
  initialView = 'list',
  dirtTextureUrl = null,
  onSelectWorld,
  onPlayWorld,
  onCreateWorld,
  onRenameWorld,
  onDuplicateWorld,
  onDeleteWorld,
  onClose,
}) => {
  const [view, setView] = useState<'list' | 'create'>(initialView);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(
    () => activeWorldId || worlds[0]?.id || '',
  );

  // Create form state
  const [newPreset, setNewPreset] = useState<TerrainPreset>('meadows');
  const [newMode, setNewMode] = useState<GameMode>('survival');
  const [newName, setNewName] = useState(() => suggestWorldName('meadows', worlds.length));
  const [nameTouched, setNameTouched] = useState(false);
  const [newSeedText, setNewSeedText] = useState(() =>
    String(Math.floor(10000 + Math.random() * 89999)),
  );

  // Inline rename & delete confirm state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Sync selection when worlds list changes
  useEffect(() => {
    if (worlds.length === 0) {
      setSelectedId('');
      return;
    }
    if (!worlds.some((w) => w.id === selectedId)) {
      const next = worlds.find((w) => w.id === activeWorldId)?.id ?? worlds[0].id;
      setSelectedId(next);
    }
  }, [worlds, activeWorldId, selectedId]);

  const filteredWorlds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return worlds;
    return worlds.filter((w) => {
      const presetLabel = (PRESET_LABELS[w.preset] ?? w.preset).toLowerCase();
      return (
        w.name.toLowerCase().includes(q) ||
        presetLabel.includes(q) ||
        w.mode.toLowerCase().includes(q) ||
        String(w.seed).includes(q)
      );
    });
  }, [worlds, searchQuery]);

  const selectedWorld = useMemo(
    () => filteredWorlds.find((w) => w.id === selectedId) ?? null,
    [filteredWorlds, selectedId],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (renamingId) {
          e.preventDefault();
          e.stopPropagation();
          setRenamingId(null);
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (confirmDeleteId) {
        setConfirmDeleteId(null);
      } else if (view === 'create') {
        setView('list');
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, view, confirmDeleteId, renamingId]);

  const handleOpenCreate = () => {
    setNewPreset('meadows');
    setNewMode('survival');
    setNewName(suggestWorldName('meadows', worlds.length));
    setNameTouched(false);
    setNewSeedText(String(Math.floor(10000 + Math.random() * 89999)));
    setConfirmDeleteId(null);
    setRenamingId(null);
    setView('create');
  };

  const handlePresetChange = (preset: TerrainPreset) => {
    setNewPreset(preset);
    if (!nameTouched) {
      setNewName(suggestWorldName(preset, worlds.length));
    }
  };

  const handleCreateSubmit = (enterImmediately: boolean) => {
    const parsedSeed = parseInt(newSeedText, 10);
    const seed = Number.isFinite(parsedSeed)
      ? parsedSeed
      : Math.floor(10000 + Math.random() * 89999);
    const finalName = newName.trim() || suggestWorldName(newPreset, worlds.length);

    onCreateWorld({
      name: finalName,
      seed,
      preset: newPreset,
      mode: newMode,
      enterImmediately,
    });
  };

  const commitRename = (worldId: string) => {
    const trimmed = renameText.trim();
    if (trimmed) {
      onRenameWorld(worldId, trimmed);
    }
    setRenamingId(null);
  };

  const handleSelectRow = (worldId: string) => {
    setSelectedId(worldId);
    setConfirmDeleteId(null);
    if (worldId !== activeWorldId) {
      onSelectWorld(worldId);
    }
  };

  const headerSepStyle: React.CSSProperties = GUI_SEPARATORS.headerUrl
    ? {
        backgroundImage: `url("${GUI_SEPARATORS.headerUrl}")`,
        backgroundRepeat: 'repeat-x',
        backgroundSize: 'auto 100%',
        imageRendering: 'pixelated',
      }
    : {
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0))',
      };

  const footerSepStyle: React.CSSProperties = GUI_SEPARATORS.footerUrl
    ? {
        backgroundImage: `url("${GUI_SEPARATORS.footerUrl}")`,
        backgroundRepeat: 'repeat-x',
        backgroundSize: 'auto 100%',
        imageRendering: 'pixelated',
      }
    : {
        background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
      };

  const worldPendingDelete = confirmDeleteId
    ? worlds.find((w) => w.id === confirmDeleteId) ?? null
    : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col">
      {/* Repeated Pixelated Dirt Texture Background */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 pointer-events-none bg-[#3B2A1E]"
        style={{
          backgroundImage: dirtTextureUrl ? `url("${dirtTextureUrl}")` : undefined,
          backgroundRepeat: 'repeat',
          backgroundSize: '64px 64px',
          imageRendering: 'pixelated',
        }}
      >
        <div className="absolute inset-0 bg-[#140D08]/62" />
      </div>

      {view === 'list' ? (
        <>
          {/* Top Header: "Select World" + Minecraft Search Text Field */}
          <header className="shrink-0 w-full flex flex-col items-center justify-center pt-5 pb-3.5 px-4 gap-3">
            <h1 className="text-center text-[20px] sm:text-[22px] font-normal tracking-wide text-white mc-shadow-text">
              Select World
            </h1>

            <div className="w-full max-w-[400px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search worlds..."
                aria-label="Search worlds"
                className="mc-text-field w-full h-[38px] px-3 text-[14px]"
              />
            </div>
          </header>

          {/* Middle Section: Darkened Translucent Rectangle with Header & Footer Separator Textures */}
          <main className="relative flex-1 min-h-0 w-full flex flex-col">
            {/* Top Separator Texture */}
            <div
              aria-hidden="true"
              className="w-full h-[4px] shrink-0 pointer-events-none relative z-10"
              style={headerSepStyle}
            />

            {/* Darkened Translucent World List Container */}
            <div className="flex-1 min-h-0 w-full bg-black/52 overflow-y-auto px-4 py-3">
              <div className="w-full max-w-[560px] mx-auto space-y-1.5">
                {filteredWorlds.length === 0 ? (
                  <div className="py-12 text-center text-[#A0A0A0] text-[14px] mc-shadow-text">
                    {worlds.length === 0
                      ? 'No saved worlds yet. Click "Create New World" below.'
                      : `No worlds match "${searchQuery.trim()}".`}
                  </div>
                ) : (
                  filteredWorlds.map((world) => {
                    const isSelected = world.id === selectedId;
                    const isRenaming = renamingId === world.id;
                    const accent = PRESET_ACCENT[world.preset] ?? PRESET_ACCENT.meadows;

                    return (
                      <div
                        key={world.id}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          if (!isRenaming) handleSelectRow(world.id);
                        }}
                        onDoubleClick={() => {
                          if (!isRenaming) onPlayWorld(world.id);
                        }}
                        className={`group flex items-center gap-3.5 px-2.5 py-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-black/75 border-2 border-[#DCDCDC]'
                            : 'bg-transparent border-2 border-transparent hover:bg-black/35'
                        }`}
                      >
                        {/* World Preview Icon Tile (Click to Play directly like Minecraft) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlayWorld(world.id);
                          }}
                          title={`Play ${world.name}`}
                          className="relative w-14 h-14 shrink-0 border-2 border-black/80 overflow-hidden cursor-pointer"
                          style={{
                            background: `linear-gradient(to bottom, ${accent.sky} 0%, ${accent.sky} 52%, ${accent.top} 52%, ${accent.top} 66%, ${accent.ground} 66%, ${accent.ground} 100%)`,
                          }}
                        >
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors flex items-center justify-center">
                            <Play className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 fill-white drop-shadow-[0_2px_0_rgba(0,0,0,0.8)] transition-opacity" />
                          </div>
                        </button>

                        {/* World Text Info */}
                        <div className="min-w-0 flex-1 leading-snug">
                          {isRenaming ? (
                            <div
                              className="flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                value={renameText}
                                maxLength={36}
                                autoFocus
                                onChange={(e) => setRenameText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.stopPropagation();
                                    commitRename(world.id);
                                  } else if (e.key === 'Escape') {
                                    e.stopPropagation();
                                    setRenamingId(null);
                                  }
                                }}
                                className="mc-text-field w-full max-w-[260px] h-[32px] px-2.5 text-[14px]"
                              />
                              <button
                                type="button"
                                onClick={() => commitRename(world.id)}
                                className="mc-btn-sm px-2.5 py-1 text-[12px] cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setRenamingId(null)}
                                className="mc-btn-sm px-2.5 py-1 text-[12px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="text-[16px] text-white truncate mc-shadow-text">
                              {world.name}
                            </div>
                          )}

                          <div className="text-[12px] text-[#9A9A9A] truncate mt-0.5">
                            Seed {world.seed} ({formatPlayedDate(world.updatedAt)})
                          </div>

                          <div className="text-[12px] text-[#9A9A9A] truncate">
                            {world.mode === 'survival' ? 'Survival Mode' : 'Creative Mode'},{' '}
                            {PRESET_LABELS[world.preset] ?? world.preset}, {world.editCount} edits
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Bottom Separator Texture */}
            <div
              aria-hidden="true"
              className="w-full h-[4px] shrink-0 pointer-events-none relative z-10"
              style={footerSepStyle}
            />
          </main>

          {/* Bottom Footer Action Buttons */}
          <footer className="shrink-0 w-full px-4 py-4">
            {worldPendingDelete ? (
              <div className="w-full max-w-[560px] mx-auto flex flex-col items-center gap-2.5">
                <p className="text-[14px] text-white text-center mc-shadow-text">
                  Delete &ldquo;{worldPendingDelete.name}&rdquo; permanently?
                </p>
                <div className="w-full max-w-[360px] grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteWorld(worldPendingDelete.id);
                      setConfirmDeleteId(null);
                    }}
                    className="mc-btn h-[40px] text-[14px] text-[#FFB4AE] cursor-pointer"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="mc-btn h-[40px] text-[14px] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-[560px] mx-auto flex flex-col gap-2">
                {/* Row 1: Primary World Actions */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={!selectedWorld}
                    onClick={() => {
                      if (selectedWorld) onPlayWorld(selectedWorld.id);
                    }}
                    className="mc-btn h-[40px] px-3 text-[14px] cursor-pointer truncate"
                  >
                    Play Selected World
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="mc-btn h-[40px] px-3 text-[14px] cursor-pointer truncate"
                  >
                    Create New World
                  </button>
                </div>

                {/* Row 2: Secondary World Management Actions */}
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    disabled={!selectedWorld}
                    onClick={() => {
                      if (!selectedWorld) return;
                      setRenamingId(selectedWorld.id);
                      setRenameText(selectedWorld.name);
                      setConfirmDeleteId(null);
                    }}
                    className="mc-btn h-[38px] px-2 text-[13px] cursor-pointer truncate"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={!selectedWorld}
                    onClick={() => {
                      if (!selectedWorld) return;
                      setRenamingId(null);
                      setConfirmDeleteId(selectedWorld.id);
                    }}
                    className="mc-btn h-[38px] px-2 text-[13px] cursor-pointer truncate"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    disabled={!selectedWorld}
                    onClick={() => {
                      if (!selectedWorld) return;
                      setConfirmDeleteId(null);
                      onDuplicateWorld(selectedWorld.id);
                    }}
                    className="mc-btn h-[38px] px-2 text-[13px] cursor-pointer truncate"
                  >
                    Re-Create
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mc-btn h-[38px] px-2 text-[13px] cursor-pointer truncate"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </footer>
        </>
      ) : (
        <>
          {/* Create New World Header */}
          <header className="shrink-0 w-full flex flex-col items-center justify-center py-5 px-4">
            <h1 className="text-center text-[20px] sm:text-[22px] font-normal tracking-wide text-white mc-shadow-text">
              Create New World
            </h1>
          </header>

          {/* Create New World Middle Panel */}
          <main className="relative flex-1 min-h-0 w-full flex flex-col">
            <div
              aria-hidden="true"
              className="w-full h-[4px] shrink-0 pointer-events-none relative z-10"
              style={headerSepStyle}
            />

            <div className="flex-1 min-h-0 w-full bg-black/52 overflow-y-auto px-4 py-6">
              <div className="w-full max-w-[460px] mx-auto space-y-5">
                {/* World Name */}
                <div>
                  <label
                    htmlFor="new-world-name"
                    className="block text-[13px] text-[#C8C8C8] mb-1.5 mc-shadow-text"
                  >
                    World Name
                  </label>
                  <input
                    id="new-world-name"
                    type="text"
                    maxLength={36}
                    value={newName}
                    onChange={(e) => {
                      setNameTouched(true);
                      setNewName(e.target.value);
                    }}
                    placeholder="Enter a name for your world"
                    className="mc-text-field w-full h-[38px] px-3 text-[14px]"
                  />
                </div>

                {/* Game Mode */}
                <div>
                  <div className="text-[13px] text-[#C8C8C8] mb-1.5 mc-shadow-text">
                    Game Mode
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      data-active={newMode === 'survival' ? 'true' : undefined}
                      onClick={() => setNewMode('survival')}
                      className="mc-btn h-[40px] px-3 text-[14px] cursor-pointer"
                    >
                      Survival
                    </button>
                    <button
                      type="button"
                      data-active={newMode === 'creative' ? 'true' : undefined}
                      onClick={() => setNewMode('creative')}
                      className="mc-btn h-[40px] px-3 text-[14px] cursor-pointer"
                    >
                      Creative
                    </button>
                  </div>
                </div>

                {/* Terrain Type */}
                <div>
                  <div className="text-[13px] text-[#C8C8C8] mb-1.5 mc-shadow-text">
                    World Type
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {PRESET_OPTIONS.map((opt) => {
                      const active = newPreset === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          data-active={active ? 'true' : undefined}
                          onClick={() => handlePresetChange(opt.id)}
                          className="mc-btn py-2 px-3 text-left cursor-pointer"
                        >
                          <div className="text-[13px] leading-tight">{opt.label}</div>
                          <div className="text-[10px] text-[#D0D0D0] mt-0.5 leading-snug opacity-85">
                            {opt.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* World Seed */}
                <div>
                  <label
                    htmlFor="new-world-seed"
                    className="block text-[13px] text-[#C8C8C8] mb-1.5 mc-shadow-text"
                  >
                    Seed for the World Generator
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="new-world-seed"
                      type="text"
                      inputMode="numeric"
                      value={newSeedText}
                      onChange={(e) =>
                        setNewSeedText(e.target.value.replace(/[^0-9-]/g, '').slice(0, 8))
                      }
                      placeholder="Leave blank for a random seed"
                      className="mc-text-field flex-1 h-[38px] px-3 text-[14px]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setNewSeedText(String(Math.floor(10000 + Math.random() * 89999)))
                      }
                      className="mc-btn h-[38px] px-3 flex items-center gap-1.5 text-[13px] cursor-pointer whitespace-nowrap"
                    >
                      <Dices className="w-4 h-4" />
                      <span>Random</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div
              aria-hidden="true"
              className="w-full h-[4px] shrink-0 pointer-events-none relative z-10"
              style={footerSepStyle}
            />
          </main>

          {/* Create New World Footer Buttons */}
          <footer className="shrink-0 w-full px-4 py-4">
            <div className="w-full max-w-[460px] mx-auto grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleCreateSubmit(true)}
                className="mc-btn h-[40px] px-4 text-[14px] cursor-pointer"
              >
                Create New World
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                className="mc-btn h-[40px] px-4 text-[14px] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
};
