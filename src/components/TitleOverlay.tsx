import React from 'react';

interface TitleOverlayProps {
  fps: number;
  showFps: boolean;
  hasPanorama: boolean;
  dirtTextureUrl: string | null;
  onOpenSingleplayer: () => void;
  onOpenSettings: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  fps,
  showFps,
  hasPanorama,
  dirtTextureUrl,
  onOpenSingleplayer,
  onOpenSettings,
}) => {
  const fpsTone =
    fps >= 50 ? 'text-[#96D86E]' : fps >= 30 ? 'text-[#E8C574]' : 'text-[#EB8B7B]';

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none">
      {/* Default Repeated Dirt Texture Background (when no F1 panorama is saved) */}
      {!hasPanorama && (
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
          <div className="absolute inset-0 bg-[#120C08]/58" />
        </div>
      )}

      {/* Live FPS Readout */}
      {showFps && (
        <div className="fixed top-4 left-4 z-30 px-2.5 py-1 rounded-md bg-[#12181F]/80 border border-white/12 text-xs font-mono-num font-bold">
          <span className={fpsTone}>{fps} FPS</span>
        </div>
      )}

      {/* Top Title Lockup over open sky */}
      <div
        className="w-full pt-12 pb-16 px-6 flex flex-col items-center text-center"
        style={{
          background:
            'linear-gradient(180deg, rgba(13,19,26,0.72) 0%, rgba(13,19,26,0.34) 68%, rgba(13,19,26,0) 100%)',
        }}
      >
        <div className="flex items-center gap-3.5 mb-2">
          <svg
            width="44"
            height="44"
            viewBox="0 0 44 44"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="shrink-0 drop-shadow-[0_3px_8px_rgba(0,0,0,0.45)]"
          >
            <polygon points="22,3 40,12.5 22,22 4,12.5" fill="#7AC150" />
            <polygon points="22,3 40,12.5 31,17.25 13,7.75" fill="#90D464" fillOpacity="0.45" />
            <polygon points="4,12.5 22,22 22,41 4,31.5" fill="#8C623D" />
            <polygon points="4,12.5 22,22 22,27.5 4,18" fill="#5CA03A" />
            <polygon points="40,12.5 22,22 22,41 40,31.5" fill="#68462A" />
            <polygon points="40,12.5 22,22 22,27.5 40,18" fill="#467F2C" />
            <path
              d="M22 3L40 12.5V31.5L22 41L4 31.5V12.5L22 3Z"
              stroke="#1B241E"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          <h1
            className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-[#F6F4EC]"
            style={{ textShadow: '0 3px 16px rgba(10,16,22,0.72)' }}
          >
            VOXELVALE
          </h1>
        </div>
        <p className="text-sm sm:text-base text-stone-200/95 max-w-md font-medium drop-shadow-[0_1px_6px_rgba(0,0,0,0.75)]">
          Gather resources, craft tools, survive the night, and shape procedural voxel worlds.
        </p>
      </div>

      {/* Main Menu 3-Button Stack */}
      <div
        className="w-full pt-14 pb-12 px-4 flex flex-col items-center"
        style={{
          background:
            'linear-gradient(0deg, rgba(13,19,26,0.88) 0%, rgba(13,19,26,0.52) 64%, rgba(13,19,26,0) 100%)',
        }}
      >
        <div className="pointer-events-auto w-full max-w-[300px] sm:max-w-[340px] flex flex-col gap-3">
          <button
            type="button"
            onClick={onOpenSingleplayer}
            className="mc-btn w-full py-2.5 px-6 font-display font-bold text-base tracking-wide cursor-pointer whitespace-nowrap"
          >
            Singleplayer
          </button>

          <button
            type="button"
            disabled
            title="Multiplayer is currently unavailable"
            className="mc-btn w-full py-2.5 px-6 font-display font-bold text-base tracking-wide whitespace-nowrap"
          >
            Multiplayer
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="mc-btn w-full py-2.5 px-6 font-display font-bold text-base tracking-wide cursor-pointer whitespace-nowrap"
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  );
};
