// ── Scoring Engine ────────────────────────────────────────────────────────────
//
// Input: hand object produced by app.js
// {
//   melds: [ { tiles:[id,...], type:'sequence'|'pung'|'kang', concealed:bool }, ... ],
//   pair:  [ id, id ],
//   flowers: [id, ...],
//   conditions: { dealer, dealerStreak, ziMo, menQing, allFrontType,
//                 winType, instantWin, wildcards, moBao, baoGuiWei,
//                 flowerCount, flowerSpecial, niGu, shiSanYao }
// }
//
// Returns: { total, rows: [{rule, fan, category, chinese, pinyin, description_en}] }

// ── Helpers ───────────────────────────────────────────────────────────────────

function tileObj(id) { return TILE_BY_ID[id]; }
function suit(id)    { return tileObj(id)?.suit; }
function val(id)     { return tileObj(id)?.value; }

function allTiles(hand) {
  return [...hand.melds.flatMap(m => m.tiles), ...hand.pair];
}

function meldSuit(meld) { return suit(meld.tiles[0]); }

function isHonor(id) { return suit(id) === 'z'; }
function isTerminal(id) { return !isHonor(id) && (val(id) === 1 || val(id) === 9); }
function isSimple(id) { return !isHonor(id) && !isTerminal(id); }

// All suits present in entire hand (melds + pair)
function suitsInHand(hand) {
  return new Set(allTiles(hand).map(id => suit(id)));
}

function allSameSuit(hand) {
  const suits = suitsInHand(hand);
  return suits.size === 1 && !suits.has('z');
}

function allOneSuitPlusHonors(hand) {
  const suits = suitsInHand(hand);
  const nonZ = [...suits].filter(s => s !== 'z');
  return nonZ.length === 1 && suits.has('z');
}

function concealedPungCount(hand) {
  return hand.melds.filter(m => m.tiles.length > 0 && m.concealed && m.type !== 'sequence').length;
}

// ── Auto Detectors ────────────────────────────────────────────────────────────

const detectors = {

  // Pair
  pair_258(hand) {
    const p = val(hand.pair[0]);
    return [2, 5, 8].includes(p);
  },

  // Flowers
  flower_none(hand) {
    return hand.flowers.length === 0 && hand.conditions.flowerCount === 0;
  },

  // 1/9 Patterns
  lao_shao(hand) {
    // 111+999 or 123+789 of same suit, appearing together
    const melds = hand.melds;
    const suitGroups = {};
    for (const m of melds) {
      const s = meldSuit(m);
      if (s === 'z') continue;
      if (!suitGroups[s]) suitGroups[s] = [];
      suitGroups[s].push(m);
    }
    for (const [, grp] of Object.entries(suitGroups)) {
      const vals = grp.map(m => m.tiles.map(val).sort((a,b) => a-b));
      const has111 = vals.some(v => v[0]===1 && v[1]===1 && v[2]===1);
      const has999 = vals.some(v => v[0]===9 && v[1]===9 && v[2]===9);
      const has123 = vals.some(v => v[0]===1 && v[1]===2 && v[2]===3);
      const has789 = vals.some(v => v[0]===7 && v[1]===8 && v[2]===9);
      if ((has111 && has999) || (has123 && has789)) return true;
    }
    return false;
  },

  duan_yao(hand) {
    return allTiles(hand).every(id => isSimple(id));
  },

  yi_tiao_long(hand) {
    // 123 + 456 + 789 in one suit
    const suits = ['b', 'm', 'p'];
    for (const s of suits) {
      const seqs = hand.melds.filter(m => m.type === 'sequence' && meldSuit(m) === s);
      if (seqs.length < 3) continue;
      const valSets = seqs.map(m => m.tiles.map(val).sort((a,b)=>a-b));
      const has123 = valSets.some(v => v.join() === '1,2,3');
      const has456 = valSets.some(v => v.join() === '4,5,6');
      const has789 = valSets.some(v => v.join() === '7,8,9');
      if (has123 && has456 && has789) return true;
    }
    return false;
  },

  hun_yao(hand) {
    // Only 1/9 terminals and honors (pungs or 123/789 sequences)
    const allowed = (m) => {
      const vs = m.tiles.map(val);
      const s = meldSuit(m);
      if (s === 'z') return true;
      if (m.type !== 'sequence') return vs.every(v => v === 1 || v === 9);
      const sorted = [...vs].sort((a,b)=>a-b);
      return (sorted.join() === '1,2,3' || sorted.join() === '7,8,9');
    };
    if (!hand.melds.every(allowed)) return false;
    const pv = val(hand.pair[0]);
    const ps = suit(hand.pair[0]);
    return ps === 'z' || pv === 1 || pv === 9;
  },

  quan_dai_yao(hand) {
    // Every meld/pair contains a 1 or 9 (no honors)
    if (suitsInHand(hand).has('z')) return false;
    const meldHas19 = (m) => m.tiles.some(id => val(id) === 1 || val(id) === 9);
    if (!hand.melds.every(meldHas19)) return false;
    return val(hand.pair[0]) === 1 || val(hand.pair[0]) === 9;
  },

  quan_yao(hand) {
    // All pungs of 1s and 9s, no sequences, no honors
    if (suitsInHand(hand).has('z')) return false;
    const onlyTermPung = (m) =>
      m.type !== 'sequence' && m.tiles.every(id => val(id) === 1 || val(id) === 9);
    if (!hand.melds.every(onlyTermPung)) return false;
    const pv = val(hand.pair[0]);
    return pv === 1 || pv === 9;
  },

  // Winds/Dragons
  zi_pung(hand) {
    // Returns COUNT (number of honor pungs), handled as count
    return hand.melds.filter(m => m.type !== 'sequence' && meldSuit(m) === 'z').length;
  },

  wu_zi(hand) {
    return !suitsInHand(hand).has('z');
  },

  wu_zi_wu_hua(hand) {
    return !suitsInHand(hand).has('z') &&
           hand.flowers.length === 0 &&
           hand.conditions.flowerCount === 0;
  },

  xiao_san_yuan(hand) {
    const dragonIds = ['z5','z6','z7'];
    const pungIds = hand.melds
      .filter(m => m.type !== 'sequence' && meldSuit(m) === 'z')
      .map(m => m.tiles[0]);
    const dragonPungs = pungIds.filter(id => dragonIds.includes(id)).length;
    const pairIsDragon = dragonIds.includes(hand.pair[0]);
    return dragonPungs === 2 && pairIsDragon;
  },

  da_san_yuan(hand) {
    const dragonIds = new Set(['z5','z6','z7']);
    const pungIds = hand.melds
      .filter(m => m.type !== 'sequence')
      .map(m => m.tiles[0]);
    const dragonPungs = new Set(pungIds.filter(id => dragonIds.has(id)));
    return dragonPungs.size === 3;
  },

  xiao_san_feng(hand) {
    const windIds = ['z1','z2','z3','z4'];
    const pungIds = hand.melds
      .filter(m => m.type !== 'sequence' && meldSuit(m) === 'z')
      .map(m => m.tiles[0]);
    const windPungs = pungIds.filter(id => windIds.includes(id)).length;
    const pairIsWind = windIds.includes(hand.pair[0]);
    return windPungs === 2 && pairIsWind;
  },

  da_san_feng(hand) {
    const windIds = new Set(['z1','z2','z3','z4']);
    const pungIds = hand.melds
      .filter(m => m.type !== 'sequence')
      .map(m => m.tiles[0]);
    const windPungs = new Set(pungIds.filter(id => windIds.has(id)));
    return windPungs.size === 3;
  },

  xiao_si_xi(hand) {
    const windIds = new Set(['z1','z2','z3','z4']);
    const pungIds = hand.melds
      .filter(m => m.type !== 'sequence')
      .map(m => m.tiles[0]);
    const windPungs = new Set(pungIds.filter(id => windIds.has(id)));
    const pairIsWind = windIds.has(hand.pair[0]);
    return windPungs.size === 3 && pairIsWind;
  },

  da_si_xi(hand) {
    const windIds = new Set(['z1','z2','z3','z4']);
    const pungIds = hand.melds
      .filter(m => m.type !== 'sequence')
      .map(m => m.tiles[0]);
    const windPungs = new Set(pungIds.filter(id => windIds.has(id)));
    return windPungs.size === 4;
  },

  // Pung
  xiao_ping(hand) {
    const allSeq = hand.melds.every(m => m.type === 'sequence');
    const hasFlowers = hand.flowers.length > 0 || hand.conditions.flowerCount > 0;
    return allSeq && hasFlowers;
  },

  da_ping(hand) {
    return hand.melds.every(m => m.type === 'sequence') &&
           hand.flowers.length === 0 &&
           hand.conditions.flowerCount === 0;
  },

  er_an_ke(hand) { return concealedPungCount(hand) === 2; },
  san_an_ke(hand) { return concealedPungCount(hand) === 3; },
  si_an_ke(hand)  { return concealedPungCount(hand) === 4; },
  wu_an_ke(hand)  { return concealedPungCount(hand) === 5; },

  peng_peng_hu(hand) {
    return hand.melds.every(m => m.type !== 'sequence');
  },

  // Kang — count returned, handled by scoring loop
  si_gui_yi(hand) {
    // A kang broken into a sequence (e.g. 1234+444 → pair 33 is impossible here;
    // detect as: a kang tile set where same value appears in a sequence meld)
    // Simplified: check if any kang tile value appears as the low/high of a seq in same suit
    let count = 0;
    for (const m of hand.melds) {
      if (m.type !== 'kang') continue;
      const s = meldSuit(m); const v = val(m.tiles[0]);
      const hasSeqWith = hand.melds.some(m2 =>
        m2.type === 'sequence' && meldSuit(m2) === s &&
        m2.tiles.map(val).includes(v)
      );
      if (hasSeqWith) count++;
    }
    return count;
  },

  si_gui_er(hand) {
    let count = 0;
    for (const m of hand.melds) {
      if (m.type !== 'kang') continue;
      const s = meldSuit(m); const v = val(m.tiles[0]);
      const seqs = hand.melds.filter(m2 =>
        m2.type === 'sequence' && meldSuit(m2) === s &&
        m2.tiles.map(val).includes(v)
      );
      if (seqs.length >= 2) count++;
    }
    return count;
  },

  si_gui_san(hand) {
    let count = 0;
    for (const m of hand.melds) {
      if (m.type !== 'kang') continue;
      const s = meldSuit(m); const v = val(m.tiles[0]);
      const seqs = hand.melds.filter(m2 =>
        m2.type === 'sequence' && meldSuit(m2) === s &&
        m2.tiles.map(val).includes(v)
      );
      if (seqs.length >= 3) count++;
    }
    return count;
  },

  // Repeated Patterns
  yi_ban_gao(hand) {
    // 2 identical sequences in same suit
    const seqKey = m => meldSuit(m) + m.tiles.map(val).sort((a,b)=>a-b).join();
    const keys = hand.melds.filter(m => m.type === 'sequence').map(seqKey);
    const seen = {}; let count = 0;
    for (const k of keys) {
      seen[k] = (seen[k] || 0) + 1;
      if (seen[k] === 2) count++;
    }
    return count;
  },

  wei_ba(hand) {
    // 111+222+33 — two consecutive pungs, pair is next number
    const pungs = hand.melds.filter(m => m.type !== 'sequence' && meldSuit(m) !== 'z');
    for (const p1 of pungs) {
      for (const p2 of pungs) {
        if (p1 === p2) continue;
        if (meldSuit(p1) !== meldSuit(p2)) continue;
        const v1 = val(p1.tiles[0]); const v2 = val(p2.tiles[0]);
        if (Math.abs(v1 - v2) === 1) {
          const pairVal = Math.max(v1, v2) + 1;
          if (val(hand.pair[0]) === pairVal && suit(hand.pair[0]) === meldSuit(p1)) return true;
        }
      }
    }
    return false;
  },

  san_xiang_feng(hand) {
    // Same sequence in 3 suits OR same pung in 3 suits OR 3 consecutive pungs in 1 suit
    const numSuits = ['b','m','p'];
    // Same seq in 3 suits
    const seqGroups = {};
    for (const m of hand.melds.filter(m => m.type === 'sequence')) {
      const key = m.tiles.map(val).sort((a,b)=>a-b).join();
      if (!seqGroups[key]) seqGroups[key] = new Set();
      seqGroups[key].add(meldSuit(m));
    }
    for (const [, suits] of Object.entries(seqGroups)) {
      if (suits.size === 3) return true;
    }
    // Same pung in 3 suits
    const pungGroups = {};
    for (const m of hand.melds.filter(m => m.type !== 'sequence' && meldSuit(m) !== 'z')) {
      const key = val(m.tiles[0]);
      if (!pungGroups[key]) pungGroups[key] = new Set();
      pungGroups[key].add(meldSuit(m));
    }
    for (const [, suits] of Object.entries(pungGroups)) {
      if (suits.size === 3) return true;
    }
    // 3 consecutive pungs in 1 suit
    for (const s of numSuits) {
      const pVals = hand.melds
        .filter(m => m.type !== 'sequence' && meldSuit(m) === s)
        .map(m => val(m.tiles[0])).sort((a,b)=>a-b);
      for (let i = 0; i + 2 < pVals.length; i++) {
        if (pVals[i+1] === pVals[i]+1 && pVals[i+2] === pVals[i]+2) return true;
      }
    }
    return false;
  },

  shuang_long_bao(hand) {
    // 2 pairs of identical sequences: 123+123+456+456
    const seqKey = m => meldSuit(m) + m.tiles.map(val).sort((a,b)=>a-b).join();
    const keys = hand.melds.filter(m => m.type === 'sequence').map(seqKey);
    const seen = {};
    for (const k of keys) seen[k] = (seen[k] || 0) + 1;
    const pairs = Object.values(seen).filter(c => c >= 2).length;
    return pairs >= 2;
  },

  // Special Hands
  wu_men_qi(hand) {
    const suits = suitsInHand(hand);
    return ['b','m','p','z'].every(s => suits.has(s));
  },

  hun_yi_se(hand) {
    return allOneSuitPlusHonors(hand);
  },

  qing_yi_se(hand) {
    return allSameSuit(hand);
  },

  // Wildcards
  wu_bao(hand) {
    return hand.conditions.wildcards === 0;
  },

  si_bao(hand) {
    return hand.conditions.wildcards >= 4;
  }
};

// ── Main Score Calculator ─────────────────────────────────────────────────────

let _rules = null;

async function loadRules() {
  if (_rules) return _rules;
  const res = await fetch('./data/scoring.csv');
  const text = await res.text();
  _rules = parseCSV(text);
  return _rules;
}

function calculateScore(hand, rules) {
  // Strip empty meld slots so detectors only see assigned melds
  hand = { ...hand, melds: hand.melds.filter(m => m.tiles.length > 0) };
  const c = hand.conditions;
  const rows = [];
  let total = 0;

  // Track which rules fired to apply exclusions
  const fired = new Set();

  // Evaluate each rule
  for (const rule of rules) {
    const { id, condition_type, fan: fanStr, notes } = rule;
    const fanBase = Number(fanStr) || 0;
    let fanEarned = 0;

    if (condition_type === 'auto') {
      const detector = detectors[id];
      if (!detector) continue;
      const result = detector(hand);
      if (typeof result === 'number') {
        fanEarned = result * fanBase;
      } else if (result) {
        fanEarned = fanBase;
      }
      if (fanEarned > 0) fired.add(id);

    } else if (condition_type === 'manual') {
      // Manual conditions mapped from hand.conditions
      const manualMap = {
        flower_7steal:   c.flowerSpecial === 'flower_7steal',
        flower_8win:     c.flowerSpecial === 'flower_8win',
        shi_san_yao:     c.shiSanYao,
        dealer:          c.dealer,
        zi_mo:           c.wonFrom === 'self' && !c.menQing,
        men_qing_zi_mo:  c.wonFrom === 'self' && c.menQing,
        yi_du:           c.winType === 'yi_du',
        dui_peng:        c.winType === 'dui_peng',
        du_du:           c.winType === 'du_du',
        qiang_gang:      c.winType === 'qiang_gang',
        gang_shang_gang: c.winType === 'gang_shang_gang',
        ban_qiu:         c.allFrontType === 'ban_qiu',
        quan_qiu:        c.allFrontType === 'quan_qiu',
        tian_ting:       c.instantWin === 'tian_ting',
        tian_hu:         c.instantWin === 'tian_hu',
        di_hu:           c.instantWin === 'di_hu',
        ni_gu_ni_gu:     c.niGu,
        mo_bao:          c.moBao,
        bao_gui_wei:     c.baoGuiWei
      };
      if (manualMap[id]) {
        fanEarned = fanBase;
        fired.add(id);
      }

    } else if (condition_type === 'count') {
      const fanPer = Number((notes.match(/fan_per=(\d+)/) || [])[1] || 1);
      let cnt = 0;
      if (id === 'flower_each')   cnt = c.flowerCount;
      if (id === 'dealer_streak') cnt = c.dealerStreak;
      if (id === 'ming_gang')     cnt = hand.melds.filter(m => m.type === 'kang' && !m.concealed).length;
      if (id === 'an_gang')       cnt = hand.melds.filter(m => m.type === 'kang' && m.concealed).length;
      if (id === 'yi_bao')        cnt = c.wildcards;
      fanEarned = cnt * fanPer;
      if (fanEarned > 0) fired.add(id);
    }

    rows.push({ ...rule, fanEarned });
    total += fanEarned;
  }

  // ── Mutual Exclusions ────────────────────────────────────────────────────
  // Apply after first pass — zero out superseded rules

  function suppress(id) {
    const row = rows.find(r => r.id === id);
    if (row && row.fanEarned > 0) { total -= row.fanEarned; row.fanEarned = 0; }
  }

  // 清一色 supersedes 混一色
  if (fired.has('qing_yi_se')) suppress('hun_yi_se');

  // 全幺 supersedes 全帶幺 and 混幺
  if (fired.has('quan_yao')) { suppress('quan_dai_yao'); suppress('hun_yao'); }

  // 全帶幺 supersedes 混幺
  if (fired.has('quan_dai_yao')) suppress('hun_yao');

  // 大三元 supersedes 小三元
  if (fired.has('da_san_yuan')) suppress('xiao_san_yuan');

  // 大四喜 supersedes 小四喜, 大三風, 小三風
  if (fired.has('da_si_xi')) { suppress('xiao_si_xi'); suppress('da_san_feng'); suppress('xiao_san_feng'); }

  // 小四喜 supersedes 大三風, 小三風
  if (fired.has('xiao_si_xi')) { suppress('da_san_feng'); suppress('xiao_san_feng'); }

  // 大三風 supersedes 小三風
  if (fired.has('da_san_feng')) suppress('xiao_san_feng');

  // 大平 supersedes 小平 (da_ping already requires no flowers, xiao_ping requires flowers — mutually exclusive by logic, but enforce)
  if (fired.has('da_ping')) suppress('xiao_ping');

  // 五暗楷 supersedes lower an_ke counts
  if (fired.has('wu_an_ke')) { suppress('si_an_ke'); suppress('san_an_ke'); suppress('er_an_ke'); }
  else if (fired.has('si_an_ke')) { suppress('san_an_ke'); suppress('er_an_ke'); }
  else if (fired.has('san_an_ke')) suppress('er_an_ke');

  // 四寶 supersedes 一寶 count
  if (fired.has('si_bao')) suppress('yi_bao');

  // 無字無花 supersedes 無字 and 無花
  if (fired.has('wu_zi_wu_hua')) { suppress('wu_zi'); suppress('flower_none'); }

  // 門清自摸 supersedes 自摸
  if (fired.has('men_qing_zi_mo')) suppress('zi_mo');

  // zi_pung (字) is per-pung via auto detector returning count — fanEarned already reflects that
  // No suppression needed there.

  return { total, rows };
}
