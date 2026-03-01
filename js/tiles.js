// ── Tile Definitions ──────────────────────────────────────────────────────────
// Each tile: { id, suit, value, face, label }
// suit: 'b' (bamboo), 'm' (man/character), 'p' (pin/circle), 'z' (honor), 'f' (flower)

const BAMBOO_FACES  = ['🀐','🀑','🀒','🀓','🀔','🀕','🀖','🀗','🀘'];
const MAN_FACES     = ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏'];
const PIN_FACES     = ['🀙','🀚','🀛','🀜','🀝','🀞','🀟','🀠','🀡'];
// Honors: East South West North Chun Hatsu Haku
const HONOR_FACES   = ['🀀','🀁','🀂','🀃','🀄','🀅','🀆'];
const HONOR_LABELS  = ['東','南','西','北','中','發','白'];
const HONOR_IDS     = ['z1','z2','z3','z4','z5','z6','z7'];

// Flowers (don't count toward 17)
const FLOWER_FACES  = ['🌸','🌺','🌼','🍀','🌱','🎋','🎍','🌿'];
const FLOWER_LABELS = ['春','夏','秋','冬','梅','蘭','菊','竹'];

function makeSuitTiles(suit, faces, labelPrefix) {
  return faces.map((face, i) => ({
    id: `${suit}${i + 1}`,
    suit,
    value: i + 1,
    face,
    label: `${labelPrefix}${i + 1}`
  }));
}

const BAMBOO_TILES  = makeSuitTiles('b', BAMBOO_FACES,  'B');
const MAN_TILES     = makeSuitTiles('m', MAN_FACES,     'M');
const PIN_TILES     = makeSuitTiles('p', PIN_FACES,     'C');

const HONOR_TILES = HONOR_IDS.map((id, i) => ({
  id,
  suit: 'z',
  value: i + 1,
  face: HONOR_FACES[i],
  label: HONOR_LABELS[i]
}));

const FLOWER_TILES = FLOWER_FACES.map((face, i) => ({
  id: `f${i + 1}`,
  suit: 'f',
  value: i + 1,
  face,
  label: `花${FLOWER_LABELS[i]}`
}));

// All regular tiles (used for palette + 4× max rule)
const ALL_REGULAR_TILES = [...BAMBOO_TILES, ...MAN_TILES, ...PIN_TILES, ...HONOR_TILES];

// Lookup by id
const TILE_BY_ID = {};
[...ALL_REGULAR_TILES, ...FLOWER_TILES].forEach(t => { TILE_BY_ID[t.id] = t; });

// Human-readable display name for a tile id
function tileName(id) {
  const t = TILE_BY_ID[id];
  return t ? t.label : id;
}

// Return the suit group name
function suitName(suit) {
  return { b: 'Bamboo', m: 'Character', p: 'Circle', z: 'Honor', f: 'Flower' }[suit] || suit;
}
