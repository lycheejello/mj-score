// ── App State ─────────────────────────────────────────────────────────────────

const state = {
  // Tiles live directly in meld slots
  melds: [
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'pair',     concealed: true }  // index 5 = pair slot
  ],

  selectedPaletteTile: null,  // tile id currently selected from palette
  winningTile: null,          // 'meldIndex-tileIndex' of the winning tile
  selectedFlowers: new Set(), // flower tile ids currently toggled on
  wildTileId: null,           // which tile is the wildcard this game
  wildcardSubs: {},           // 'meldIndex-tileIndex' → substitute tile id

  conditions: {
    dealer: false,
    dealerStreak: 0,
    wonFrom: null,   // 'self' | 'z1' | 'z2' | 'z3' | 'z4'  (drives menQing + allFrontType)
    winType: 'normal',
    instantWin: 'none',
    wildcards: 0,
    moBao: false,
    baoGuiWei: false,
    flowerCount: 0,
    flowerSpecial: 'none',
    niGu: false
  },

  rules: []
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Count how many of each tile id are currently placed in melds
function getUsedCounts() {
  const counts = {};
  for (const meld of state.melds) {
    for (const id of meld.tiles) {
      counts[id] = (counts[id] || 0) + 1;
    }
  }
  return counts;
}

function getTotalTilesPlaced() {
  // The 4th tile of a kang is an extra draw — doesn't count toward 17
  return state.melds.reduce((sum, m, i) => {
    const count = (i < 5) ? Math.min(m.tiles.length, 3) : m.tiles.length;
    return sum + count;
  }, 0);
}

// Resolve wildcard tiles to their substitutes before validation:
//   z7 (白) always → wild tile
//   wild tile     → sub if set, otherwise itself (stands for itself)
function resolveWilds(tiles, meldIndex) {
  return tiles.map((id, ti) => {
    if (id === 'z7' && state.wildTileId) return state.wildTileId;
    if (state.wildTileId && id === state.wildTileId) {
      return state.wildcardSubs[`${meldIndex}-${ti}`] || id;
    }
    return id;
  });
}

// Clear all wildcard subs for a meld (called when a tile is removed)
function clearMeldWildSubs(meldIndex) {
  const prefix = `${meldIndex}-`;
  for (const k of Object.keys(state.wildcardSubs)) {
    if (k.startsWith(prefix)) delete state.wildcardSubs[k];
  }
}

// Count wildcard tiles (z7 + wild tile) and sync to conditions panel
function updateWildcardCount() {
  const count = state.wildTileId
    ? state.melds.reduce((n, m) => n + m.tiles.filter(id => id === state.wildTileId).length, 0)
    : 0;
  state.conditions.wildcards = count;
  document.getElementById('cond-wildcards').value = count;
  document.getElementById('mo-bao-row').style.display     = count > 0 ? '' : 'none';
  document.getElementById('bao-gui-wei-row').style.display = count > 0 ? '' : 'none';
}

// ── Wildcard Picker ───────────────────────────────────────────────────────────

let _wildPickerKey = null;

// Open picker to set the game-level wild tile
function openWildTilePicker() {
  _wildPickerKey = null;
  const grid = document.getElementById('wild-picker-grid');
  document.getElementById('wild-picker-title').textContent = 'Which tile is wild this game?';
  grid.innerHTML = '';
  for (const tile of ALL_REGULAR_TILES) {
    const btn = document.createElement('button');
    btn.className = `tile-btn suit-${tile.suit}${state.wildTileId === tile.id ? ' selected-palette' : ''}`;
    btn.innerHTML = `<span class="tile-face">${tile.face}</span>`;
    btn.addEventListener('click', () => {
      setWildTile(tile.id);
      closeWildPicker();
    });
    grid.appendChild(btn);
  }
  document.getElementById('wild-picker').style.display = '';
}

// Open picker to set what a specific wildcard substitutes for
function openWildPicker(key) {
  _wildPickerKey = key;
  const current = state.wildcardSubs[key];
  document.getElementById('wild-picker-title').textContent = '寶 stands for…';
  const grid = document.getElementById('wild-picker-grid');
  grid.innerHTML = '';
  for (const tile of ALL_REGULAR_TILES) {
    if (tile.id === 'z7') continue;  // z7 always = wild tile, not a valid sub
    const btn = document.createElement('button');
    btn.className = `tile-btn suit-${tile.suit}${current === tile.id ? ' selected-palette' : ''}`;
    btn.innerHTML = `<span class="tile-face">${tile.face}</span>`;
    btn.addEventListener('click', () => {
      setWildSub(_wildPickerKey, tile.id);
      closeWildPicker();
    });
    grid.appendChild(btn);
  }
  document.getElementById('wild-picker').style.display = '';
}

function closeWildPicker() {
  document.getElementById('wild-picker').style.display = 'none';
  _wildPickerKey = null;
}

function setWildTile(tileId) {
  state.wildTileId = (state.wildTileId === tileId) ? null : tileId;
  state.wildcardSubs = {};  // reset subs when wild tile changes
  renderWildTileBtn();
  for (let i = 0; i < 6; i++) { updateMeldType(i); renderMeldSlot(i); }
  updateWildcardCount();
}

function setWildSub(key, subId) {
  state.wildcardSubs[key] = subId;
  const mi = Number(key.split('-')[0]);
  updateMeldType(mi);
  renderMeldSlot(mi);
}

function renderWildTileBtn() {
  const btn = document.getElementById('wild-tile-btn');
  if (!btn) return;
  if (state.wildTileId) {
    const tile = TILE_BY_ID[state.wildTileId];
    btn.innerHTML = `<span class="tile-face" style="font-size:1.1rem">${tile.face}</span> <span style="font-size:0.75rem">${tile.label}</span>`;
    btn.classList.add('active');
  } else {
    btn.textContent = '—';
    btn.classList.remove('active');
  }
}

// Infer meld type from the tiles placed in a slot.
// Returns 'sequence' | 'pung' | 'kang' | null (invalid/incomplete)
function detectMeldType(tiles) {
  if (tiles.length < 3) return null;
  const [a, b, c] = tiles;
  if (tiles.length === 4) return (a === b && b === c && c === tiles[3]) ? 'kang' : null;
  if (a === b && b === c) return 'pung';
  const suits = tiles.map(id => TILE_BY_ID[id]?.suit);
  const vals  = tiles.map(id => TILE_BY_ID[id]?.value).sort((x, y) => x - y);
  if (suits.every(s => s === suits[0] && s !== 'z') &&
      vals[1] === vals[0] + 1 && vals[2] === vals[1] + 1) return 'sequence';
  return null;
}

// After tiles change, update state.melds[i].type and the badge label
function updateMeldType(meldIndex) {
  if (meldIndex === 5) { state.melds[5].type = 'pair'; return; }
  const meld = state.melds[meldIndex];
  const detected = detectMeldType(resolveWilds(meld.tiles, meldIndex));
  meld.type = detected || 'sequence';

  const badge = document.querySelector(`.meld-type-badge[data-meld="${meldIndex}"]`);
  if (!badge) return;
  const labels = { sequence: '順', pung: '刻', kang: '槓' };
  badge.textContent = meld.tiles.length >= 3 ? (labels[detected] || '?') : '';
  badge.dataset.valid = (detected !== null || meld.tiles.length < 3) ? '1' : '0';
}

function maxForSlot(meldIndex) {
  if (meldIndex === 5) return 2;
  // A 3-tile pung can grow to a 4-tile kang; sequences cap at 3
  const tiles = state.melds[meldIndex].tiles;
  if (tiles.length === 3) {
    const [a, b, c] = tiles;
    return (a === b && b === c) ? 4 : 3;
  }
  return 4;
}

function isSlotFull(meldIndex) {
  return state.melds[meldIndex].tiles.length >= maxForSlot(meldIndex);
}

function allSlotsFull() {
  return state.melds.every((_, i) => isSlotFull(i));
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('./data/scoring.csv');
    state.rules = parseCSV(await res.text());
  } catch (e) {
    console.warn('Could not load scoring.csv', e);
  }
  buildPalette();
  buildMeldSlots();
  bindEvents();
}

// ── Screen Navigation ─────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

// ── Palette ───────────────────────────────────────────────────────────────────

function buildPalette() {
  renderPaletteGroup('palette-bamboo', BAMBOO_TILES);
  renderPaletteGroup('palette-man',    MAN_TILES);
  renderPaletteGroup('palette-pin',    PIN_TILES);
  renderPaletteGroup('palette-honor',  HONOR_TILES);
  renderFlowerPalette();
}

function renderPaletteGroup(containerId, tiles) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  for (const tile of tiles) {
    el.appendChild(makePaletteBtn(tile));
  }
}

function makePaletteBtn(tile) {
  const btn = document.createElement('button');
  btn.className = `tile-btn suit-${tile.suit}`;
  btn.dataset.id = tile.id;
  btn.innerHTML = `
    <span class="tile-face">${tile.face}</span>
    <span class="tile-count-badge" id="badge-${tile.id}"></span>
  `;
  btn.addEventListener('click', () => onPaletteTileClick(tile));
  return btn;
}

function renderFlowerPalette() {
  const el = document.getElementById('palette-flower');
  el.innerHTML = '';
  for (const tile of FLOWER_TILES) {
    const btn = document.createElement('button');
    btn.className = `tile-btn suit-${tile.suit}`;
    btn.dataset.id = tile.id;
    btn.innerHTML = `<span class="tile-face">${tile.face}</span>`;
    btn.addEventListener('click', () => onFlowerClick(tile.id, btn));
    el.appendChild(btn);
  }
}

function onFlowerClick(id, btn) {
  if (state.selectedFlowers.has(id)) {
    state.selectedFlowers.delete(id);
    btn.classList.remove('selected-palette');
  } else {
    state.selectedFlowers.add(id);
    btn.classList.add('selected-palette');
  }
  const n = state.selectedFlowers.size;
  state.conditions.flowerCount = n;
  document.getElementById('cond-flowers').value = n;
  updateFlowerBadge();
  document.getElementById('flower-special-row').style.display = n >= 6 ? '' : 'none';
}

function updateFlowerBadge() {
  const badge = document.getElementById('flower-count-badge');
  const n = state.selectedFlowers.size;
  if (n > 0) {
    badge.textContent = `${n} 花`;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

function onPaletteTileClick(tile) {
  const used = getUsedCounts();
  const remaining = 4 - (used[tile.id] || 0);
  if (remaining <= 0) return;

  // Toggle selection
  if (state.selectedPaletteTile === tile.id) {
    state.selectedPaletteTile = null;
  } else {
    state.selectedPaletteTile = tile.id;
  }
  updatePaletteUI();
  updateSelectionHint();
  updateMeldDropTargets();
}

function updatePaletteUI() {
  const used = getUsedCounts();
  const allTileIds = [...ALL_REGULAR_TILES].map(t => t.id);

  for (const id of allTileIds) {
    const btn = document.querySelector(`.tile-btn[data-id="${id}"]`);
    const badge = document.getElementById(`badge-${id}`);
    if (!btn) continue;

    const cnt = used[id] || 0;
    const remaining = 4 - cnt;
    btn.classList.toggle('depleted', remaining <= 0);
    btn.classList.toggle('selected-palette', state.selectedPaletteTile === id);
    if (badge) badge.textContent = cnt > 0 ? `×${remaining}` : '';
  }

  // Update progress pill
  const total = getTotalTilesPlaced();
  document.getElementById('progress-label').textContent = `${total} / 17`;
}

function updateSelectionHint() {
  const hint = document.getElementById('selection-hint');
  if (state.selectedPaletteTile) {
    const tile = TILE_BY_ID[state.selectedPaletteTile];
    hint.textContent = `${tile.face} ${tile.label} selected — tap a meld slot to place`;
    hint.classList.add('has-selection');
  } else {
    hint.textContent = 'Tap a tile above, then tap a meld slot below to place it';
    hint.classList.remove('has-selection');
  }
}

function updateMeldDropTargets() {
  for (let i = 0; i < 6; i++) {
    const slot = document.querySelector(`.meld-slot[data-meld-index="${i}"]`);
    if (!slot) continue;
    const canDrop = state.selectedPaletteTile && !isSlotFull(i);
    slot.classList.toggle('drop-ready', canDrop);
    slot.classList.toggle('slot-full', isSlotFull(i) && !state.selectedPaletteTile);
  }
}

// ── Meld Slots ────────────────────────────────────────────────────────────────

function buildMeldSlots() {
  const grid = document.getElementById('melds-grid');
  grid.innerHTML = '';

  for (let i = 0; i < 6; i++) {
    const isPair = i === 5;
    const slot = document.createElement('div');
    slot.className = `meld-slot${isPair ? ' pair-slot' : ''}`;
    slot.dataset.meldIndex = i;

    slot.innerHTML = `
      <div class="meld-header">
        <span class="meld-title">${isPair ? 'Pair 對' : `Meld ${i + 1}`}</span>
        <div class="meld-controls">
          ${isPair ? '' : `<span class="meld-type-badge" data-meld="${i}"></span>`}
          <button class="concealed-toggle is-concealed" data-meld="${i}">🙈</button>
        </div>
      </div>
      <div class="meld-tiles" data-meld="${i}">
        <span class="meld-empty-hint">${isPair ? 'tap 2 tiles' : 'tap tiles to place'}</span>
      </div>
    `;

    // Click the slot body to place a tile
    slot.addEventListener('click', (e) => {
      // Don't trigger if clicking controls
      if (e.target.closest('.meld-controls')) return;
      onMeldSlotClick(i);
    });

    slot.querySelector('.concealed-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      state.melds[i].concealed = !state.melds[i].concealed;
      e.target.textContent = state.melds[i].concealed ? '🙈' : '👁';
      e.target.classList.toggle('is-concealed', state.melds[i].concealed);
    });

    grid.appendChild(slot);
  }
}

function onMeldSlotClick(meldIndex) {
  if (!state.selectedPaletteTile) return;
  if (isSlotFull(meldIndex)) return;

  state.melds[meldIndex].tiles.push(state.selectedPaletteTile);

  // Deselect only if all 4 copies of this tile are now placed
  const used = getUsedCounts();
  if ((used[state.selectedPaletteTile] || 0) >= 4) {
    state.selectedPaletteTile = null;
  }

  updateMeldType(meldIndex);
  renderMeldSlot(meldIndex);
  updatePaletteUI();
  updateSelectionHint();
  updateMeldDropTargets();
  updateWildcardCount();
}

function renderMeldSlot(meldIndex) {
  const meld = state.melds[meldIndex];
  const tilesEl = document.querySelector(`.meld-tiles[data-meld="${meldIndex}"]`);
  if (!tilesEl) return;
  tilesEl.innerHTML = '';

  if (meld.tiles.length === 0) {
    const hint = document.createElement('span');
    hint.className = 'meld-empty-hint';
    hint.textContent = meldIndex === 5 ? 'tap 2 tiles' : 'tap tiles to place';
    tilesEl.appendChild(hint);
    return;
  }

  for (let i = 0; i < meld.tiles.length; i++) {
    const tileId = meld.tiles[i];
    const key = `${meldIndex}-${i}`;
    const isWinning = state.winningTile === key;
    // z7 always auto-resolves to wild tile; wild tile can stand for itself or a sub
    const isZ7     = tileId === 'z7' && !!state.wildTileId;
    const isWildTile = !!state.wildTileId && tileId === state.wildTileId;
    const isWild   = isZ7 || isWildTile;

    let displayTile, wildSub = null;
    if (isZ7) {
      displayTile = TILE_BY_ID[state.wildTileId];
    } else if (isWildTile) {
      wildSub = state.wildcardSubs[key] || null;
      displayTile = wildSub ? TILE_BY_ID[wildSub] : TILE_BY_ID[tileId];
    } else {
      displayTile = TILE_BY_ID[tileId];
    }

    const chip = document.createElement('div');
    chip.className = `tile-chip suit-${displayTile.suit}${isWinning ? ' is-winning' : ''}${isWild ? ' is-wild' : ''}`;
    chip.innerHTML = `
      <span class="chip-face">${displayTile.face}</span>
      <span class="chip-label">${displayTile.label}</span>
      ${isWinning ? '<span class="win-star">★</span>' : ''}
      ${isZ7 ? '<span class="wild-badge">白</span>' : ''}
      ${isWildTile && wildSub ? '<span class="wild-badge">寶</span>' : ''}
    `;

    // Tap chip to mark/unmark as winning tile
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      state.winningTile = (state.winningTile === key) ? null : key;
      for (let mi = 0; mi < 6; mi++) renderMeldSlot(mi);
    });

    const rm = document.createElement('button');
    rm.className = 'chip-remove';
    rm.textContent = '×';
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.winningTile === key) state.winningTile = null;
      clearMeldWildSubs(meldIndex);
      meld.tiles.splice(i, 1);
      updateMeldType(meldIndex);
      renderMeldSlot(meldIndex);
      updatePaletteUI();
      updateMeldDropTargets();
      updateWildcardCount();
    });
    chip.appendChild(rm);
    tilesEl.appendChild(chip);
  }

  // Wild tile substitution buttons — rendered below chips, outside tap targets
  if (state.wildTileId) {
    const wildRow = document.createElement('div');
    wildRow.className = 'wild-sub-row';
    let hasWilds = false;
    for (let i = 0; i < meld.tiles.length; i++) {
      if (meld.tiles[i] !== state.wildTileId) continue;
      hasWilds = true;
      const key = `${meldIndex}-${i}`;
      const sub = state.wildcardSubs[key];
      const subTile = sub ? TILE_BY_ID[sub] : null;
      const btn = document.createElement('button');
      btn.className = `wild-sub-btn${sub ? ' has-sub' : ''}`;
      btn.textContent = subTile ? `寶→${subTile.label}` : '寶?';
      btn.addEventListener('click', (e) => { e.stopPropagation(); openWildPicker(key); });
      wildRow.appendChild(btn);
    }
    if (hasWilds) tilesEl.appendChild(wildRow);
  }
}

// ── Calculate & Results ───────────────────────────────────────────────────────

function calculateAndShow() {
  // Require winning tile
  if (!state.winningTile) {
    alert('Tap a tile in your hand to mark the winning tile (★).');
    return;
  }
  // Require won-from
  if (!state.conditions.wonFrom) {
    document.querySelector('.won-from-bar').classList.add('missing');
    document.querySelector('.won-from-bar').scrollIntoView({ behavior: 'smooth', block: 'center' });
    alert('Select where the winning tile came from.');
    return;
  }

  // Validate pair slot has 2 tiles
  if (state.melds[5].tiles.length !== 2) {
    alert('The pair slot needs exactly 2 tiles.');
    return;
  }
  // 十三幺 hands don't follow normal meld structure — skip meld validation if detected
  const isShiSanYao = (() => {
    const orphans = ['b1','b9','m1','m9','p1','p9','z1','z2','z3','z4','z5','z6','z7'];
    const allIds = state.melds.flatMap(m => m.tiles);
    return new Set(allIds.filter(id => orphans.includes(id))).size === 13;
  })();

  if (!isShiSanYao) {
    for (let i = 0; i < 5; i++) {
      const m = state.melds[i];
      if (m.tiles.length === 0) continue;
      if (detectMeldType(resolveWilds(m.tiles, i)) === null) {
        alert(`Meld ${i + 1} is incomplete or invalid (${m.tiles.length} tile${m.tiles.length !== 1 ? 's' : ''}).`);
        return;
      }
    }
  }

  const c = state.conditions;

  // Auto-detect menQing and allFrontType from meld concealed states
  const filledMelds = state.melds.slice(0, 5).filter(m => m.tiles.length > 0);
  const menQing    = filledMelds.length > 0 && filledMelds.every(m => m.concealed);
  const allExposed = filledMelds.length > 0 && filledMelds.every(m => !m.concealed);
  const allFrontType = allExposed
    ? (c.wonFrom === 'self' ? 'ban_qiu' : 'quan_qiu')
    : 'none';

  const hand = {
    melds: state.melds.slice(0, 5).map((m, i) => ({
      tiles: resolveWilds([...m.tiles], i),
      type: m.type,
      concealed: m.concealed
    })),
    pair: resolveWilds([...state.melds[5].tiles], 5),
    flowers: [],
    conditions: { ...c, menQing, allFrontType }
  };

  const { total, rows } = calculateScore(hand, state.rules);

  // Total
  document.getElementById('total-fan').textContent = total;

  // Hand preview
  renderResultsPreview();

  // Breakdown table
  const tbody = document.getElementById('results-tbody');
  tbody.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.fanEarned === 0) tr.classList.add('zero-row');
    tr.innerHTML = `
      <td class="category-cell">${row.category}</td>
      <td>
        <div class="rule-name-zh">${row.chinese}</div>
        <div class="rule-name-en">${row.description_en}</div>
      </td>
      <td class="fan-value${row.fanEarned === 0 ? ' zero' : ''}">${row.fanEarned}</td>
    `;
    tbody.appendChild(tr);
  }

  showScreen('screen-results');
}

// ── Dev Presets ───────────────────────────────────────────────────────────────

const PRESETS = [
  {
    label: '清一色 All-bamboo',
    melds: [
      { tiles: ['b1','b2','b3'], concealed: true  },
      { tiles: ['b4','b5','b6'], concealed: true  },
      { tiles: ['b7','b8','b9'], concealed: true  },
      { tiles: ['b1','b1','b1'], concealed: true  },
      { tiles: ['b7','b7','b7'], concealed: true  },
      { tiles: ['b4','b4'],      concealed: true  },
    ],
    winningTile: '2-2',   // b9 in meld 3
    wonFrom: 'self',
    flowers: [],
  },
  {
    label: '大三元 Three dragons',
    melds: [
      { tiles: ['z5','z5','z5'], concealed: true  },   // 中
      { tiles: ['z6','z6','z6'], concealed: false },   // 發
      { tiles: ['z7','z7','z7'], concealed: false },   // 白
      { tiles: ['z1','z1','z1'], concealed: false },   // 東
      { tiles: ['z2','z2','z2'], concealed: true  },   // 南
      { tiles: ['z3','z3'],      concealed: true  },   // 西 pair
    ],
    winningTile: '0-2',   // last 中 in meld 1
    wonFrom: 'self',
    flowers: [],
  },
  {
    label: '一條龍 Full run',
    melds: [
      { tiles: ['m1','m2','m3'], concealed: true },
      { tiles: ['m4','m5','m6'], concealed: true },
      { tiles: ['m7','m8','m9'], concealed: true },
      { tiles: ['b1','b2','b3'], concealed: true },
      { tiles: ['b7','b8','b9'], concealed: true },
      { tiles: ['m5','m5'],      concealed: true },
    ],
    winningTile: '5-1',   // second m5 in pair
    wonFrom: 'self',
    flowers: [],
  },
  {
    label: '基本 Basic win (~3 fan)',
    melds: [
      { tiles: ['m2','m3','m4'], concealed: false },
      { tiles: ['p6','p7','p8'], concealed: false },
      { tiles: ['z1','z1','z1'], concealed: false },   // 東 exposed pung
      { tiles: ['m6','m7','m8'], concealed: true  },
      { tiles: ['p2','p3','p4'], concealed: true  },
      { tiles: ['b5','b5'],      concealed: true  },   // pair of 5 → pair_258
    ],
    winningTile: '5-1',   // second b5 in pair
    wonFrom: 'z2',
    flowers: [],
  },
  {
    label: '小平 Xiao Ping + flower (~9 fan)',
    melds: [
      { tiles: ['m2','m3','m4'], concealed: true },
      { tiles: ['p5','p6','p7'], concealed: true },
      { tiles: ['b3','b4','b5'], concealed: true },
      { tiles: ['m6','m7','m8'], concealed: true },
      { tiles: ['p2','p3','p4'], concealed: true },
      { tiles: ['m5','m5'],      concealed: true },   // pair of 5 → pair_258
    ],
    winningTile: '5-1',   // second m5 in pair
    wonFrom: 'self',
    flowers: ['f1'],
  },
];

let _presetIndex = 0;

function loadPreset() {
  const preset = PRESETS[_presetIndex % PRESETS.length];
  _presetIndex++;

  state.selectedPaletteTile = null;
  state.winningTile = preset.winningTile;
  state.selectedFlowers = new Set(preset.flowers);
  state.wildTileId = null;
  state.wildcardSubs = {};
  state.conditions.wonFrom = preset.wonFrom;
  state.conditions.flowerCount = preset.flowers.length;

  state.melds = preset.melds.map((m, i) => ({
    tiles: [...m.tiles],
    type: i === 5 ? 'pair' : (detectMeldType([...m.tiles]) || 'sequence'),
    concealed: m.concealed,
  }));

  buildMeldSlots();
  for (let i = 0; i < 6; i++) {
    renderMeldSlot(i);
    updateMeldType(i);
    const toggle = document.querySelector(`.concealed-toggle[data-meld="${i}"]`);
    if (toggle) {
      toggle.textContent = state.melds[i].concealed ? '🙈' : '👁';
      toggle.classList.toggle('is-concealed', state.melds[i].concealed);
    }
  }

  document.querySelectorAll('.won-from-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === preset.wonFrom)
  );
  document.querySelector('.won-from-bar').classList.remove('missing');
  renderWildTileBtn();
  updateWildcardCount();

  renderFlowerPalette();
  state.selectedFlowers.forEach(fid => {
    const btn = document.querySelector(`#palette-flower .tile-btn[data-id="${fid}"]`);
    if (btn) btn.classList.add('selected-palette');
  });
  updateFlowerBadge();
  document.getElementById('cond-flowers').value = preset.flowers.length;
  document.getElementById('flower-special-row').style.display = preset.flowers.length >= 6 ? '' : 'none';

  updatePaletteUI();
  updateSelectionHint();
  updateMeldDropTargets();
}

function renderResultsPreview() {
  const container = document.getElementById('results-hand-tiles');
  container.innerHTML = '';

  const [wtMeldIdx, wtTileIdx] = state.winningTile
    ? state.winningTile.split('-').map(Number)
    : [null, null];

  function makeChip(tileId, isWinning = false, key = null) {
    const isZ7      = tileId === 'z7' && !!state.wildTileId;
    const isWildTile = !!state.wildTileId && tileId === state.wildTileId;
    const isWild    = isZ7 || isWildTile;

    let tile, wildSub = null;
    if (isZ7) {
      tile = TILE_BY_ID[state.wildTileId];
    } else if (isWildTile) {
      wildSub = key ? (state.wildcardSubs[key] || null) : null;
      tile = wildSub ? TILE_BY_ID[wildSub] : TILE_BY_ID[tileId];
    } else {
      tile = TILE_BY_ID[tileId] || FLOWER_TILES.find(t => t.id === tileId);
    }
    if (!tile) return null;

    const chip = document.createElement('div');
    chip.className = `tile-chip suit-${tile.suit}${isWinning ? ' is-winning' : ''}${isWild ? ' is-wild' : ''}`;
    chip.innerHTML = `
      <span class="chip-face">${tile.face}</span>
      ${isWinning ? '<span class="win-star">★</span>' : ''}
      ${isZ7 ? '<span class="wild-badge">白</span>' : ''}
      ${isWildTile && wildSub ? '<span class="wild-badge">寶</span>' : ''}
    `;
    return chip;
  }

  function makeSection(labelText, meldEntries, extraClass = '') {
    if (meldEntries.length === 0) return null;
    const section = document.createElement('div');
    section.className = `preview-section${extraClass ? ' ' + extraClass : ''}`;
    const lbl = document.createElement('div');
    lbl.className = 'preview-section-label';
    lbl.textContent = labelText;
    section.appendChild(lbl);
    const row = document.createElement('div');
    row.className = 'preview-melds-row';
    for (const { meldIndex, meld } of meldEntries) {
      const group = document.createElement('div');
      group.className = 'preview-meld-group';
      for (let ti = 0; ti < meld.tiles.length; ti++) {
        const isWinning = meldIndex === wtMeldIdx && ti === wtTileIdx;
        const chip = makeChip(meld.tiles[ti], isWinning, `${meldIndex}-${ti}`);
        if (chip) group.appendChild(chip);
      }
      row.appendChild(group);
    }
    section.appendChild(row);
    return section;
  }

  // Separate exposed and concealed melds (indices 0–4)
  const exposedMelds = [];
  const concealedMelds = [];
  for (let i = 0; i < 5; i++) {
    const meld = state.melds[i];
    if (meld.tiles.length === 0) continue;
    (meld.concealed ? concealedMelds : exposedMelds).push({ meldIndex: i, meld });
  }
  // Pair always in concealed section
  if (state.melds[5].tiles.length > 0) {
    concealedMelds.push({ meldIndex: 5, meld: state.melds[5] });
  }

  const expSec = makeSection('明 Exposed', exposedMelds);
  const conSec = makeSection('暗 Concealed', concealedMelds);
  if (expSec) container.appendChild(expSec);
  if (conSec) container.appendChild(conSec);

  // Flowers section
  if (state.selectedFlowers.size > 0) {
    const section = document.createElement('div');
    section.className = 'preview-section';
    const lbl = document.createElement('div');
    lbl.className = 'preview-section-label';
    lbl.textContent = `花 Flowers (${state.selectedFlowers.size})`;
    section.appendChild(lbl);
    const row = document.createElement('div');
    row.className = 'preview-melds-row';
    for (const fid of state.selectedFlowers) {
      const chip = makeChip(fid);
      if (chip) row.appendChild(chip);
    }
    section.appendChild(row);
    container.appendChild(section);
  }
}

function clearAll() {
  state.melds = [
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'pair',     concealed: true }
  ];
  state.selectedPaletteTile = null;
  state.winningTile = null;
  state.selectedFlowers = new Set();
  state.wildTileId = null;
  state.wildcardSubs = {};
  state.conditions.wonFrom = null;
  document.querySelectorAll('.won-from-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.won-from-bar').classList.remove('missing');
  state.conditions.flowerCount = 0;
  document.getElementById('cond-flowers').value = 0;
  renderFlowerPalette();
  updateFlowerBadge();
  document.getElementById('flower-special-row').style.display = 'none';
  renderWildTileBtn();
  updateWildcardCount();

  buildMeldSlots();
  updatePaletteUI();
  updateSelectionHint();
  updateMeldDropTargets();
}

// ── Event Bindings ────────────────────────────────────────────────────────────

function bindEvents() {
  document.getElementById('calc-btn').addEventListener('click', calculateAndShow);
  document.getElementById('clear-btn').addEventListener('click', clearAll);
  document.getElementById('sample-btn').addEventListener('click', loadPreset);

  document.getElementById('wild-tile-btn').addEventListener('click', openWildTilePicker);

  // Wild picker: close on backdrop click
  document.getElementById('wild-picker').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeWildPicker();
  });

  // Results screen
  document.getElementById('back-btn').addEventListener('click', () => showScreen('screen-main'));
  document.getElementById('restart-btn').addEventListener('click', () => {
    clearAll();
    showScreen('screen-main');
  });

  // Deselect palette tile on backdrop tap
  document.getElementById('melds-grid').addEventListener('click', (e) => {
    // If tap lands directly on grid (not a slot), deselect
    if (e.target.id === 'melds-grid') {
      state.selectedPaletteTile = null;
      updatePaletteUI();
      updateSelectionHint();
      updateMeldDropTargets();
    }
  });

  // Win conditions
  document.getElementById('cond-dealer').addEventListener('change', (e) => {
    state.conditions.dealer = e.target.checked;
    document.getElementById('streak-row').style.display = e.target.checked ? '' : 'none';
  });
  document.getElementById('cond-dealer-streak').addEventListener('input', (e) => {
    state.conditions.dealerStreak = Number(e.target.value) || 0;
  });
  document.querySelectorAll('.won-from-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.value;
      state.conditions.wonFrom = (state.conditions.wonFrom === val) ? null : val;
      document.querySelectorAll('.won-from-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.value === state.conditions.wonFrom)
      );
      document.querySelector('.won-from-bar').classList.remove('missing');
    });
  });
  document.getElementById('cond-win-type').addEventListener('change', (e) => {
    state.conditions.winType = e.target.value;
  });
  document.getElementById('cond-instant').addEventListener('change', (e) => {
    state.conditions.instantWin = e.target.value;
  });
  document.getElementById('cond-flowers').addEventListener('input', (e) => {
    const n = Number(e.target.value) || 0;
    state.conditions.flowerCount = n;
    updateFlowerBadge();
    document.getElementById('flower-special-row').style.display = n >= 6 ? '' : 'none';
  });
  document.getElementById('cond-flower-special').addEventListener('change', (e) => {
    state.conditions.flowerSpecial = e.target.value;
  });
  document.getElementById('cond-wildcards').addEventListener('input', (e) => {
    const n = Number(e.target.value) || 0;
    state.conditions.wildcards = n;
    document.getElementById('mo-bao-row').style.display     = n > 0 ? '' : 'none';
    document.getElementById('bao-gui-wei-row').style.display = n > 0 ? '' : 'none';
  });
  document.getElementById('cond-mo-bao').addEventListener('change', (e) => {
    state.conditions.moBao = e.target.checked;
  });
  document.getElementById('cond-bao-gui-wei').addEventListener('change', (e) => {
    state.conditions.baoGuiWei = e.target.checked;
  });
  document.getElementById('cond-ni-gu').addEventListener('change', (e) => {
    state.conditions.niGu = e.target.checked;
  });
  document.getElementById('show-zero-rules').addEventListener('change', (e) => {
    document.querySelectorAll('.zero-row').forEach(r =>
      r.classList.toggle('show', e.target.checked)
    );
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
