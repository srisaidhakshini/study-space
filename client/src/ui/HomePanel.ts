import {
  HOME_TIERS,
  SURFACES,
  VISIBILITIES,
  furnitureImageKey,
  getFurniture,
  getTier,
  surfaceImageKey,
  type FurnitureCategory,
  type SurfaceItem,
  type SurfaceKind,
  type Visibility,
} from '@study/shared';
import { app } from '../app';
import { bus } from '../bus';
import { button, h, setChildren, type Child } from './dom';
import {
  affordability,
  canTurn,
  groupByCategory,
  nextRotation,
  nextTier,
  ownedCards,
  ownedSurfaceIds,
  rotateInPlace,
  shopEntries,
  type OwnedCard,
  type ShopEntry,
} from './homeLogic';
import { homeFailureText, visibilityHint, visibilityLabel } from './homeText';
import { coinIcon, lockIcon, openDoorIcon } from './pixelIcon';

type Tab = 'furniture' | 'shop' | 'room';

const PREVIEW_BOX = 56;
const MAX_QTY = 9;

// ---- Small drawing helpers -------------------------------------------------------

function sourceSize(src: CanvasImageSource): { w: number; h: number } {
  const s = src as { naturalWidth?: number; width?: number; height?: number; naturalHeight?: number };
  return { w: s.naturalWidth || s.width || 0, h: s.naturalHeight || s.height || 0 };
}

/** A picture of a catalog item from the manifest, scaled to fit a box with hard pixels. */
function itemPreview(key: string, label: string): HTMLCanvasElement {
  const canvas = h('canvas', { class: 'home-preview', attrs: { width: PREVIEW_BOX, height: PREVIEW_BOX, 'aria-hidden': 'true' } });
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  const src = app.images(key);
  const size = src ? sourceSize(src) : { w: 0, h: 0 };
  if (src && size.w > 0 && size.h > 0) {
    const fit = Math.min(PREVIEW_BOX / size.w, PREVIEW_BOX / size.h);
    const scale = fit >= 1 ? Math.floor(fit) : fit;
    const w = Math.round(size.w * scale);
    const hgt = Math.round(size.h * scale);
    ctx.drawImage(src, Math.floor((PREVIEW_BOX - w) / 2), Math.floor((PREVIEW_BOX - hgt) / 2), w, hgt);
  } else {
    // The art may not be loaded (or drawn yet): show a labelled placeholder.
    ctx.fillStyle = '#e3c28f';
    ctx.fillRect(6, 6, PREVIEW_BOX - 12, PREVIEW_BOX - 12);
    ctx.fillStyle = '#4a2f3a';
    ctx.font = '600 22px StudyUI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.slice(0, 1).toUpperCase(), PREVIEW_BOX / 2, PREVIEW_BOX / 2 + 1);
  }
  return canvas;
}

/** A wallpaper or floor sample: its tile repeated across the box, or its colour. */
function surfacePreview(surface: SurfaceItem): HTMLCanvasElement {
  const canvas = h('canvas', { class: 'home-preview home-surface-preview', attrs: { width: PREVIEW_BOX, height: PREVIEW_BOX, 'aria-hidden': 'true' } });
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  const src = app.images(surfaceImageKey(surface.id));
  if (src) {
    const tile = 16 * 2;
    for (let y = 0; y < PREVIEW_BOX; y += tile) for (let x = 0; x < PREVIEW_BOX; x += tile) ctx.drawImage(src, x, y, tile, tile);
  } else {
    ctx.fillStyle = surface.color;
    ctx.fillRect(0, 0, PREVIEW_BOX, PREVIEW_BOX);
  }
  return canvas;
}

function priceLine(price: number): HTMLElement {
  return h('span', { class: 'home-price' }, coinIcon(2), h('span', {}, String(price)));
}

function visibilityIcon(visibility: Visibility): HTMLCanvasElement {
  return visibility === 'open' ? openDoorIcon(2) : lockIcon(2);
}

const WALLPAPERS = SURFACES.filter((s) => s.kind === 'wallpaper');
const FLOORS = SURFACES.filter((s) => s.kind === 'floor');

/**
 * The edit-mode panel: a docked side panel on desktop and a bottom sheet on
 * phones. It shows only while `app.homes.editing`. Tabs: Furniture (what you
 * own), Shop (buy with focus coins) and Room (surfaces, size, who can visit).
 * The pointer work in the room itself belongs to the game scene; this panel
 * sets the tool (what you are placing or have selected) and sends edits.
 */
export function createHomePanel(): HTMLElement {
  let tab: Tab = 'furniture';
  let filter: FurnitureCategory | 'all' = 'all';
  let collapsed = false;
  const quantities = new Map<string, number>();

  // ---- Frame ---------------------------------------------------------------------
  const handle = h('button', { class: 'home-handle', attrs: { type: 'button', 'aria-label': 'Collapse or expand the edit panel', 'aria-expanded': 'true' } }, h('span', { class: 'home-handle-bar' }));
  const coinsChip = h('span', { class: 'home-coins', attrs: { title: 'Your focus coins' } });
  const doneButton = button('Done', 'btn btn-small btn-primary', () => app.homes.setEditing(false), { title: 'Stop editing (Esc)', 'aria-label': 'Done editing' });
  const header = h('div', { class: 'home-header' }, h('h2', { class: 'home-title' }, 'Edit home'), coinsChip, doneButton);
  const tabs = h('div', { class: 'home-tabs', attrs: { role: 'tablist', 'aria-label': 'Edit home sections' } });
  const body = h('div', { class: 'home-body' });
  const hint = h('p', { class: 'home-hint' }, 'Pick an item, then tap a spot in the room. Tap furniture to move it.');
  const selection = h('div', { class: 'home-selection', attrs: { role: 'group', 'aria-label': 'Selected item' } });
  const root = h(
    'aside',
    { class: 'home-panel', attrs: { 'aria-label': 'Edit home' } },
    handle,
    header,
    tabs,
    body,
    selection,
    hint,
  );
  root.hidden = true;

  // ---- Actions ---------------------------------------------------------------------
  const toast = (text: string): void => bus.emit('toast', { text });

  const rotateSelected = (): void => {
    const homes = app.homes;
    const info = homes.info;
    const tool = homes.tool;
    if (!info) return;
    if (tool?.kind === 'place') {
      const item = getFurniture(tool.itemId);
      if (item && canTurn(item)) homes.setTool({ kind: 'place', itemId: tool.itemId, rotation: nextRotation(item, tool.rotation) });
      return;
    }
    if (tool?.kind !== 'select') return;
    const result = rotateInPlace(info, tool.index);
    if (!result) return;
    if (!result.ok) {
      toast(homeFailureText(result.error ?? 'bad-rotation'));
      return;
    }
    homes.edit({ op: 'move', index: tool.index, x: result.placed.x, y: result.placed.y, rotation: result.placed.rotation });
  };

  const removeSelected = (): void => {
    const tool = app.homes.tool;
    if (tool?.kind !== 'select') return;
    if (app.homes.edit({ op: 'remove', index: tool.index })) app.homes.setTool(null);
  };

  // ---- Tabs ------------------------------------------------------------------------
  const renderTabs = (): void => {
    const make = (id: Tab, label: string): HTMLButtonElement =>
      button(label, `btn btn-small tab${tab === id ? ' active' : ''}`, () => {
        tab = id;
        render();
      }, { role: 'tab', 'aria-selected': String(tab === id), id: `home-tab-${id}` });
    setChildren(tabs, make('furniture', 'Furniture'), make('shop', 'Shop'), make('room', 'Room'));
  };

  // ---- Furniture tab -------------------------------------------------------------------
  const cardButton = (card: OwnedCard): HTMLButtonElement => {
    const tool = app.homes.tool;
    const active = tool?.kind === 'place' && tool.itemId === card.item.id;
    const empty = card.free <= 0;
    const label = `${card.item.name}, ${card.placed} placed of ${card.owned} owned`;
    return button(
      h(
        'span',
        { class: 'home-card-inner' },
        itemPreview(furnitureImageKey(card.item.id, 0), card.item.name),
        h('span', { class: 'home-card-name' }, card.item.name),
        h('span', { class: 'home-card-count' }, empty ? 'All placed' : `${card.placed} placed / ${card.owned} owned`),
      ),
      `home-card${active ? ' active' : ''}${empty ? ' empty' : ''}`,
      () => app.homes.setTool(active ? null : { kind: 'place', itemId: card.item.id, rotation: 0 }),
      {
        'aria-pressed': String(active),
        'aria-label': label,
        title: empty ? 'Every copy is in the room. Buy more in the Shop.' : `Place a ${card.item.name}`,
        disabled: empty,
      },
    );
  };

  const renderFurniture = (): Child[] => {
    const info = app.homes.info;
    const cards = ownedCards(app.homes.inventory, info?.items ?? []);
    if (cards.length === 0) return [h('p', { class: 'hint' }, 'You have no furniture yet. Visit the Shop tab.')];
    const groups = groupByCategory(cards, (c) => c.item.category);
    if (filter !== 'all' && !groups.some((g) => g.category === filter)) filter = 'all';
    const chip = (id: FurnitureCategory | 'all', label: string): HTMLButtonElement =>
      button(label, `btn btn-small${filter === id ? ' active' : ''}`, () => {
        filter = id;
        render();
      }, { 'aria-pressed': String(filter === id) });
    const chips = h('div', { class: 'home-chips', attrs: { role: 'group', 'aria-label': 'Filter by category' } }, chip('all', 'All'), ...groups.map((g) => chip(g.category, g.label)));
    const shown = filter === 'all' ? groups : groups.filter((g) => g.category === filter);
    return [
      chips,
      ...shown.map((g) =>
        h('section', { class: 'home-group', attrs: { 'aria-label': g.label } }, h('h3', { class: 'home-group-title' }, g.label), h('div', { class: 'home-grid' }, ...g.entries.map(cardButton))),
      ),
    ];
  };

  // ---- Shop tab ----------------------------------------------------------------------------
  const quantityOf = (id: string): number => quantities.get(id) ?? 1;

  const shopRow = (entry: ShopEntry, coins: number): HTMLElement => {
    const qty = entry.kind === 'furniture' ? quantityOf(entry.id) : 1;
    const cost = affordability(coins, entry.price, qty);
    const preview = entry.furniture ? itemPreview(furnitureImageKey(entry.id, 0), entry.name) : surfacePreview(entry.surface!);
    const stepper =
      entry.kind === 'furniture'
        ? h(
            'span',
            { class: 'home-stepper', attrs: { role: 'group', 'aria-label': `Quantity of ${entry.name}` } },
            button('−', 'btn btn-small btn-icon', () => {
              quantities.set(entry.id, Math.max(1, qty - 1));
              render();
            }, { 'aria-label': 'Fewer', disabled: qty <= 1 }),
            h('span', { class: 'home-qty', attrs: { 'aria-live': 'polite' } }, String(qty)),
            button('+', 'btn btn-small btn-icon', () => {
              quantities.set(entry.id, Math.min(MAX_QTY, qty + 1));
              render();
            }, { 'aria-label': 'More', disabled: qty >= MAX_QTY }),
          )
        : null;
    const buy = button(qty > 1 ? `Buy ×${qty}` : 'Buy', 'btn btn-small btn-primary', () => app.homes.buy(entry.id, qty), {
      disabled: !cost.canBuy,
      'aria-label': `Buy ${qty > 1 ? `${qty} ` : ''}${entry.name} for ${cost.total} coins`,
    });
    return h(
      'li',
      { class: 'home-shop-row' },
      preview,
      h(
        'span',
        { class: 'home-shop-info' },
        h('span', { class: 'home-card-name' }, entry.name),
        entry.furniture ? h('span', { class: 'hint home-blurb' }, entry.furniture.blurb) : h('span', { class: 'hint home-blurb' }, entry.surface?.kind === 'floor' ? 'Floor' : 'Wallpaper'),
        h('span', { class: 'home-shop-meta' }, priceLine(entry.price), entry.kind === 'furniture' ? h('span', { class: 'hint' }, `Owned: ${entry.owned}`) : null),
      ),
      h('span', { class: 'home-shop-buy' }, stepper, buy, cost.canBuy ? null : h('span', { class: 'home-need' }, `Need ${cost.missing} more`)),
    );
  };

  const renderShop = (): Child[] => {
    const inventory = app.homes.inventory;
    const coins = inventory?.coins ?? app.account.coins;
    const entries = shopEntries(inventory);
    const furniture = entries.filter((e) => e.kind === 'furniture');
    const surfaces = entries.filter((e) => e.kind === 'surface');
    const sections: Child[] = groupByCategory(furniture, (e) => e.furniture!.category).map((g) =>
      h('section', { class: 'home-group', attrs: { 'aria-label': g.label } }, h('h3', { class: 'home-group-title' }, g.label), h('ul', { class: 'home-shop-list' }, ...g.entries.map((e) => shopRow(e, coins)))),
    );
    for (const [kind, title] of [['wallpaper', 'Wallpapers'], ['floor', 'Floors']] as [SurfaceKind, string][]) {
      const rows = surfaces.filter((e) => e.surface?.kind === kind);
      if (rows.length > 0) {
        sections.push(h('section', { class: 'home-group', attrs: { 'aria-label': title } }, h('h3', { class: 'home-group-title' }, title), h('ul', { class: 'home-shop-list' }, ...rows.map((e) => shopRow(e, coins)))));
      }
    }
    if (sections.length === 0) sections.push(h('p', { class: 'hint' }, 'You own everything. Wow!'));
    return sections;
  };

  // ---- Room tab ------------------------------------------------------------------------------
  const surfaceRow = (title: string, list: SurfaceItem[], current: string, kind: SurfaceKind, coins: number, mine: Set<string>): HTMLElement =>
    h(
      'section',
      { class: 'home-group', attrs: { 'aria-label': title } },
      h('h3', { class: 'home-group-title' }, title),
      h(
        'div',
        { class: 'home-surfaces' },
        ...list.map((s) => {
          const owned = mine.has(s.id);
          const selected = current === s.id;
          const cost = affordability(coins, s.price, 1);
          const pick = button(
            h('span', { class: 'home-card-inner' }, surfacePreview(s), h('span', { class: 'home-card-name' }, s.name), h('span', { class: 'home-card-count' }, owned ? (selected ? 'In use' : 'Owned') : `${s.price} coins`)),
            `home-card${selected ? ' active' : ''}${owned ? '' : ' empty'}`,
            () => app.homes.edit({ op: 'surface', kind, id: s.id }),
            { 'aria-pressed': String(selected), 'aria-label': `${s.name}${selected ? ', in use' : owned ? '' : `, ${s.price} coins`}`, disabled: !owned },
          );
          const buy = owned
            ? null
            : button('Buy', 'btn btn-small btn-primary', () => app.homes.buy(s.id, 1), {
                disabled: !cost.canBuy,
                'aria-label': `Buy ${s.name} for ${s.price} coins`,
                title: cost.canBuy ? `Buy for ${s.price} coins` : `Need ${cost.missing} more coins`,
              });
          return h('div', { class: 'home-surface' }, pick, buy);
        }),
      ),
    );

  const renderRoom = (): Child[] => {
    const info = app.homes.info;
    if (!info) return [];
    const inventory = app.homes.inventory;
    const coins = inventory?.coins ?? app.account.coins;
    const mine = ownedSurfaceIds(inventory);
    const tier = getTier(info.tier);
    const next = nextTier(info.tier);
    const upgrade = next ? affordability(coins, next.price, 1) : null;

    const sizeSection = h(
      'section',
      { class: 'home-group', attrs: { 'aria-label': 'Room size' } },
      h('h3', { class: 'home-group-title' }, 'Room size'),
      h('p', { class: 'home-size' }, h('strong', {}, tier.name), ` · floor ${tier.floorW} × ${tier.floorH}`),
      next && upgrade
        ? h(
            'div',
            { class: 'home-upgrade' },
            button(h('span', { class: 'home-upgrade-label' }, `Upgrade to ${next.name}`, h('small', {}, ` floor ${next.floorW} × ${next.floorH} · `), priceLine(next.price)), 'btn btn-primary home-upgrade-button', () => app.homes.edit({ op: 'upgrade' }), {
              disabled: !upgrade.canBuy,
              'aria-label': `Upgrade to ${next.name} for ${next.price} coins`,
            }),
            upgrade.canBuy ? null : h('span', { class: 'home-need' }, `Need ${upgrade.missing} more`),
          )
        : h('p', { class: 'hint' }, HOME_TIERS.length > 1 ? 'Your home is the biggest size.' : ''),
    );

    const visibilitySection = h(
      'section',
      { class: 'home-group', attrs: { 'aria-label': 'Who can visit' } },
      h('h3', { class: 'home-group-title' }, 'Who can visit'),
      h(
        'div',
        { class: 'home-segments', attrs: { role: 'group', 'aria-label': 'Who can visit your home' } },
        ...VISIBILITIES.map((v) =>
          button(h('span', { class: 'home-segment-inner' }, visibilityIcon(v), visibilityLabel(v)), `btn btn-small${info.visibility === v ? ' active' : ''}`, () => {
            if (info.visibility !== v) app.homes.edit({ op: 'visibility', visibility: v });
          }, { 'aria-pressed': String(info.visibility === v), title: visibilityHint(v) }),
        ),
      ),
      h('p', { class: 'hint' }, visibilityHint(info.visibility)),
    );

    return [
      surfaceRow('Wallpaper', WALLPAPERS, info.wallpaper, 'wallpaper', coins, mine),
      surfaceRow('Floor', FLOORS, info.floor, 'floor', coins, mine),
      sizeSection,
      visibilitySection,
    ];
  };

  // ---- Selection bar ----------------------------------------------------------------------------
  const renderSelection = (): void => {
    const homes = app.homes;
    const tool = homes.tool;
    selection.hidden = tool === null;
    if (!tool) return;
    if (tool.kind === 'place') {
      const item = getFurniture(tool.itemId);
      if (!item) return;
      setChildren(
        selection,
        h('span', { class: 'home-selection-name' }, `Placing: ${item.name}`),
        h(
          'span',
          { class: 'home-selection-buttons' },
          canTurn(item) ? button('Rotate', 'btn btn-small', rotateSelected, { title: 'Turn it a quarter (R)', 'aria-label': 'Rotate' }) : null,
          button('Cancel', 'btn btn-small', () => homes.setTool(null), { title: 'Cancel (Esc)', 'aria-label': 'Cancel placing' }),
        ),
      );
      return;
    }
    const placed = homes.info?.items[tool.index];
    const item = placed ? getFurniture(placed.itemId) : undefined;
    if (!placed || !item) {
      selection.hidden = true;
      return;
    }
    setChildren(
      selection,
      h('span', { class: 'home-selection-name' }, `${item.name} selected`),
      h(
        'span',
        { class: 'home-selection-buttons' },
        canTurn(item) ? button('Rotate', 'btn btn-small', rotateSelected, { title: 'Turn it a quarter (R)', 'aria-label': 'Rotate' }) : null,
        button('Remove', 'btn btn-small', removeSelected, { title: 'Put it back in storage (Delete)', 'aria-label': 'Remove from the room' }),
        button('Done', 'btn btn-small btn-primary', () => homes.setTool(null), { title: 'Deselect (Esc)', 'aria-label': 'Done with this item' }),
      ),
    );
  };

  // ---- Render ------------------------------------------------------------------------------------
  const render = (): void => {
    const homes = app.homes;
    const editing = homes.editing && homes.info?.mine === true;
    root.hidden = !editing;
    document.body.classList.toggle('home-editing', editing);
    if (!editing) return;

    const coins = homes.inventory?.coins ?? app.account.coins;
    setChildren(coinsChip, coinIcon(2), h('span', {}, String(coins)));
    renderTabs();

    const scroll = body.scrollTop;
    body.setAttribute('role', 'tabpanel');
    body.setAttribute('aria-labelledby', `home-tab-${tab}`);
    setChildren(body, ...(tab === 'furniture' ? renderFurniture() : tab === 'shop' ? renderShop() : renderRoom()));
    body.scrollTop = scroll;
    renderSelection();
  };

  // ---- Bottom sheet handle (phones): tap to toggle, drag down/up to collapse/expand --------------------
  let dragFrom: number | null = null;
  let dragged = false;
  const setCollapsed = (value: boolean): void => {
    collapsed = value;
    root.classList.toggle('collapsed', collapsed);
    handle.setAttribute('aria-expanded', String(!collapsed));
  };
  handle.addEventListener('pointerdown', (event) => {
    dragFrom = event.clientY;
    dragged = false;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointerup', (event) => {
    if (dragFrom === null) return;
    const dy = event.clientY - dragFrom;
    dragFrom = null;
    if (Math.abs(dy) >= 12) {
      dragged = true;
      setCollapsed(dy > 0);
    }
  });
  handle.addEventListener('click', () => {
    if (dragged) {
      dragged = false;
      return;
    }
    setCollapsed(!collapsed);
  });

  app.homes.changed.subscribe(render);
  app.account.changed.subscribe(() => app.homes.editing && render());
  render();
  return root;
}
