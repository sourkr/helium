/**
 * Declarative screen layouts loaded from /assets/gui.
 *
 * Supported elements:
 *   <screen>       Fullscreen root. It may contain one <panorama>/<panaroma>
 *                  or <game> background, plus a non-rendering <components>
 *                  block.
 *   <components>   Reusable component definitions. Each <component name="...">
 *                  declares <attr name="..."/>, <var name="...">,
 *                  <event name="..."/>, and a child template. `onhover="..."`
 *                  is shorthand for a `hover` event expression.
 *   <var>          A per-instance variable. `type` may be `boolean`, `number`,
 *                  or `string`; the element body is its initial value.
 *   <event>        A named component event. `name="hover"` with an expression
 *                  such as `<var> = event.inside` updates a variable; an empty
 *                  event such as `<event name="play"/>` is dispatched to JS.
 *   `onclick="trigger(name)"` fires a declared component event on click.
 *   <panorama>     Fullscreen background made from repeated, scaled dirt tiles.
 *   <game>         Leaves the WebGL game world visible as the background.
 *   <column>       Stacks children vertically. `size` controls width, `gap`
 *                  adds spacing, `padding-top` offsets the first item, and
 *                  `align-items` controls both axes (`center` means
 *                  `center-center`, `top-center` is also valid). A data-bound
 *                  `source="world"` column with `item="world-info"` is filled
 *                  by the game from the saved worlds.
 *   <row>          Lays children out horizontally with an optional `gap`.
 *   <box>          A fixed-size square whose children overlay each other.
 *   <button>       A normal Minecraft-style button. `id` maps to an action in
 *                  CanvasGui; a bare `disable` attribute disables it.
 *   <text>         A text label; its contents are the displayed value.
 *   <text-field>   An editable text field. `placeholder="..."` sets the
 *                  placeholder; the element body is a fallback.
 *   <image>        An image from /assets found by its `src` stem; `size` sets
 *                  its square size (for example `size="32px"`, default 16px).
 *                  `visible="$var"` shows it only for a truthy variable,
 *                  `hover_src` supplies an alternate image while hovered, and
 *                  `background-color` paints a CSS color behind it (useful
 *                  when `src` is empty).
 *   <component>    A custom element named like a defined component expands the
 *                  component template, replacing `$attr` in text values.
 *
 * Invalid elements are skipped and reported through `errors` so the UI can be
 * debugged without throwing at startup.
 */

const MENU_LAYOUT_XML = import.meta.glob('/assets/gui/*.xml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

export type MenuNodeType =
  | 'screen'
  | 'panorama'
  | 'game'
  | 'components'
  | 'component'
  | 'attr'
  | 'var'
  | 'event'
  | 'column'
  | 'row'
  | 'box'
  | 'button'
  | 'text'
  | 'text-field'
  | 'image';

export type MenuAlign = 'start' | 'center' | 'end';

export interface MenuAlignment {
  horizontal: MenuAlign;
  vertical: MenuAlign;
}

export type MenuVarValue = boolean | number | string;

export interface MenuVariable {
  name: string;
  type: string;
  value: string;
}

export interface MenuEvent {
  name: string;
  expression: string;
}

export interface MenuButtonSpec {
  id: string;
  label: string;
  disabled: boolean;
}

export interface MenuNode {
  type: MenuNodeType;
  id?: string;
  label?: string;
  disabled?: boolean;
  size?: string | null;
  src?: string | null;
  hoverSrc?: string | null;
  visible?: string;
  backgroundColor?: string;
  varType?: string;
  gap?: number;
  paddingTop?: number;
  alignItems?: MenuAlignment;
  component?: string;
  componentId?: string;
  componentAttrs?: Record<string, string>;
  componentVars?: Record<string, MenuVarValue>;
  componentEvents?: MenuEvent[];
  componentRoot?: boolean;
  listSource?: string;
  itemComponent?: string;
  clickEvent?: string;
  children: MenuNode[];
}

export interface MenuComponent {
  name: string;
  attrs: string[];
  vars: MenuVariable[];
  events: MenuEvent[];
  children: MenuNode[];
}

export interface MenuLayout {
  screen: MenuNode | null;
  source: string | null;
  errors: string[];
  buttons: MenuButtonSpec[];
  background: 'panorama' | 'game' | null;
  components: MenuComponent[];
}

const FALLBACK_BUTTONS: MenuButtonSpec[] = [
  { id: 'btn.singleplay', label: 'Singleplayer', disabled: false },
  { id: 'btn.mutiplayer', label: 'Multiplayer', disabled: true },
  { id: 'btn.setting', label: 'Settings', disabled: false },
];

const SCREEN_CHILDREN: string[] = ['panorama', 'game', 'components'];
const COMPONENTS_CHILDREN: string[] = ['component'];
const COMPONENT_CHILDREN: string[] = [
  'attr',
  'var',
  'event',
  'row',
  'column',
  'box',
  'button',
  'text',
  'text-field',
  'image',
];
const BACKGROUND_CHILDREN: string[] = [
  'column',
  'row',
  'box',
  'button',
  'text',
  'text-field',
  'image',
];
const COLUMN_CHILDREN: string[] = [...BACKGROUND_CHILDREN, 'column'];
const ROW_CHILDREN: string[] = [...BACKGROUND_CHILDREN, 'row', 'column'];
const BOX_CHILDREN: string[] = ['image', 'text', 'text-field', 'button', 'box', 'column', 'row'];
const CENTER_CENTER: MenuAlignment = { horizontal: 'center', vertical: 'center' };

type ComponentRegistry = Map<string, MenuComponent>;
type RawComponentRegistry = Map<string, { name: string; element: Element }>;

function makeLayout(
  background: 'panorama' | 'game',
  children: MenuNode[],
  errors: string[],
  source: string | null,
  buttons: MenuButtonSpec[] = [],
): MenuLayout {
  return {
    screen: { type: 'screen', children: [{ type: background, children }] },
    source,
    errors,
    buttons,
    background,
    components: [],
  };
}

function fallbackMainMenuLayout(errors: string[] = [], source: string | null = null): MenuLayout {
  const buttons = FALLBACK_BUTTONS.map((button) => ({ ...button }));
  return makeLayout(
    'panorama',
    [
      {
        type: 'column',
        size: '100%',
        alignItems: CENTER_CENTER,
        children: buttons.map((button) => ({
          type: 'button',
          id: button.id,
          label: button.label,
          disabled: button.disabled,
          children: [],
        })),
      },
    ],
    errors,
    source,
    buttons,
  );
}

function fallbackWorldListLayout(errors: string[] = [], source: string | null = null): MenuLayout {
  return makeLayout(
    'panorama',
    [
      {
        type: 'column',
        size: '100%',
        alignItems: { horizontal: 'center', vertical: 'start' },
        children: [{ type: 'text', label: 'Select World', children: [] }],
      },
    ],
    errors,
    source,
  );
}

function loadScreenAsset(stems: string[]): { raw: string | null; source: string | null } {
  for (const stem of stems) {
    const entry = Object.entries(MENU_LAYOUT_XML).find(([path]) =>
      new RegExp(`(^|/)${stem}\\.xml$`, 'i').test(path),
    );
    if (entry) return { raw: entry[1], source: entry[0].split('/').pop() ?? null };
  }
  const fallback = Object.entries(MENU_LAYOUT_XML)[0];
  return fallback
    ? { raw: fallback[1], source: fallback[0].split('/').pop() ?? null }
    : { raw: null, source: null };
}

/** Normalize HTML-style boolean attributes and the historical `panaroma` spelling. */
function normalizeXml(raw: string): string {
  return raw
    .replace(/\s(disable|disabled)(?=\s+[\w:-]+\s*=|\s*\/?>)/gi, ' $1="true"')
    .replace(/<\/?panaroma\b/gi, (match) => match.replace(/panaroma/i, 'panorama'))
    // Tolerate the missing `=` typo from `<event name"hover">`.
    .replace(/\sname"([^"]*)"/g, ' name="$1"');
}

function normalizeTag(value: string): MenuNodeType | null {
  switch (value.toLowerCase()) {
    case 'screen':
    case 'panorama':
    case 'game':
    case 'components':
    case 'component':
    case 'attr':
    case 'var':
    case 'event':
    case 'column':
    case 'row':
    case 'box':
    case 'button':
    case 'text':
    case 'text-field':
    case 'image':
      return value.toLowerCase() as MenuNodeType;
    default:
      return null;
  }
}

function isTrue(value: string | null): boolean {
  return value !== null && ['true', '1', 'yes'].includes(value.toLowerCase());
}

function parseLength(value: string | null): number | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(px)?$/i);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
}

/** Parse both-axis alignment, accepting top/bottom/left/right and start/end. */
function parseAlignment(value: string | null): MenuAlignment {
  if (!value) return CENTER_CENTER;
  const tokens = value.trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
  let horizontal: MenuAlign | null = null;
  let vertical: MenuAlign | null = null;

  for (const token of tokens) {
    if (token === 'top' || token === 'bottom') {
      if (!vertical) vertical = token === 'top' ? 'start' : 'end';
      continue;
    }
    if (token === 'left' || token === 'right') {
      if (!horizontal) horizontal = token === 'left' ? 'start' : 'end';
      continue;
    }
    if (token === 'center' || token === 'start' || token === 'end') {
      if (!horizontal) horizontal = token;
      else if (!vertical) vertical = token;
    }
  }
  return { horizontal: horizontal ?? 'center', vertical: vertical ?? 'center' };
}

function allowedChildren(parent: string, registry: ComponentRegistry): string[] {
  const components = Array.from(registry.keys());
  switch (parent) {
    case 'screen':
      return SCREEN_CHILDREN;
    case 'components':
      return COMPONENTS_CHILDREN;
    case 'component':
      return [...COMPONENT_CHILDREN, ...components];
    case 'column':
      return [...COLUMN_CHILDREN, ...components];
    case 'row':
      return [...ROW_CHILDREN, ...components];
    case 'box':
      return [...BOX_CHILDREN, ...components];
    case 'panorama':
    case 'game':
      return [...BACKGROUND_CHILDREN, ...components];
    default:
      return [];
  }
}

function substituteAttributes(node: MenuNode, attrs: Map<string, string>): MenuNode {
  const replace = (value: string | null | undefined): string | null | undefined =>
    value?.replace(/\$([A-Za-z0-9_-]+)/g, (match, key: string) => attrs.get(key) ?? match);
  return {
    ...node,
    label: replace(node.label) ?? undefined,
    src: replace(node.src),
    hoverSrc: replace(node.hoverSrc),
    visible: replace(node.visible) ?? undefined,
    backgroundColor: replace(node.backgroundColor) ?? undefined,
    children: node.children.map((child) => substituteAttributes(child, attrs)),
  };
}

function parseVarDefault(variable: MenuVariable): MenuVarValue {
  const type = variable.type.toLowerCase();
  if (type === 'bool' || type === 'boolean') return isTrue(variable.value);
  if (variable.type.toLowerCase() === 'number') {
    const parsed = Number.parseFloat(variable.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return variable.value;
}

let nextComponentId = 1;

function tagComponent(
  node: MenuNode,
  name: string,
  instanceId: string,
  attrs: Record<string, string>,
  vars: Record<string, MenuVarValue>,
  events: MenuEvent[],
  root = false,
): MenuNode {
  return {
    ...node,
    component: name,
    componentId: instanceId,
    componentAttrs: { ...attrs },
    componentVars: vars,
    componentEvents: events,
    componentRoot: root,
    children: node.children.map((child) =>
      tagComponent(child, name, instanceId, attrs, vars, events, false),
    ),
  };
}

/** Instantiates a component template with runtime-provided attribute values. */
export function createComponentNodes(
  definition: MenuComponent,
  attrs: Record<string, string>,
): MenuNode[] {
  const attrsMap = new Map(Object.entries(attrs));
  const vars: Record<string, MenuVarValue> = {};
  for (const variable of definition.vars) vars[variable.name] = parseVarDefault(variable);
  const instanceId = `${definition.name}#${nextComponentId++}`;
  return definition.children.map((child) =>
    tagComponent(
      substituteAttributes(child, attrsMap),
      definition.name,
      instanceId,
      attrs,
      vars,
      definition.events,
      true,
    ),
  );
}

function instantiateComponent(
  definition: MenuComponent,
  element: Element,
  errors: string[],
): MenuNode[] {
  const attrs: Record<string, string> = {};
  for (const name of definition.attrs) {
    const value = element.getAttribute(name);
    if (value === null) errors.push(`<${definition.name}> is missing attribute "${name}"`);
    attrs[name] = value ?? '';
  }
  return createComponentNodes(definition, attrs);
}

function parseNodeList(
  element: Element,
  parent: string,
  errors: string[],
  registry: ComponentRegistry,
): MenuNode[] {
  const rawTag = element.localName || element.tagName;
  const tag = rawTag.toLowerCase();
  const type = normalizeTag(rawTag);

  if (!type && registry.has(tag)) {
    if (parent === 'screen' || parent === 'components' || parent === 'component') {
      errors.push(`<${rawTag}> is not allowed inside <${parent}>`);
      return [];
    }
    return instantiateComponent(registry.get(tag)!, element, errors);
  }

  const allowed = allowedChildren(parent, registry);
  if (!type || !allowed.includes(type)) {
    errors.push(`<${rawTag}> is not allowed inside <${parent}>`);
    return [];
  }

  const node: MenuNode = { type, children: [] };
  const visible = element.getAttribute('visible');
  if (visible !== null) node.visible = visible.trim();
  const onclick = element.getAttribute('onclick')?.trim();
  if (onclick) {
    const trigger = onclick.match(/^trigger\(\s*([A-Za-z0-9_-]+)\s*\)$/i);
    if (trigger) node.clickEvent = trigger[1];
    else errors.push(`Unsupported onclick "${onclick}"`);
  }
  if (type === 'button') {
    node.id = element.getAttribute('id')?.trim() ?? '';
    node.label = element.textContent?.trim() || node.id;
    node.disabled =
      element.hasAttribute('disabled') ||
      element.hasAttribute('disable') ||
      isTrue(element.getAttribute('disabled')) ||
      isTrue(element.getAttribute('disable'));
    if (!node.id) errors.push('<button> is missing an id');
    return [node];
  }

  if (type === 'text' || type === 'text-field') {
    node.id = element.getAttribute('id')?.trim() ?? undefined;
    const body = element.textContent?.trim() ?? '';
    if (type === 'text-field') {
      const placeholder = element.getAttribute('placeholder');
      node.label = placeholder !== null ? placeholder.trim() : body;
    } else {
      node.label = body;
    }
    node.size = element.getAttribute('size');
    return [node];
  }

  if (type === 'image') {
    node.src = element.getAttribute('src')?.trim() ?? '';
    node.hoverSrc = element.getAttribute('hover_src')?.trim() ?? undefined;
    node.size = element.getAttribute('size');
    node.backgroundColor = element.getAttribute('background-color')?.trim() ?? undefined;
    return [node];
  }

  if (type === 'var') {
    node.id = element.getAttribute('name')?.trim() ?? '';
    node.varType = element.getAttribute('type')?.trim() || 'string';
    node.label = element.textContent?.trim() ?? '';
    if (!node.id) errors.push('<var> is missing a name');
    return [node];
  }

  if (type === 'event') {
    node.id = element.getAttribute('name')?.trim() ?? '';
    node.label = element.textContent?.trim() ?? '';
    if (!node.id) errors.push('<event> is missing a name');
    return [node];
  }

  if (type === 'attr') {
    node.id = element.getAttribute('name')?.trim() ?? '';
    if (!node.id) errors.push('<attr> is missing a name');
    return [node];
  }

  if (type === 'component') {
    node.id = element.getAttribute('name')?.trim() ?? '';
    for (const child of Array.from(element.children)) {
      node.children.push(...parseNodeList(child, 'component', errors, registry));
    }
    return [node];
  }

  if (type === 'column' || type === 'row') {
    node.id = element.getAttribute('id')?.trim() ?? undefined;
    node.size = element.getAttribute('size');
    node.listSource = element.getAttribute('source')?.trim() ?? undefined;
    node.itemComponent = element.getAttribute('item')?.trim() ?? undefined;
    node.gap = parseLength(element.getAttribute('gap'));
    const alignValue = element.getAttribute('align-items');
    if (alignValue !== null) node.alignItems = parseAlignment(alignValue);
    if (type === 'column') {
      node.paddingTop =
        parseLength(element.getAttribute('padding-top')) ??
        parseLength(element.getAttribute('paddingTop'));
    }
  }

  if (type === 'box') {
    node.id = element.getAttribute('id')?.trim() ?? undefined;
    node.size = element.getAttribute('size');
    const alignValue = element.getAttribute('align-items');
    if (alignValue !== null) node.alignItems = parseAlignment(alignValue);
  }

  for (const child of Array.from(element.children)) {
    node.children.push(...parseNodeList(child, type, errors, registry));
  }
  return [node];
}

function collectRawComponents(root: Element, errors: string[]): RawComponentRegistry {
  const registry: RawComponentRegistry = new Map();
  const container = Array.from(root.children).find(
    (child) => normalizeTag(child.localName || child.tagName) === 'components',
  );
  if (!container) return registry;

  for (const element of Array.from(container.children)) {
    if (normalizeTag(element.localName || element.tagName) !== 'component') {
      errors.push(`<${element.localName || element.tagName}> is not allowed inside <components>`);
      continue;
    }
    const name = element.getAttribute('name')?.trim();
    if (!name) {
      errors.push('<component> is missing a name');
      continue;
    }
    registry.set(name, { name, element });
  }
  return registry;
}

function buildComponentRegistry(raw: RawComponentRegistry, errors: string[]): ComponentRegistry {
  const registry: ComponentRegistry = new Map();
  for (const [name, definition] of raw) {
    const component: MenuComponent = { name, attrs: [], vars: [], events: [], children: [] };
    registry.set(name, component);

    const hoverExpression = definition.element.getAttribute('onhover')?.trim();
    if (hoverExpression) {
      component.events.push({ name: 'hover', expression: hoverExpression });
    }

    for (const child of Array.from(definition.element.children)) {
      const tag = normalizeTag(child.localName || child.tagName);
      if (tag === 'attr') {
        const attrName = child.getAttribute('name')?.trim();
        if (!attrName) errors.push(`<${name}> has an <attr> without a name`);
        else component.attrs.push(attrName);
        continue;
      }
      const parsed = parseNodeList(child, 'component', errors, registry);
      if (tag === 'var' && parsed[0]) {
        component.vars.push({
          name: parsed[0].id ?? '',
          type: parsed[0].varType ?? 'string',
          value: parsed[0].label ?? '',
        });
      } else if (tag === 'event' && parsed[0]) {
        component.events.push({ name: parsed[0].id ?? '', expression: parsed[0].label ?? '' });
      } else {
        component.children.push(...parsed);
      }
    }
  }
  return registry;
}

function collectButtons(node: MenuNode | null, out: MenuButtonSpec[] = []): MenuButtonSpec[] {
  if (!node) return out;
  if (node.type === 'button' && node.id) {
    out.push({ id: node.id, label: node.label || node.id, disabled: node.disabled ?? false });
  }
  node.children.forEach((child) => collectButtons(child, out));
  return out;
}

function collectBackground(node: MenuNode | null): 'panorama' | 'game' | null {
  const child = node?.children.find((candidate) => candidate.type === 'panorama' || candidate.type === 'game');
  return child?.type === 'panorama' || child?.type === 'game' ? child.type : null;
}

function describeNode(node: MenuNode): string {
  const id = node.id ? `#${node.id}` : '';
  const comp = node.componentId ? `@${node.componentId}` : '';
  const visible = node.visible ? `?${node.visible}` : '';
  const binding = node.listSource ? `{${node.listSource}:${node.itemComponent ?? ''}}` : '';
  const click = node.clickEvent ? `~${node.clickEvent}` : '';
  const flags = node.disabled ? '!' : '';
  const align = node.alignItems ? `:${node.alignItems.horizontal}-${node.alignItems.vertical}` : '';
  const gap = node.gap !== undefined ? `+${node.gap}` : '';
  const padding = node.paddingTop !== undefined ? `^${node.paddingTop}` : '';
  const label = node.label && (node.type === 'text' || node.type === 'text-field') ? `[${node.label}]` : '';
  const children = node.children.length ? `(${node.children.map(describeNode).join(',')})` : '';
  return `${node.type}${align}${gap}${padding}${id}${comp}${binding}${click}${visible}${flags}${label}${children}`;
}

export function describeMenuLayout(layout: MenuLayout): string {
  return layout.screen ? describeNode(layout.screen) : 'none';
}

function fallbackLayoutWith(fallback: MenuLayout, errors: string[], source: string | null): MenuLayout {
  return { ...fallback, errors, source };
}

export function parseMenuLayout(
  raw: string | null | undefined,
  source: string | null = null,
  fallback: MenuLayout = fallbackMainMenuLayout([], source),
): MenuLayout {
  const errors: string[] = [];
  if (!raw || typeof DOMParser === 'undefined') {
    return fallbackLayoutWith(fallback, ['No XML parser available'], source);
  }

  const doc = new DOMParser().parseFromString(normalizeXml(raw), 'application/xml');
  if (doc.querySelector('parsererror')) {
    return fallbackLayoutWith(fallback, ['Malformed XML'], source);
  }

  const root = doc.documentElement;
  if (normalizeTag(root.localName || root.tagName) !== 'screen') {
    return fallbackLayoutWith(fallback, [`<${root.localName || root.tagName}> must be <screen>`], source);
  }

  const registry = buildComponentRegistry(collectRawComponents(root, errors), errors);
  const screen: MenuNode = { type: 'screen', children: [] };
  for (const child of Array.from(root.children)) {
    if (normalizeTag(child.localName || child.tagName) === 'components') continue;
    screen.children.push(...parseNodeList(child, 'screen', errors, registry));
  }
  if (screen.children.length === 0) {
    return fallbackLayoutWith(fallback, [...errors, '<screen> needs <panorama> or <game>'], source);
  }
  if (screen.children.length > 1) {
    errors.push('<screen> should contain a single background');
  }

  return {
    screen,
    source,
    errors,
    buttons: collectButtons(screen),
    background: collectBackground(screen),
    components: Array.from(registry.values()),
  };
}

const mainMenuAsset = loadScreenAsset(['main_menu', 'main_meni']);
const worldListAsset = loadScreenAsset(['world_list']);

/** Parsed once at startup so screens can render from the XML assets. */
export const MAIN_MENU_LAYOUT: MenuLayout = parseMenuLayout(
  mainMenuAsset.raw,
  mainMenuAsset.source,
  fallbackMainMenuLayout([], mainMenuAsset.source),
);

export const WORLD_LIST_LAYOUT: MenuLayout = parseMenuLayout(
  worldListAsset.raw,
  worldListAsset.source,
  fallbackWorldListLayout([], worldListAsset.source),
);
