/**
 * Automatically loads Minecraft-style GUI button 9-slice sprite textures and their
 * `.mcmeta` scaling metadata from /assets/texture/gui/sprites/widget/ (or /assets/textures/...),
 * exposing CSS custom properties on :root for crisp pixelated `.mc-btn` rendering.
 */

const GUI_WIDGET_IMAGES = import.meta.glob(
  '/assets/**/gui/sprites/widget/*.{png,webp}',
  { eager: true, import: 'default' },
) as Record<string, string>;

const GUI_WIDGET_MCMETA = import.meta.glob(
  '/assets/**/gui/sprites/widget/*.mcmeta',
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;

const GUI_ROOT_IMAGES = import.meta.glob(
  '/assets/**/gui/*.{png,webp}',
  { eager: true, import: 'default' },
) as Record<string, string>;

interface McmetaScaling {
  gui?: {
    scaling?: {
      type?: string;
      width?: number;
      height?: number;
      border?: number | { left?: number; right?: number; top?: number; bottom?: number };
    };
  };
}

function findAssetByStem(map: Record<string, string>, stem: string): string | null {
  const lower = stem.toLowerCase();
  for (const [path, val] of Object.entries(map)) {
    const file = (path.split('/').pop() ?? '').toLowerCase();
    const fileStem = file.replace(/\.png\.mcmeta$/, '').replace(/\.[^.]+$/, '');
    if (fileStem === lower && val) return val;
  }
  return null;
}

function parseBorderSlice(rawMcmeta: string | null, fallback: number): number {
  if (!rawMcmeta) return fallback;
  try {
    const parsed = JSON.parse(rawMcmeta) as McmetaScaling;
    const border = parsed.gui?.scaling?.border;
    if (typeof border === 'number' && border > 0) return border;
    if (border && typeof border === 'object' && typeof border.left === 'number') {
      return border.left;
    }
  } catch {
    // Use fallback slice
  }
  return fallback;
}

export interface GuiButtonSprites {
  normalUrl: string | null;
  highlightedUrl: string | null;
  disabledUrl: string | null;
  normalSlice: number;
  highlightedSlice: number;
  disabledSlice: number;
}

export interface GuiTextFieldSprites {
  normalUrl: string | null;
  highlightedUrl: string | null;
  normalSlice: number;
  highlightedSlice: number;
}

export interface GuiSeparatorTextures {
  headerUrl: string | null;
  footerUrl: string | null;
}

export const GUI_BUTTON_SPRITES: GuiButtonSprites = {
  normalUrl: findAssetByStem(GUI_WIDGET_IMAGES, 'button'),
  highlightedUrl: findAssetByStem(GUI_WIDGET_IMAGES, 'button_highlighted'),
  disabledUrl: findAssetByStem(GUI_WIDGET_IMAGES, 'button_disabled'),
  normalSlice: parseBorderSlice(findAssetByStem(GUI_WIDGET_MCMETA, 'button'), 3),
  highlightedSlice: parseBorderSlice(
    findAssetByStem(GUI_WIDGET_MCMETA, 'button_highlighted'),
    3,
  ),
  disabledSlice: parseBorderSlice(
    findAssetByStem(GUI_WIDGET_MCMETA, 'button_disabled'),
    1,
  ),
};

export const GUI_TEXT_FIELD_SPRITES: GuiTextFieldSprites = {
  normalUrl: findAssetByStem(GUI_WIDGET_IMAGES, 'text_field'),
  highlightedUrl: findAssetByStem(GUI_WIDGET_IMAGES, 'text_field_highlighted'),
  normalSlice: parseBorderSlice(findAssetByStem(GUI_WIDGET_MCMETA, 'text_field'), 1),
  highlightedSlice: parseBorderSlice(
    findAssetByStem(GUI_WIDGET_MCMETA, 'text_field_highlighted'),
    1,
  ),
};

export const GUI_SEPARATORS: GuiSeparatorTextures = {
  headerUrl:
    findAssetByStem(GUI_ROOT_IMAGES, 'header_separator') ??
    findAssetByStem(GUI_ROOT_IMAGES, 'header_seperator'),
  footerUrl:
    findAssetByStem(GUI_ROOT_IMAGES, 'footer_separator') ??
    findAssetByStem(GUI_ROOT_IMAGES, 'footer_seperator'),
};

export function initGuiButtonTheme(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const {
    normalUrl,
    highlightedUrl,
    disabledUrl,
    normalSlice,
    highlightedSlice,
    disabledSlice,
  } = GUI_BUTTON_SPRITES;

  if (normalUrl) {
    root.style.setProperty('--mc-btn-normal', `url("${normalUrl}")`);
    root.style.setProperty('--mc-btn-slice', String(normalSlice));
  }
  if (highlightedUrl) {
    root.style.setProperty('--mc-btn-highlighted', `url("${highlightedUrl}")`);
    root.style.setProperty('--mc-btn-highlighted-slice', String(highlightedSlice));
  }
  if (disabledUrl) {
    root.style.setProperty('--mc-btn-disabled', `url("${disabledUrl}")`);
    root.style.setProperty('--mc-btn-disabled-slice', String(disabledSlice));
  }

  if (GUI_TEXT_FIELD_SPRITES.normalUrl) {
    root.style.setProperty(
      '--mc-textfield-normal',
      `url("${GUI_TEXT_FIELD_SPRITES.normalUrl}")`,
    );
    root.style.setProperty(
      '--mc-textfield-slice',
      String(GUI_TEXT_FIELD_SPRITES.normalSlice),
    );
  }
  if (GUI_TEXT_FIELD_SPRITES.highlightedUrl) {
    root.style.setProperty(
      '--mc-textfield-highlighted',
      `url("${GUI_TEXT_FIELD_SPRITES.highlightedUrl}")`,
    );
    root.style.setProperty(
      '--mc-textfield-highlighted-slice',
      String(GUI_TEXT_FIELD_SPRITES.highlightedSlice),
    );
  }
  if (GUI_SEPARATORS.headerUrl) {
    root.style.setProperty('--mc-header-separator', `url("${GUI_SEPARATORS.headerUrl}")`);
  }
  if (GUI_SEPARATORS.footerUrl) {
    root.style.setProperty('--mc-footer-separator', `url("${GUI_SEPARATORS.footerUrl}")`);
  }
}

initGuiButtonTheme();
