import React, { useMemo, useRef } from 'react';
import {
  layout,
  CANVAS_WIDTH,
  YEARS,
  CARD_SIZES,
  DOMAIN_COLORS,
  LANE_CENTERS,
  EDGE_COLORS,
  RELATION_PRIORITY,
  ACTUAL_BANDS,
  ACTUAL_CANVAS_HEIGHT,
} from './data/layout.js';

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[1] && parts[2] && parts[2] !== '01') {
    return `${parts[0]}/${parseInt(parts[1])}/${parseInt(parts[2])}`;
  } else if (parts.length >= 2) {
    return `${parts[0]}/${parseInt(parts[1])}`;
  }
  return parts[0];
}

export default function TimelineViz({
  viewOffset,
  revealedIds,
  focusNodes,
  hoveredId,
  selectedId,
  onNodeHover,
  onNodeClick,
  narrativeMode,
  showEdgesForStep,
  viewportHeight,
  mobileScale = 1,
}) {
  const svgRef = useRef(null);

  const visibleNodeIds = useMemo(() => {
    if (!narrativeMode) return new Set(layout.nodes.map(n => n.id));
    return new Set(revealedIds || []);
  }, [narrativeMode, revealedIds]);

  // Connected node IDs for the hovered node
  const connectedIds = useMemo(() => {
    if (!hoveredId) return null;
    const ids = new Set([hoveredId]);
    layout.edges.forEach(e => {
      if (e.source === hoveredId) ids.add(e.target);
      if (e.target === hoveredId) ids.add(e.source);
    });
    return ids;
  }, [hoveredId]);

  // Edges to show based on mode and hover state
  const { bgEdges, fgEdges } = useMemo(() => {
    const bg = [];
    const fg = [];

    if (!showEdgesForStep && narrativeMode && !hoveredId) {
      return { bgEdges: [], fgEdges: [] };
    }

    layout.edges.forEach(edge => {
      const srcVisible = visibleNodeIds.has(edge.source);
      const tgtVisible = visibleNodeIds.has(edge.target);
      if (!srcVisible || !tgtVisible) return;

      const priority = RELATION_PRIORITY[edge.relation_type] || 5;
      const color = EDGE_COLORS[priority] || EDGE_COLORS[5];

      const srcNode = layout.nodeMap[edge.source];
      const tgtNode = layout.nodeMap[edge.target];
      if (!srcNode || !tgtNode) return;

      const edgeData = {
        ...edge,
        priority,
        color,
        x1: srcNode.x,
        y1: srcNode.y,
        x2: tgtNode.x,
        y2: tgtNode.y,
      };

      if (hoveredId) {
        if (edge.source === hoveredId || edge.target === hoveredId) {
          fg.push(edgeData);
        }
      } else {
        // In narrative mode with showEdgesForStep: show priority 1-3
        // In explore mode: show all priority 1-4
        if (narrativeMode) {
          if (priority <= 3) bg.push(edgeData);
        } else {
          if (priority <= 4) bg.push(edgeData);
        }
      }
    });

    return { bgEdges: bg, fgEdges: fg };
  }, [visibleNodeIds, hoveredId, showEdgesForStep, narrativeMode]);

  const markerIds = useMemo(() => {
    const seen = new Set();
    const all = [...bgEdges, ...fgEdges];
    all.forEach(e => {
      const key = `${e.priority}`;
      seen.add(key);
    });
    return Array.from(seen);
  }, [bgEdges, fgEdges]);

  return (
    <div className="timeline-container">
      {/* Sticky lane headers (outside scrolling inner) */}
      {narrativeMode && (
        <div className="lane-headers-sticky">
          {Object.entries(DOMAIN_COLORS).map(([domain, info]) => {
            const x = LANE_CENTERS[info.lane] * mobileScale;
            return (
              <div
                key={domain}
                className="lane-header"
                style={{
                  left: x,
                  background: info.bg,
                  color: info.border,
                  border: `1px solid ${info.border}33`,
                }}
              >
                {domain}
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: 'top left',
          transform: mobileScale !== 1 ? `scale(${mobileScale})` : undefined,
        }}
      >
      <div
        className="timeline-inner"
        style={{
          width: CANVAS_WIDTH,
          height: ACTUAL_CANVAS_HEIGHT,
          transform: `translateY(${-viewOffset}px)`,
        }}
      >
        {/* Year bands */}
        {YEARS.map(year => {
          const { start, end } = ACTUAL_BANDS[year];
          const isEven = year % 2 === 0;
          return (
            <div
              key={year}
              className={`year-band ${isEven ? 'even' : 'odd'}`}
              style={{ top: start, height: end - start }}
            />
          );
        })}

        {/* Year labels */}
        {YEARS.map(year => (
          <div key={`lbl-${year}`} className="year-label" style={{ top: ACTUAL_BANDS[year].start + 4 }}>
            {year}
          </div>
        ))}

        {/* Lane headers (in-canvas, for explore mode) */}
        {!narrativeMode && Object.entries(DOMAIN_COLORS).map(([domain, info]) => {
          const x = LANE_CENTERS[info.lane];
          return (
            <div
              key={domain}
              className="lane-header"
              style={{
                left: x,
                top: 0,
                background: info.bg,
                color: info.border,
                border: `1px solid ${info.border}33`,
              }}
            >
              {domain}
            </div>
          );
        })}

        {/* Background edge SVG */}
        <svg
          className="edges-bg"
          width={CANVAS_WIDTH}
          height={ACTUAL_CANVAS_HEIGHT}
          style={{ pointerEvents: 'none' }}
        >
          <defs>
            {markerIds.map(pri => (
              <marker
                key={`marker-bg-${pri}`}
                id={`arrow-bg-${pri}`}
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill={EDGE_COLORS[parseInt(pri)] || '#94a3b8'} fillOpacity="0.6" />
              </marker>
            ))}
          </defs>
          {bgEdges.map(edge => (
            <line
              key={edge.id}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke={edge.color}
              strokeWidth={edge.priority <= 2 ? 1.5 : 1}
              strokeOpacity={0.35}
              strokeDasharray={edge.priority >= 4 ? '4,3' : undefined}
              markerEnd={`url(#arrow-bg-${edge.priority})`}
              style={{ pointerEvents: 'none' }}
            />
          ))}
        </svg>

        {/* Event nodes */}
        {layout.nodes.map(node => {
          const visible = visibleNodeIds.has(node.id);
          if (!visible) return null;

          const domainInfo = DOMAIN_COLORS[node.domain] || { border: '#64748b', bg: '#f8fafc' };
          const { w, h } = CARD_SIZES[node.tier];
          const isDimmed = connectedIds ? !connectedIds.has(node.id) : false;
          const isHighlighted = hoveredId === node.id;
          const isFocused = focusNodes?.includes(node.id);
          const isSelected = selectedId === node.id;
          const hasFocusNodes = focusNodes && focusNodes.length > 0;
          const isDefocused = hasFocusNodes && !isFocused && !isHighlighted && !isSelected && !isDimmed;

          let cls = `event-node ${node.tier}`;
          if (isDimmed) cls += ' dimmed';
          else if (isDefocused) cls += ' defocused';
          if (isHighlighted || isSelected) cls += ' highlighted';
          else if (isFocused) cls += ' focused';

          return (
            <div
              key={node.id}
              className={cls}
              style={{
                left: node.x,
                top: node.y,
                width: w,
                height: h,
              }}
              onMouseEnter={(e) => {
                e.stopPropagation();
                onNodeHover && onNodeHover(node.id, e);
              }}
              onMouseLeave={() => onNodeHover && onNodeHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                onNodeClick && onNodeClick(node);
              }}
            >
              <div
                className="node-color-bar"
                style={{ background: domainInfo.border, borderRadius: '5px 0 0 5px' }}
              />
              <div className="node-content">
                {node.tier !== 'minor' && (
                  <div className="node-date">{formatDateShort(node.date)}</div>
                )}
                <div className="node-title">{node.label}</div>
              </div>
            </div>
          );
        })}

        {/* Foreground edge SVG (hover highlights) */}
        <svg
          className="edges-fg"
          width={CANVAS_WIDTH}
          height={ACTUAL_CANVAS_HEIGHT}
          style={{ pointerEvents: 'none' }}
        >
          <defs>
            {markerIds.map(pri => (
              <marker
                key={`marker-fg-${pri}`}
                id={`arrow-fg-${pri}`}
                markerWidth="7"
                markerHeight="7"
                refX="5"
                refY="3.5"
                orient="auto"
              >
                <path d="M0,0 L7,3.5 L0,7 Z" fill={EDGE_COLORS[parseInt(pri)] || '#94a3b8'} />
              </marker>
            ))}
          </defs>
          {fgEdges.map(edge => (
            <line
              key={`fg-${edge.id}`}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke={edge.color}
              strokeWidth={2.5}
              strokeOpacity={0.9}
              markerEnd={`url(#arrow-fg-${edge.priority})`}
              style={{ pointerEvents: 'none' }}
            />
          ))}
        </svg>
      </div>
      </div>
    </div>
  );
}
