// ── App State ─────────────────────────────────────────────────────────────────

const state = {
  // Step 1
  handTiles: [],    // array of tile ids (max 17 non-flower)
  flowerTiles: [],  // array of flower tile ids
  // Tile counts remaining (4 max each)
  counts: {},       // id -> count used

  // Step 2
  melds: [          // 5 melds + 1 pair slot
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'pair',     concealed: true }  // index 5 = pair slot
  ],
  selectedTrayTile: null,  // { tileId, trayIndex } of chip selected in unassigned tray

  // Conditions
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

  // Scoring rules
  rules: []
};

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('./data/scoring.csv');
    const text = await res.text();
    state.rules = parseCSV(text);
  } catch (e) {
    console.warn('Could not load scoring.csv', e);
  }
  buildPalette();
  buildMeldSlots();
  bindEvents();
  showScreen(1);
}

// ── Screen Navigation ─────────────────────────────────────────────────────────

function showScreen(n) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${n}`).classList.add('active');
  window.scrollTo(0, 0);
}

// ── Step 1: Tile Palette ──────────────────────────────────────────────────────

function buildPalette() {
  renderPaletteGroup('palette-bamboo', BAMBOO_TILES);
  renderPaletteGroup('palette-man',    MAN_TILES);
  renderPaletteGroup('palette-pin',    PIN_TILES);
  renderPaletteGroup('palette-honor',  HONOR_TILES);
  renderPaletteGroup('palette-flower', FLOWER_TILES);
}

function renderPaletteGroup(containerId, tiles) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  for (const tile of tiles) {
    const btn = document.createElement('button');
    btn.className = `tile-btn suit-${tile.suit}`;
    btn.dataset.id = tile.id;
    btn.innerHTML = `
      <span class="tile-face">${tile.face}</span>
      <span class="tile-label">${tile.label}</span>
      <span class="tile-count-badge" id="badge-${tile.id}"></span>
    `;
    btn.addEventListener('click', () => onPaletteTileClick(tile));
    el.appendChild(btn);
  }
}

function onPaletteTileClick(tile) {
  const isFlower = tile.suit === 'f';
  const maxCount = 4;

  if (!isFlower) {
    if (state.handTiles.length >= 17) return;
    const used = state.handTiles.filter(id => id === tile.id).length;
    if (used >= maxCount) return;
    state.handTiles.push(tile.id);
  } else {
    const used = state.flowerTiles.filter(id => id === tile.id).length;
    if (used >= 1) return; // flowers unique
    state.flowerTiles.push(tile.id);
  }

  updateStep1UI();
}

function updateStep1UI() {
  // Progress
  const count = state.handTiles.length;
  const pct = (count / 17) * 100;
  document.getElementById('progress-bar').style.width = `${pct}%`;
  document.getElementById('progress-label').textContent = `${count} / 17 tiles`;

  // Update badge counts on palette buttons
  const allIds = [...BAMBOO_TILES, ...MAN_TILES, ...PIN_TILES, ...HONOR_TILES, ...FLOWER_TILES].map(t => t.id);
  for (const id of allIds) {
    const isFlower = id.startsWith('f');
    const used = isFlower
      ? state.flowerTiles.filter(x => x === id).length
      : state.handTiles.filter(x => x === id).length;
    const max = isFlower ? 1 : 4;
    const remaining = max - used;
    const badge = document.getElementById(`badge-${id}`);
    const btn = badge?.closest('.tile-btn');
    if (!badge || !btn) continue;
    badge.textContent = remaining < max ? `×${remaining}` : '';
    btn.classList.toggle('depleted', remaining === 0);
  }

  // Render hand tray
  renderHandTray();

  // Enable/disable next button
  document.getElementById('to-step2-btn').disabled = count !== 17;
}

function renderHandTray() {
  const tray = document.getElementById('hand-tray');
  tray.innerHTML = '';
  for (let i = 0; i < state.handTiles.length; i++) {
    tray.appendChild(makeChip(state.handTiles[i], i, false));
  }

  const flowerTray = document.getElementById('flower-tray');
  const flowerLabel = document.getElementById('flower-tray-label');
  flowerTray.innerHTML = '';
  if (state.flowerTiles.length > 0) {
    flowerLabel.style.display = '';
    for (let i = 0; i < state.flowerTiles.length; i++) {
      flowerTray.appendChild(makeChip(state.flowerTiles[i], i, true));
    }
  } else {
    flowerLabel.style.display = 'none';
  }
}

function makeChip(tileId, index, isFlower) {
  const tile = TILE_BY_ID[tileId];
  const chip = document.createElement('div');
  chip.className = `tile-chip suit-${tile.suit}`;
  chip.innerHTML = `
    <span class="chip-face">${tile.face}</span>
    <span class="chip-label">${tile.label}</span>
  `;
  const removeBtn = document.createElement('button');
  removeBtn.className = 'chip-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isFlower) {
      state.flowerTiles.splice(index, 1);
    } else {
      state.handTiles.splice(index, 1);
    }
    updateStep1UI();
  });
  chip.appendChild(removeBtn);
  return chip;
}

// ── Step 2: Hand Grouping ─────────────────────────────────────────────────────

function buildMeldSlots() {
  const grid = document.getElementById('melds-grid');
  grid.innerHTML = '';

  for (let i = 0; i < 6; i++) {
    const isPair = i === 5;
    const slot = document.createElement('div');
    slot.className = `meld-slot${isPair ? ' pair-slot' : ''}`;
    slot.dataset.meldIndex = i;

    const typeOptions = isPair
      ? '<option value="pair">Pair 對</option>'
      : `<option value="sequence">Sequence 順</option>
         <option value="pung">Pung 刻</option>
         <option value="kang">Kang 槓 (4 tiles)</option>`;

    slot.innerHTML = `
      <div class="meld-header">
        <span class="meld-title">${isPair ? 'Pair 對' : `Meld ${i + 1}`}</span>
        <div class="meld-controls">
          ${isPair ? '' : `<select class="meld-type-select" data-meld="${i}">${typeOptions}</select>`}
          <button class="concealed-toggle is-concealed" data-meld="${i}">暗</button>
        </div>
      </div>
      <div class="meld-tiles" data-meld="${i}">
        <span class="meld-empty-hint">${isPair ? 'click 2 tiles' : 'click tiles to assign'}</span>
      </div>
    `;

    slot.querySelector('.meld-tiles').addEventListener('click', () => onMeldSlotClick(i));

    if (!isPair) {
      slot.querySelector('.meld-type-select').addEventListener('change', (e) => {
        state.melds[i].type = e.target.value;
        renderMeldSlot(i);
      });
    }

    slot.querySelector('.concealed-toggle').addEventListener('click', (e) => {
      state.melds[i].concealed = !state.melds[i].concealed;
      e.target.textContent = state.melds[i].concealed ? '暗' : '明';
      e.target.classList.toggle('is-concealed', state.melds[i].concealed);
    });

    grid.appendChild(slot);
  }
}

function enterStep2() {
  // Reset meld slots but keep flower count synced
  state.melds = [
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'sequence', concealed: true },
    { tiles: [], type: 'pair',     concealed: true }
  ];
  state.selectedTrayTile = null;
  state.conditions.flowerCount = state.flowerTiles.length;
  document.getElementById('cond-flowers').value = state.conditions.flowerCount;

  buildMeldSlots();
  renderUnassignedTray();
  showScreen(2);
}

function getUnassignedTiles() {
  const assigned = state.melds.flatMap(m => m.tiles);
  const result = [];
  for (const id of state.handTiles) {
    const idx = assigned.indexOf(id);
    if (idx !== -1) { assigned.splice(idx, 1); }
    else { result.push(id); }
  }
  return result;
}

function renderUnassignedTray() {
  const tray = document.getElementById('unassigned-tray');
  tray.innerHTML = '';
  const unassigned = getUnassignedTiles();
  document.getElementById('unassigned-count').textContent = unassigned.length;

  for (let i = 0; i < unassigned.length; i++) {
    const chip = makeUnassignedChip(unassigned[i], i);
    tray.appendChild(chip);
  }
}

function makeUnassignedChip(tileId, index) {
  const tile = TILE_BY_ID[tileId];
  const chip = document.createElement('div');
  chip.className = `tile-chip suit-${tile.suit}`;
  chip.dataset.unassignedIndex = index;
  chip.innerHTML = `
    <span class="chip-face">${tile.face}</span>
    <span class="chip-label">${tile.label}</span>
  `;
  chip.addEventListener('click', () => onUnassignedChipClick(tileId, index, chip));
  return chip;
}

function onUnassignedChipClick(tileId, index, chip) {
  // Deselect if same chip
  if (state.selectedTrayTile && state.selectedTrayTile.index === index &&
      state.selectedTrayTile.tileId === tileId) {
    state.selectedTrayTile = null;
    document.querySelectorAll('.tile-chip.selected-chip').forEach(c => c.classList.remove('selected-chip'));
    return;
  }
  state.selectedTrayTile = { tileId, index };
  document.querySelectorAll('.tile-chip.selected-chip').forEach(c => c.classList.remove('selected-chip'));
  chip.classList.add('selected-chip');
}

function onMeldSlotClick(meldIndex) {
  if (!state.selectedTrayTile) return;

  const meld = state.melds[meldIndex];
  const isPair = meldIndex === 5;
  const maxTiles = isPair ? 2 : (meld.type === 'kang' ? 4 : 3);

  if (meld.tiles.length >= maxTiles) {
    // Slot full — show brief flash
    flashSlot(meldIndex);
    return;
  }

  meld.tiles.push(state.selectedTrayTile.tileId);
  state.selectedTrayTile = null;
  document.querySelectorAll('.tile-chip.selected-chip').forEach(c => c.classList.remove('selected-chip'));

  renderMeldSlot(meldIndex);
  renderUnassignedTray();
}

function flashSlot(meldIndex) {
  const slot = document.querySelector(`[data-meld-index="${meldIndex}"]`);
  if (!slot) return;
  slot.style.borderColor = '#e74c3c';
  setTimeout(() => { slot.style.borderColor = ''; }, 400);
}

function renderMeldSlot(meldIndex) {
  const meld = state.melds[meldIndex];
  const tilesEl = document.querySelector(`.meld-tiles[data-meld="${meldIndex}"]`);
  if (!tilesEl) return;
  tilesEl.innerHTML = '';

  if (meld.tiles.length === 0) {
    const hint = document.createElement('span');
    hint.className = 'meld-empty-hint';
    hint.textContent = meldIndex === 5 ? 'click 2 tiles' : 'click tiles to assign';
    tilesEl.appendChild(hint);
    return;
  }

  for (let i = 0; i < meld.tiles.length; i++) {
    const tileId = meld.tiles[i];
    const tile = TILE_BY_ID[tileId];
    const chip = document.createElement('div');
    chip.className = `tile-chip suit-${tile.suit}`;
    chip.innerHTML = `<span class="chip-face">${tile.face}</span><span class="chip-label">${tile.label}</span>`;
    const rm = document.createElement('button');
    rm.className = 'chip-remove';
    rm.textContent = '×';
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      meld.tiles.splice(i, 1);
      renderMeldSlot(meldIndex);
      renderUnassignedTray();
    });
    chip.appendChild(rm);
    tilesEl.appendChild(chip);
  }
}

// ── Step 3: Results ───────────────────────────────────────────────────────────

function calculateAndShow() {
  // Validate all 17 tiles are assigned
  const unassigned = getUnassignedTiles();
  if (unassigned.length > 0) {
    alert(`${unassigned.length} tile(s) are not yet assigned to a meld. Please assign all tiles before calculating.`);
    return;
  }
  const pairTiles = state.melds[5].tiles;
  if (pairTiles.length !== 2) {
    alert('The pair slot needs exactly 2 tiles.');
    return;
  }

  const c = state.conditions;

  // Build hand object for scoring engine
  const hand = {
    melds: state.melds.slice(0, 5).map(m => ({
      tiles: [...m.tiles],
      type: m.type,
      concealed: m.concealed
    })),
    pair: [...state.melds[5].tiles],
    flowers: [...state.flowerTiles],
    conditions: { ...c }
  };

  const { total, rows } = calculateScore(hand, state.rules);

  // Display total
  document.getElementById('total-fan').textContent = total;

  // Hand preview
  const preview = document.getElementById('results-hand-tiles');
  preview.innerHTML = '';
  const allHandIds = state.melds.flatMap(m => m.tiles);
  for (const id of allHandIds) {
    const t = TILE_BY_ID[id];
    if (!t) continue;
    const chip = document.createElement('div');
    chip.className = `tile-chip suit-${t.suit}`;
    chip.style.cursor = 'default';
    chip.innerHTML = `<span class="chip-face">${t.face}</span><span class="chip-label">${t.label}</span>`;
    preview.appendChild(chip);
  }
  for (const id of state.flowerTiles) {
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

  showScreen(3);
}

// ── Event Bindings ────────────────────────────────────────────────────────────

function bindEvents() {
  // Step 1
  document.getElementById('to-step2-btn').addEventListener('click', enterStep2);
  document.getElementById('clear-hand-btn').addEventListener('click', () => {
    state.handTiles = [];
    state.flowerTiles = [];
    updateStep1UI();
  });

  // Step 2 navigation
  document.getElementById('back-to-1-btn').addEventListener('click', () => showScreen(1));
  document.getElementById('calc-btn').addEventListener('click', calculateAndShow);

  // Step 3 navigation
  document.getElementById('back-to-2-btn').addEventListener('click', () => showScreen(2));
  document.getElementById('restart-btn').addEventListener('click', () => {
    state.handTiles = [];
    state.flowerTiles = [];
    state.selectedTrayTile = null;
    updateStep1UI();
    showScreen(1);
  });

  // Conditions: dealer streak row visibility
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

  // Wildcards — show/hide mo-bao and bao-gui-wei
  document.getElementById('cond-wildcards').addEventListener('input', (e) => {
    const n = Number(e.target.value) || 0;
    state.conditions.wildcards = n;
    document.getElementById('mo-bao-row').style.display = n > 0 ? '' : 'none';
    document.getElementById('bao-gui-wei-row').style.display = n > 0 ? '' : 'none';
  });
  document.getElementById('cond-mo-bao').addEventListener('change', (e) => {
    state.conditions.moBao = e.target.checked;
  });
  document.getElementById('cond-bao-gui-wei').addEventListener('change', (e) => {
    state.conditions.baoGuiWei = e.target.checked;
  });

  // Flowers — show special options if ≥6
  document.getElementById('cond-flowers').addEventListener('input', (e) => {
    const n = Number(e.target.value) || 0;
    state.conditions.flowerCount = n;
    document.getElementById('flower-special-row').style.display = n >= 6 ? '' : 'none';
  });
  document.getElementById('cond-flower-special').addEventListener('change', (e) => {
    state.conditions.flowerSpecial = e.target.value;
  });

  document.getElementById('cond-ni-gu').addEventListener('change', (e) => {
    state.conditions.niGu = e.target.checked;
  });
  document.getElementById('cond-shi-san-yao').addEventListener('change', (e) => {
    state.conditions.shiSanYao = e.target.checked;
  });

  // Show/hide zero-fan rows in results
  document.getElementById('show-zero-rules').addEventListener('change', (e) => {
    document.querySelectorAll('.zero-row').forEach(r =>
      r.classList.toggle('show', e.target.checked)
    );
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
