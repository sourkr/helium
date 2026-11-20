import React, { useEffect, useState } from 'react';
import { Backpack, Feather, Grid2x2, Pause, Volume2, VolumeX } from 'lucide-react';
import { getWaterOverlayTextureUrl } from '../game/assetPack';
import { BLOCK_DEFS, BlockType } from '../game/blocks';
import { HudSnapshot } from '../game/engine';
import {
  GameMode,
  getDurabilityBarColor,
  getSlotDurability,
  HOTBAR_SIZE,
  InventorySlot,
  ITEM_DEFS,
  ItemType,
} from '../game/survival';

interface GameHudProps {
  hud: HudSnapshot;
  mode: GameMode;
  creativeHotbar: ItemType[];
  survivalSlots: Array<InventorySlot | null>;
  activeSlot: number;
  itemIcons: Record<number, string>;
  muted: boolean;
  showFps?: boolean;
  onSelectSlot: (slot: number) => void;
  onOpenInventory: () => void;
  onOpenPause: () => void;
  onToggleMute: () => void;
  onToggleFly: () => void;
}

function getTimeLabel(t: number): string {
  if (t >= 0.2 && t < 0.34) return 'Dawn';
  if (t >= 0.34 && t < 0.66) return 'Daylight';
  if (t >= 0.66 && t < 0.8) return 'Sunset';
  return 'Night';
}

const HeartIcon: React.FC<{ fill: 'full' | 'half' | 'empty' }> = ({ fill }) => (
  <svg width="15" height="14" viewBox="0 0 15 14" fill="none" aria-hidden="true">
    <path
      d="M7.5 12.8L6.45 11.85C2.7 8.45 0.5 6.45 0.5 3.95C0.5 1.95 2.05 0.5 4.05 0.5C5.2 0.5 6.3 1.05 7.05 1.9L7.5 2.45L7.95 1.9C8.7 1.05 9.8 0.5 10.95 0.5C12.95 0.5 14.5 1.95 14.5 3.95C14.5 6.45 12.3 8.45 8.55 11.85L7.5 12.8Z"
      fill="#1A1F26"
      stroke="#0C1014"
      strokeWidth="1"
    />
    {fill === 'full' && (
      <path
        d="M7.5 11.8L6.65 11C3.3 7.95 1.4 6.15 1.4 4C1.4 2.5 2.55 1.4 4.05 1.4C5.1 1.4 6.1 1.95 6.8 2.85L7.5 3.7L8.2 2.85C8.9 1.95 9.9 1.4 10.95 1.4C12.45 1.4 13.6 2.5 13.6 4C13.6 6.15 11.7 7.95 8.35 11L7.5 11.8Z"
        fill="#E04646"
      />
    )}
    {fill === 'half' && (
      <path
        d="M7.5 11.8L6.65 11C3.3 7.95 1.4 6.15 1.4 4C1.4 2.5 2.55 1.4 4.05 1.4C5.1 1.4 6.1 1.95 6.8 2.85L7.5 3.7V11.8Z"
        fill="#E04646"
      />
    )}
  </svg>
);

const HungerIcon: React.FC<{ fill: 'full' | 'half' | 'empty' }> = ({ fill }) => (
  <svg width="15" height="14" viewBox="0 0 15 14" fill="none" aria-hidden="true">
    <path
      d="M9.6 1.2C11.9 1.2 13.7 3 13.7 5.3C13.7 7.6 11.9 9.4 9.6 9.4C8.8 9.4 8 9.1 7.4 8.7L3.4 12.7C2.9 13.2 2.1 13.2 1.6 12.7C1.1 12.2 1.1 11.4 1.6 10.9L5.6 6.9C5.2 6.3 5 5.6 5 4.8C5 2.8 7 1.2 9.6 1.2Z"
      fill="#1A1F26"
      stroke="#0C1014"
      strokeWidth="1"
    />
    {fill !== 'empty' && (
      <path
        d={
          fill === 'full'
            ? 'M9.6 2.1C11.4 2.1 12.8 3.5 12.8 5.3C12.8 7.1 11.4 8.5 9.6 8.5C8.9 8.5 8.2 8.2 7.6 7.8L4.1 11.3L2.9 10.1L6.4 6.6C6 6 5.9 5.4 5.9 4.8C5.9 3.3 7.5 2.1 9.6 2.1Z'
            : 'M9.6 2.1C11.4 2.1 12.8 3.5 12.8 5.3C12.8 7.1 11.4 8.5 9.6 8.5V2.1Z'
        }
        fill="#D68C3F"
      />
    )}
  </svg>
);

const BubbleIcon: React.FC<{ filled: boolean }> = ({ filled }) => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <circle
      cx="6.5"
      cy="6.5"
      r="5.2"
      fill={filled ? '#4DB3F2' : '#1A232D'}
      fillOpacity={filled ? 0.85 : 0.65}
      stroke="#0C131C"
      strokeWidth="1"
    />
    {filled && <circle cx="4.8" cy="4.6" r="1.4" fill="#E3F6FF" />}
  </svg>
);

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  mode,
  creativeHotbar,
  survivalSlots,
  activeSlot,
  itemIcons,
  muted,
  showFps = true,
  onSelectSlot,
  onOpenInventory,
  onOpenPause,
  onToggleMute,
  onToggleFly,
}) => {
  const [showItemLabel, setShowItemLabel] = useState(true);

  const activeCreativeItem = creativeHotbar[activeSlot] ?? ItemType.Grass;
  const activeSurvivalSlot = survivalSlots[activeSlot] ?? null;

  const activeLabel =
    mode === 'creative'
      ? ITEM_DEFS[activeCreativeItem]?.name ??
        BLOCK_DEFS[activeCreativeItem as unknown as BlockType]?.name ??
        'Block'
      : activeSurvivalSlot
        ? ITEM_DEFS[activeSurvivalSlot.item]?.name ?? 'Item'
        : 'Empty Hand';

  const activeKey =
    mode === 'creative'
      ? `c-${activeSlot}-${activeCreativeItem}`
      : `s-${activeSlot}-${activeSurvivalSlot?.item ?? 'empty'}`;

  useEffect(() => {
    setShowItemLabel(true);
    const id = window.setTimeout(() => setShowItemLabel(false), 2200);
    return () => window.clearTimeout(id);
  }, [activeKey]);

  const crosshairScale = 1 + hud.crosshairPulse * 0.22;
  const showOxygen = mode === 'survival' && (hud.underwater || hud.oxygen < hud.maxOxygen);
  const fpsTone =
    hud.fps >= 50 ? 'text-[#96D86E]' : hud.fps >= 30 ? 'text-[#E8C574]' : 'text-[#EB8B7B]';

  const [waterOverlayUrl] = useState<string | null>(() => getWaterOverlayTextureUrl());

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4">
      {/* Underwater Texture Overlay */}
      {hud.underwater && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none z-0 bg-[#1B4EA8]/35"
          style={
            waterOverlayUrl
              ? {
                  backgroundImage: `url("${waterOverlayUrl}")`,
                  backgroundRepeat: 'repeat',
                  backgroundSize: '128px 128px',
                  imageRendering: 'pixelated',
                  opacity: 0.35,
                  mixBlendMode: 'multiply',
                }
              : undefined
          }
        />
      )}

      {/* Subtle Crimson Damage Vignette */}
      {hud.damageFlash > 0.01 && (
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            boxShadow: `inset 0 0 90px rgba(210, 38, 38, ${(hud.damageFlash * 0.65).toFixed(3)})`,
          }}
        />
      )}

      {/* Top Perimeter Row */}
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="px-3 py-2 rounded-md bg-[#12181F]/84 border border-white/15 text-stone-100 shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-100">
            <span>{hud.biome}</span>
            <span className="text-stone-500" aria-hidden="true">·</span>
            <span className="text-stone-300 font-normal">{getTimeLabel(hud.timeOfDay)}</span>
            <span className="text-stone-500" aria-hidden="true">·</span>
            <span className={mode === 'survival' ? 'text-[#EB8B7B]' : 'text-[#96D86E]'}>
              {mode === 'survival' ? 'Survival' : 'Creative'}
            </span>
            {showFps && (
              <>
                <span className="text-stone-500" aria-hidden="true">·</span>
                <span className={`font-mono-num font-bold ${fpsTone}`}>{hud.fps} FPS</span>
              </>
            )}
            {hud.flying && (
              <>
                <span className="text-stone-500" aria-hidden="true">·</span>
                <span className="text-[#96D86E]">Flying</span>
              </>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2.5 text-[11px] font-mono-num text-stone-300">
            <span>X {hud.x}</span>
            <span>Y {hud.y}</span>
            <span>Z {hud.z}</span>
            {hud.targetedBlock && (
              <>
                <span className="text-stone-600" aria-hidden="true">/</span>
                <span className="font-sans text-stone-200">{hud.targetedBlock}</span>
              </>
            )}
          </div>
        </div>

        {/* Top-Right Compact Action Buttons */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          {mode === 'creative' && (
            <button
              type="button"
              onClick={onToggleFly}
              title="Toggle Fly Mode (V)"
              className={`h-9 px-2.5 rounded-md border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                hud.flying
                  ? 'bg-[#5CA03A] border-[#96D86E]/70 text-[#0E160D]'
                  : 'bg-[#12181F]/80 border-white/15 text-stone-200 hover:bg-[#1E2731]/90'
              }`}
            >
              <Feather className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Fly</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleMute}
            title={muted ? 'Unmute Sound (M)' : 'Mute Sound (M)'}
            className="w-9 h-9 rounded-md bg-[#12181F]/80 hover:bg-[#1E2731]/90 border border-white/15 text-stone-200 flex items-center justify-center transition-colors cursor-pointer"
            aria-label={muted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {muted ? <VolumeX className="w-4 h-4 text-stone-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onOpenPause}
            title="Pause Menu (Esc / P)"
            className="h-9 px-3 rounded-md bg-[#12181F]/80 hover:bg-[#1E2731]/90 border border-white/15 text-stone-100 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Menu</span>
          </button>
        </div>
      </div>

      {/* Center Crosshair + Progressive Survival Mining Bar */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center">
        <div
          style={{
            transform: `scale(${crosshairScale.toFixed(3)})`,
            transition: 'transform 60ms ease-out',
          }}
          aria-hidden="true"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 5V19M5 12H19"
              stroke="rgba(10,14,18,0.8)"
              strokeWidth="3.6"
              strokeLinecap="square"
            />
            <path
              d="M12 5V19M5 12H19"
              stroke="#FFFFFF"
              strokeWidth="1.8"
              strokeLinecap="square"
            />
          </svg>
        </div>

        {hud.miningProgress > 0.01 && (
          <div className="mt-2.5 w-16 h-1.5 rounded-full bg-[#10161D]/85 border border-white/20 overflow-hidden">
            <div
              className="h-full bg-[#E9E4D8]"
              style={{ width: `${Math.round(hud.miningProgress * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Bottom Status Bars & Hotbar Stack */}
      <div className="relative z-10 flex flex-col items-center gap-1.5">
        {/* Toast or Active Item Label */}
        <div className="h-5 flex items-center justify-center">
          {hud.toastText ? (
            <span className="px-2.5 py-0.5 rounded bg-[#12181F]/88 border border-white/10 text-xs font-semibold text-[#F1E6C8]">
              {hud.toastText}
            </span>
          ) : showItemLabel ? (
            <span className="px-2.5 py-0.5 rounded bg-[#12181F]/80 text-xs font-semibold text-stone-100 tracking-wide">
              {activeLabel}
            </span>
          ) : !hud.pointerLocked ? (
            <span className="px-2.5 py-0.5 rounded bg-[#12181F]/75 text-[11px] font-medium text-stone-300">
              Click world to lock cursor · Hold LMB mine · RMB place/eat
            </span>
          ) : null}
        </div>

        {/* Survival Vitals Row (Hearts, Oxygen, Hunger) docked cleanly over Hotbar */}
        {mode === 'survival' && (
          <div className="w-full max-w-[508px] px-1 flex flex-col gap-1">
            {showOxygen && (
              <div className="flex justify-end gap-0.5">
                {Array.from({ length: 10 }, (_, i) => (
                  <BubbleIcon key={i} filled={hud.oxygen >= i + 0.5} />
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              {/* 10 Hearts (20 HP) */}
              <div className="flex items-center gap-0.5" aria-label={`Health ${hud.health} of ${hud.maxHealth}`}>
                {Array.from({ length: 10 }, (_, i) => {
                  const val = hud.health - i * 2;
                  const state: 'full' | 'half' | 'empty' =
                    val >= 2 ? 'full' : val >= 1 ? 'half' : 'empty';
                  return <HeartIcon key={i} fill={state} />;
                })}
              </div>

              {/* 10 Hunger Icons (20 Hunger) */}
              <div className="flex items-center gap-0.5" aria-label={`Hunger ${hud.hunger} of ${hud.maxHunger}`}>
                {Array.from({ length: 10 }, (_, i) => {
                  const idx = 9 - i;
                  const val = hud.hunger - idx * 2;
                  const state: 'full' | 'half' | 'empty' =
                    val >= 2 ? 'full' : val >= 1 ? 'half' : 'empty';
                  return <HungerIcon key={i} fill={state} />;
                })}
              </div>
            </div>
          </div>
        )}

        {/* Classic 9-Slot Hotbar + Inventory/Craft Button */}
        <div className="pointer-events-auto flex items-center gap-1 p-1.5 rounded-lg bg-[#141A20]/90 border border-white/15 shadow-[0_8px_28px_rgba(0,0,0,0.5)]">
          {Array.from({ length: HOTBAR_SIZE }, (_, idx) => {
            const isActive = idx === activeSlot;
            const survivalSlot = mode === 'survival' ? survivalSlots[idx] ?? null : null;
            const slotItem =
              mode === 'creative'
                ? (creativeHotbar[idx] as number)
                : survivalSlot?.item ?? null;
            const count = survivalSlot?.count ?? 0;
            const dur = getSlotDurability(survivalSlot);
            const iconSrc = slotItem !== null ? itemIcons[slotItem] : undefined;
            const name =
              slotItem !== null
                ? ITEM_DEFS[slotItem as ItemType]?.name ??
                  BLOCK_DEFS[slotItem as unknown as BlockType]?.name
                : 'Empty';
            const titleText = dur
              ? `${idx + 1}: ${name} (${dur.current}/${dur.max})`
              : `${idx + 1}: ${name ?? 'Empty'}`;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectSlot(idx)}
                title={titleText}
                className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-md flex items-center justify-center transition-transform duration-100 cursor-pointer ${
                  isActive
                    ? 'bg-[#2C3640] ring-2 ring-[#E8DFC8] -translate-y-0.5'
                    : 'bg-[#1B222A] hover:bg-[#242D37] border border-white/8'
                }`}
              >
                <span className="absolute top-0.5 left-1 text-[10px] font-mono-num text-stone-400 leading-none">
                  {idx + 1}
                </span>

                {iconSrc ? (
                  <img
                    src={iconSrc}
                    alt={name ?? 'Item'}
                    className="w-8 h-8 sm:w-9 sm:h-9 pixelated pointer-events-none"
                    draggable={false}
                  />
                ) : null}

                {dur && dur.current < dur.max && (
                  <div className="absolute bottom-1 left-1.5 right-1.5 h-[3px] bg-[#0B0F14] pointer-events-none">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.max(5, Math.round(dur.ratio * 100))}%`,
                        backgroundColor: getDurabilityBarColor(dur.ratio),
                      }}
                    />
                  </div>
                )}

                {mode === 'survival' && count > 1 && (
                  <span
                    className="absolute bottom-0.5 right-1 text-[11px] font-mono-num font-bold text-white leading-none"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          <div className="w-px h-8 bg-white/15 mx-0.5" aria-hidden="true" />

          <button
            type="button"
            onClick={onOpenInventory}
            title={mode === 'survival' ? 'Backpack & Crafting (E)' : 'All Blocks (E)'}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-md bg-[#1B222A] hover:bg-[#27323D] border border-white/10 text-stone-200 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer"
          >
            {mode === 'survival' ? <Backpack className="w-4 h-4" /> : <Grid2x2 className="w-4 h-4" />}
            <span className="text-[10px] font-mono-num text-stone-400 leading-none">E</span>
          </button>
        </div>
      </div>
    </div>
  );
};
