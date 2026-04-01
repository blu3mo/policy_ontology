import graphData from './graph.js';
import config from './config.js';

// ── Constants ──────────────────────────────────────────────────────────────
export const CANVAS_WIDTH = 1100;

// Year range from config
export const YEAR_START = config.yearStart;
export const YEAR_END = config.yearEnd;
export const YEARS = Array.from({ length: YEAR_END - YEAR_START + 1 }, (_, i) => YEAR_START + i);

// Canvas height: each year gets ~300px, plus padding
export const PX_PER_YEAR = 300;
export const CANVAS_TOP_PAD = 60;
export const CANVAS_HEIGHT = (YEAR_END - YEAR_START + 1) * PX_PER_YEAR + CANVAS_TOP_PAD + 80;

// Card sizes by tier
export const CARD_SIZES = {
  hero:  { w: 300, h: 68 },
  major: { w: 250, h: 52 },
  minor: { w: 210, h: 40 },
};

// Minimum vertical gap between cards in same lane
export const MIN_GAP = 8;

// Domain colors (left border bar color + lane bg tint)
export const DOMAIN_COLORS = {
  '社会的外部要因':    { border: '#f59e0b', bg: '#fffbeb', lane: 0 },
  '制度への入力・反応': { border: '#8b5cf6', bg: '#f5f3ff', lane: 1 },
  '公式制度過程':      { border: '#2563eb', bg: '#eff6ff', lane: 2 },
};

export const DOMAIN_LABELS = {
  '社会的外部要因':    '社会的外部要因',
  '制度への入力・反応': '制度への入力・反応',
  '公式制度過程':      '公式制度過程',
};

// Lane x-centers (3 lanes)
export const LANE_CENTERS = [
  Math.round(CANVAS_WIDTH * 0.18),  // lane 0: 社会的外部要因
  Math.round(CANVAS_WIDTH * 0.50),  // lane 1: 制度への入力・反応
  Math.round(CANVAS_WIDTH * 0.82),  // lane 2: 公式制度過程
];
export const LANE_WIDTH = Math.round(CANVAS_WIDTH * 0.30);

// Relation type → edge priority (1=highest, 6=lowest)
export const RELATION_PRIORITY = {
  '発端となる':          1,
  '実施する':            1,
  '制度的に引き継ぐ':    2,
  '改正する':            2,
  '修正する':            2,
  '応答する':            2,
  '社会的圧力となる':    3,
  '制度外要因として影響する': 3,
  '海外動向として参照される': 3,
  '業界対応を促す':      3,
  '被害・事故を受けて生じる': 3,
  '統計・需給・価格変動を受けて生じる': 3,
  '同一制度過程クラスター': 4,
  '同一案件クラスター':  4,
  '調査する':            4,
  '批判する':            4,
  '支持する':            4,
  '反論する':            4,
  '国会フォローアップ':  4,
  '自治体先行事例となる': 4,
  '司法上の進展':        4,
  '言及する':            5,
  '報道上の反応':        6,
};

export const EDGE_COLORS = {
  1: '#ef4444', // red – causal
  2: '#2563eb', // blue – institutional chain
  3: '#8b5cf6', // purple – external influence
  4: '#64748b', // slate – cluster
  5: '#94a3b8', // light slate – mention
  6: '#cbd5e1', // very light – news
};

// ── Degree computation ─────────────────────────────────────────────────────
export function computeDegrees() {
  const deg = {};
  graphData.nodes.forEach(n => { deg[n.id] = 0; });
  graphData.edges.forEach(e => {
    deg[e.source] = (deg[e.source] || 0) + 1;
    deg[e.target] = (deg[e.target] || 0) + 1;
  });
  return deg;
}

// ── Tier from degree ───────────────────────────────────────────────────────
export function getTier(degree) {
  if (degree >= 6) return 'hero';
  if (degree >= 4) return 'major';
  return 'minor';
}

// ── Date string → decimal year ─────────────────────────────────────────────
export function dateToYear(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(Number);
  const year = parts[0];
  const month = parts[1] || 6;
  const day = parts[2] || 15;
  return year + (month - 1) / 12 + (day - 1) / 365;
}

// ── Year → Y pixel on canvas ───────────────────────────────────────────────
export function yearToY(decimalYear) {
  return CANVAS_TOP_PAD + (decimalYear - YEAR_START) * PX_PER_YEAR;
}

// ── Layout computation ─────────────────────────────────────────────────────
export function computeLayout() {
  const degrees = computeDegrees();

  // Assign tier and base position
  const positioned = graphData.nodes.map(node => {
    const degree = degrees[node.id] || 0;
    const tier = getTier(degree);
    const { w, h } = CARD_SIZES[tier];
    const domainInfo = DOMAIN_COLORS[node.domain] || { lane: 1 };
    const laneIdx = domainInfo.lane;
    const decYear = dateToYear(node.date);
    const baseY = decYear !== null ? yearToY(decYear) : CANVAS_TOP_PAD;

    return {
      ...node,
      degree,
      tier,
      w,
      h,
      laneIdx,
      decYear,
      x: LANE_CENTERS[laneIdx],
      y: baseY,
    };
  });

  // Per-lane overlap resolution
  const lanes = [0, 1, 2];
  lanes.forEach(laneIdx => {
    const inLane = positioned
      .filter(n => n.laneIdx === laneIdx)
      .sort((a, b) => a.y - b.y);

    // Phase 1: push down
    for (let i = 1; i < inLane.length; i++) {
      const prev = inLane[i - 1];
      const curr = inLane[i];
      const minY = prev.y + prev.h + MIN_GAP;
      if (curr.y < minY) {
        curr.y = minY;
      }
    }

    // Phase 2: x-axis zigzag within clusters
    const clusterThresh = 90; // px
    let i = 0;
    while (i < inLane.length) {
      let j = i + 1;
      while (j < inLane.length && inLane[j].y - inLane[i].y < clusterThresh) {
        j++;
      }
      const cluster = inLane.slice(i, j);
      const laneCenter = LANE_CENTERS[laneIdx];
      const laneW = LANE_WIDTH;

      if (cluster.length === 1) {
        cluster[0].x = laneCenter;
      } else if (cluster.length === 2) {
        const jitter = cluster[0].tier === 'hero' ? 0.06 : 0.08;
        cluster[0].x = laneCenter - Math.round(laneW * jitter);
        cluster[1].x = laneCenter + Math.round(laneW * jitter);
      } else {
        // Sort by degree desc, place highest in center
        cluster.sort((a, b) => b.degree - a.degree);
        const spread = 0.11;
        const step = cluster.length > 1 ? (laneW * spread * 2) / (cluster.length - 1) : 0;
        cluster.forEach((node, k) => {
          node.x = laneCenter - Math.round(laneW * spread) + Math.round(step * k);
        });
      }
      i = j;
    }
  });

  // Build lookup map
  const nodeMap = {};
  positioned.forEach(n => { nodeMap[n.id] = n; });

  // Process edges with priority
  const processedEdges = graphData.edges.map(e => {
    const priority = RELATION_PRIORITY[e.relation_type] || 5;
    return { ...e, priority };
  });

  return { nodes: positioned, nodeMap, edges: processedEdges };
}

export const layout = computeLayout();
