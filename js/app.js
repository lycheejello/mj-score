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

  conditions: {
    dealer: false,
    dealerStreak: 0,
    ziMo: false,
    menQing: false,
    allFrontType: 'none',
    winType: 'normal',
    instantWin: 'none',
    wildcards: 0,
    moBao: false,
    baoGuiWei: false,
    flowerCount: 0,
    flowerSpecial: 'none',
    niGu: false,
    shiSanYao: false
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
  const detected = detectMeldType(meld.tiles);
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
    const tile = TILE_BY_ID[tileId];
    const key = `${meldIndex}-${i}`;
    const isWinning = state.winningTile === key;

    const chip = document.createElement('div');
    chip.className = `tile-chip suit-${tile.suit}${isWinning ? ' is-winning' : ''}`;
    chip.innerHTML = `
      <span class="chip-face">${tile.face}</span>
      <span class="chip-label">${tile.label}</span>
      ${isWinning ? '<span class="win-star">★</span>' : ''}
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
      meld.tiles.splice(i, 1);
      updateMeldType(meldIndex);
      renderMeldSlot(meldIndex);
      updatePaletteUI();
      updateMeldDropTargets();
    });
    chip.appendChild(rm);
    tilesEl.appendChild(chip);
  }
}

// ── Calculate & Results ───────────────────────────────────────────────────────

function calculateAndShow() {
  // Validate pair slot has 2 tiles
  if (state.melds[5].tiles.length !== 2) {
    alert('The pair slot needs exactly 2 tiles.');
    return;
  }
  // Validate all non-pair melds that have any tiles are complete
  for (let i = 0; i < 5; i++) {
    const m = state.melds[i];
    if (m.tiles.length > 0 && m.tiles.length < maxForSlot(i)) {
      alert(`Meld ${i + 1} is incomplete (${m.tiles.length} / ${maxForSlot(i)} tiles).`);
      return;
    }
  }

  const c = state.conditions;
  const hand = {
    melds: state.melds.slice(0, 5).map(m => ({
      tiles: [...m.tiles],
      type: m.type,
      concealed: m.concealed
    })),
    pair: [...state.melds[5].tiles],
    flowers: [],
    conditions: { ...c }
  };

  const { total, rows } = calculateScore(hand, state.rules);

  // Total
  document.getElementById('total-fan').textContent = total;

  // Hand preview
  const preview = document.getElementById('results-hand-tiles');
  preview.innerHTML = '';
  for (const id of state.melds.flatMap(m => m.tiles)) {
    const t = TILE_BY_ID[id];
    if (!t) continue;
    const chip = document.createElement('div');
    chip.className = `tile-chip suit-${t.suit}`;
    chip.style.cursor = 'default';
    chip.innerHTML = `<span class="chip-face">${t.face}</span><span class="chip-label">${t.label}</span>`;
    preview.appendChild(chip);
  }

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
  state.conditions.flowerCount = 0;
  document.getElementById('cond-flowers').value = 0;
  renderFlowerPalette();
  updateFlowerBadge();
  document.getElementById('flower-special-row').style.display = 'none';

  buildMeldSlots();
  updatePaletteUI();
  updateSelectionHint();
  updateMeldDropTargets();
}

// ── Event Bindings ────────────────────────────────────────────────────────────

function bindEvents() {
  document.getElementById('calc-btn').addEventListener('click', calculateAndShow);
  document.getElementById('clear-btn').addEventListener('click', clearAll);

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
  document.getElementById('cond-zi-mo').addEventListener('change', (e) => {
    state.conditions.ziMo = e.target.checked;
  });
  document.getElementById('cond-men-qing').addEventListener('change', (e) => {
    state.conditions.menQing = e.target.checked;
  });
  document.getElementById('cond-all-front').addEventListener('change', (e) => {
    state.conditions.allFrontType = e.target.value;
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
  document.getElementById('cond-shi-san-yao').addEventListener('change', (e) => {
    state.conditions.shiSanYao = e.target.checked;
  });
  document.getElementById('show-zero-rules').addEventListener('change', (e) => {
    document.querySelectorAll('.zero-row').forEach(r =>
      r.classList.toggle('show', e.target.checked)
    );
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
