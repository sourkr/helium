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

const GUI_HUD_IMAGES = import.meta.glob(
  '/assets/**/gui/sprites/hud/*.{png,webp}',
  { eager: true, import: 'default' },
) as Record<string, string>;

const GUI_HEART_IMAGES = import.meta.glob(
  '/assets/**/gui/sprites/hud/heart/*.{png,webp}',
  { eager: true, import: 'default' },
) as Record<string, string>;

const GUI_FOOD_IMAGES = import.meta.glob(
  '/assets/**/gui/sprites/hud/food_*.{png,webp}',
  { eager: true, import: 'default' },
) as Record<string, string>;

const GUI_RECIPE_BOOK_SPRITE_IMAGES = import.meta.glob(
  '/assets/**/gui/sprites/recipe_book/*.{png,webp}',
  { eager: true, import: 'default' },
) as Record<string, string>;

const GUI_CONTAINER_IMAGES = import.meta.glob(
  '/assets/**/gui/container/*.{png,webp}',
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

export interface GuiHeartTextures {
  containerUrl: string | null;
  fullUrl: string | null;
  halfUrl: string | null;
}

export interface GuiFoodTextures {
  emptyUrl: string | null;
  fullUrl: string | null;
  halfUrl: string | null;
}

/** 9x9 health sprites from /assets/texture/gui/sprites/hud/heart/ */
export const GUI_HEART_TEXTURES: GuiHeartTextures = {
  containerUrl: findAssetByStem(GUI_HEART_IMAGES, 'container'),
  fullUrl: findAssetByStem(GUI_HEART_IMAGES, 'full'),
  halfUrl: findAssetByStem(GUI_HEART_IMAGES, 'half'),
};

/** 9x9 hunger sprites from /assets/texture/gui/sprites/hud/food_*.png */
export const GUI_FOOD_TEXTURES: GuiFoodTextures = {
  emptyUrl: findAssetByStem(GUI_FOOD_IMAGES, 'food_empty'),
  fullUrl: findAssetByStem(GUI_FOOD_IMAGES, 'food_full'),
  halfUrl: findAssetByStem(GUI_FOOD_IMAGES, 'food_half'),
};

/** 182x22 nine-slot hotbar background from /assets/texture/gui/sprites/hud/hotbar.png */
export const GUI_HOTBAR_TEXTURE_URL: string | null = findAssetByStem(
  GUI_HUD_IMAGES,
  'hotbar',
);

/** 24x23 selection frame from /assets/texture/gui/sprites/hud/hotbar_selection.png */
export const GUI_HOTBAR_SELECTION_TEXTURE_URL: string | null = findAssetByStem(
  GUI_HUD_IMAGES,
  'hotbar_selection',
);

/** 176x166 vanilla crafting GUI from /assets/texture/gui/container/crafting_table.png */
export const GUI_CRAFTING_TABLE_TEXTURE_URL: string | null = findAssetByStem(
  GUI_CONTAINER_IMAGES,
  'crafting_table',
);

/** 147x166 recipe book panel from /assets/texture/gui/recipe_book.png */
export const GUI_RECIPE_BOOK_TEXTURE_URL: string | null = findAssetByStem(
  GUI_ROOT_IMAGES,
  'recipe_book',
);

/** 20x18 recipe book button sprites from /assets/texture/gui/sprites/recipe_book/ */
export const GUI_RECIPE_BOOK_BUTTON_SPRITES: GuiButtonSprites = {
  normalUrl: findAssetByStem(GUI_RECIPE_BOOK_SPRITE_IMAGES, 'button'),
  highlightedUrl: findAssetByStem(GUI_RECIPE_BOOK_SPRITE_IMAGES, 'button_highlighted'),
  disabledUrl: null,
  normalSlice: 3,
  highlightedSlice: 3,
  disabledSlice: 3,
};

/** 26x16 recipe book craftable filter toggle textures. */
export const GUI_RECIPE_FILTER_TEXTURES = {
  disabledUrl: findAssetByStem(GUI_RECIPE_BOOK_SPRITE_IMAGES, 'filter_disabled'),
  disabledHighlightedUrl: findAssetByStem(
    GUI_RECIPE_BOOK_SPRITE_IMAGES,
    'filter_disabled_highlighted',
  ),
  enabledUrl: findAssetByStem(GUI_RECIPE_BOOK_SPRITE_IMAGES, 'filter_enabled'),
  enabledHighlightedUrl: findAssetByStem(
    GUI_RECIPE_BOOK_SPRITE_IMAGES,
    'filter_enabled_highlighted',
  ),
};

/** 25x25 recipe book output slot backgrounds from /assets/texture/gui/sprites/recipe_book/. */
export const GUI_RECIPE_SLOT_TEXTURES = {
  craftableUrl: findAssetByStem(GUI_RECIPE_BOOK_SPRITE_IMAGES, 'slot_craftable'),
  manyCraftableUrl: findAssetByStem(GUI_RECIPE_BOOK_SPRITE_IMAGES, 'slot_many_craftable'),
  uncraftableUrl: findAssetByStem(GUI_RECIPE_BOOK_SPRITE_IMAGES, 'slot_uncraftable'),
  manyUncraftableUrl: findAssetByStem(GUI_RECIPE_BOOK_SPRITE_IMAGES, 'slot_many_uncraftable'),
};

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
  if (GUI_HOTBAR_TEXTURE_URL) {
    root.style.setProperty('--mc-hotbar', `url("${GUI_HOTBAR_TEXTURE_URL}")`);
  }
  if (GUI_HOTBAR_SELECTION_TEXTURE_URL) {
    root.style.setProperty(
      '--mc-hotbar-selection',
      `url("${GUI_HOTBAR_SELECTION_TEXTURE_URL}")`,
    );
  }
  if (GUI_CRAFTING_TABLE_TEXTURE_URL) {
    root.style.setProperty('--mc-crafting-table', `url("${GUI_CRAFTING_TABLE_TEXTURE_URL}")`);
  }
  if (GUI_RECIPE_BOOK_TEXTURE_URL) {
    root.style.setProperty('--mc-recipe-book', `url("${GUI_RECIPE_BOOK_TEXTURE_URL}")`);
  }
  if (GUI_RECIPE_BOOK_BUTTON_SPRITES.normalUrl) {
    root.style.setProperty(
      '--mc-recipe-book-btn-normal',
      `url("${GUI_RECIPE_BOOK_BUTTON_SPRITES.normalUrl}")`,
    );
  }
  if (GUI_RECIPE_BOOK_BUTTON_SPRITES.highlightedUrl) {
    root.style.setProperty(
      '--mc-recipe-book-btn-highlighted',
      `url("${GUI_RECIPE_BOOK_BUTTON_SPRITES.highlightedUrl}")`,
    );
  }
  if (GUI_RECIPE_FILTER_TEXTURES.disabledUrl) {
    root.style.setProperty(
      '--mc-recipe-filter-disabled',
      `url("${GUI_RECIPE_FILTER_TEXTURES.disabledUrl}")`,
    );
  }
  if (GUI_RECIPE_FILTER_TEXTURES.disabledHighlightedUrl) {
    root.style.setProperty(
      '--mc-recipe-filter-disabled-highlighted',
      `url("${GUI_RECIPE_FILTER_TEXTURES.disabledHighlightedUrl}")`,
    );
  }
  if (GUI_RECIPE_FILTER_TEXTURES.enabledUrl) {
    root.style.setProperty(
      '--mc-recipe-filter-enabled',
      `url("${GUI_RECIPE_FILTER_TEXTURES.enabledUrl}")`,
    );
  }
  if (GUI_RECIPE_FILTER_TEXTURES.enabledHighlightedUrl) {
    root.style.setProperty(
      '--mc-recipe-filter-enabled-highlighted',
      `url("${GUI_RECIPE_FILTER_TEXTURES.enabledHighlightedUrl}")`,
    );
  }
  if (GUI_RECIPE_SLOT_TEXTURES.craftableUrl) {
    root.style.setProperty(
      '--mc-recipe-slot-craftable',
      `url("${GUI_RECIPE_SLOT_TEXTURES.craftableUrl}")`,
    );
  }
  if (GUI_RECIPE_SLOT_TEXTURES.manyCraftableUrl) {
    root.style.setProperty(
      '--mc-recipe-slot-many-craftable',
      `url("${GUI_RECIPE_SLOT_TEXTURES.manyCraftableUrl}")`,
    );
  }
  if (GUI_RECIPE_SLOT_TEXTURES.uncraftableUrl) {
    root.style.setProperty(
      '--mc-recipe-slot-uncraftable',
      `url("${GUI_RECIPE_SLOT_TEXTURES.uncraftableUrl}")`,
    );
  }
  if (GUI_RECIPE_SLOT_TEXTURES.manyUncraftableUrl) {
    root.style.setProperty(
      '--mc-recipe-slot-many-uncraftable',
      `url("${GUI_RECIPE_SLOT_TEXTURES.manyUncraftableUrl}")`,
    );
  }
  if (GUI_HEART_TEXTURES.containerUrl) {
    root.style.setProperty('--mc-heart-container', `url("${GUI_HEART_TEXTURES.containerUrl}")`);
  }
  if (GUI_HEART_TEXTURES.fullUrl) {
    root.style.setProperty('--mc-heart-full', `url("${GUI_HEART_TEXTURES.fullUrl}")`);
  }
  if (GUI_HEART_TEXTURES.halfUrl) {
    root.style.setProperty('--mc-heart-half', `url("${GUI_HEART_TEXTURES.halfUrl}")`);
  }
  if (GUI_FOOD_TEXTURES.emptyUrl) {
    root.style.setProperty('--mc-food-empty', `url("${GUI_FOOD_TEXTURES.emptyUrl}")`);
  }
  if (GUI_FOOD_TEXTURES.fullUrl) {
    root.style.setProperty('--mc-food-full', `url("${GUI_FOOD_TEXTURES.fullUrl}")`);
  }
  if (GUI_FOOD_TEXTURES.halfUrl) {
    root.style.setProperty('--mc-food-half', `url("${GUI_FOOD_TEXTURES.halfUrl}")`);
  }
}

initGuiButtonTheme();
