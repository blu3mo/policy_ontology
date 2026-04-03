import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import TimelineViz from './TimelineViz.jsx';
import DetailPanel from './DetailPanel.jsx';
import OrgNetwork from './OrgNetwork.jsx';
import narrativeSteps from './data/narrative.js';
import config from './data/config.js';
import networkData from './data/network.js';
import {
  layout,
  ACTUAL_BANDS,
  ACTUAL_CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CARD_SIZES,
  DOMAIN_COLORS,
  LANE_CENTERS,
  EDGE_COLORS,
  RELATION_PRIORITY,
  YEARS,
  YEAR_START,
  YEAR_END,
  yearToY,
  dateToYear,
} from './data/layout.js';

const VIEWPORT_HEIGHT_OFFSET = 52; // header height (desktop)
const MOBILE_BREAKPOINT = 640;
const MOBILE_HEADER_H = 44;

// ── Tooltip component ──────────────────────────────────────────────────────
function Tooltip({ node, mouseX, mouseY }) {
  if (!node) return null;
  const domainInfo = DOMAIN_COLORS[node.domain] || { border: '#64748b', bg: '#f8fafc' };
  const summary = node.summary ? node.summary.slice(0, 200) + (node.summary.length > 200 ? '…' : '') : '';
  const confVal = typeof node.confidence === 'number' ? node.confidence : 0.75;

  const style = {
    left: Math.min(mouseX + 16, window.innerWidth - 300),
    top: Math.min(mouseY + 10, window.innerHeight - 200),
    opacity: 1,
  };

  return (
    <div className="tooltip" style={style}>
      <div
        className="tooltip-domain"
        style={{ background: domainInfo.bg, color: domainInfo.border, border: `1px solid ${domainInfo.border}33` }}
      >
        {node.domain}
      </div>
      <div className="tooltip-date">{node.date_text || node.date}</div>
      <div className="tooltip-title">{node.label}</div>
      {summary && <div className="tooltip-summary">{summary}</div>}
      <div className="tooltip-confidence">信頼度: {Math.round(confVal * 100)}%</div>
    </div>
  );
}

// ── Mini position indicator ─────────────────────────────────────────────────
function MiniBar({ viewOffset, canvasHeight, viewportH }) {
  const totalScroll = canvasHeight - viewportH;
  if (totalScroll <= 0) return null;
  const pct = Math.min(Math.max(viewOffset / totalScroll, 0), 1);
  const barH = 160;
  const thumbH = Math.max(20, barH * (viewportH / canvasHeight));
  const thumbTop = pct * (barH - thumbH);
  return (
    <div className="mini-bar">
      <div className="mini-bar-thumb" style={{ top: thumbTop, height: thumbH }} />
    </div>
  );
}

// ── Explore Mode Overlay ────────────────────────────────────────────────────
function ExploreMode({ onClose, onSelectNode, onNavigateToOrg, initialNodeId }) {
  const isMobInit = window.innerWidth <= MOBILE_BREAKPOINT;
  const defaultScale = isMobInit ? Math.min(0.95, window.innerWidth / CANVAS_WIDTH) : 0.72;
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(defaultScale);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [pinnedId, setPinnedId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const wrapRef = useRef(null);
  // Refs to read current values inside stable callbacks
  const scaleRef = useRef(defaultScale);
  const offsetRef = useRef({ x: 0, y: 0 });
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  // On mount: center on initialNode, or default to most recent event
  useEffect(() => {
    const targetScale = scaleRef.current;
    const viewW = window.innerWidth;
    const headerH = window.innerWidth <= MOBILE_BREAKPOINT ? MOBILE_HEADER_H : 52;
    const viewH = window.innerHeight - headerH;

    if (initialNodeId) {
      const node = layout.nodeMap[initialNodeId];
      if (node) {
        setSelectedNode(node);
        setPinnedId(node.id);
        setScale(targetScale);
        setOffset({
          x: -(node.x * targetScale - viewW / 2),
          y: -(node.y * targetScale - viewH / 2),
        });
        return;
      }
    }
    // Default: scroll to the most recent event
    const latest = layout.nodes.reduce((a, b) =>
      (b.date || '') > (a.date || '') ? b : a, layout.nodes[0]);
    if (latest) {
      setScale(targetScale);
      setOffset({
        x: -(latest.x * targetScale - viewW / 2),
        y: -(latest.y * targetScale - viewH / 2),
      });
    }
  }, []); // run once on mount

  const domains = Object.keys(DOMAIN_COLORS);

  const filteredNodes = useMemo(() => {
    return layout.nodes.filter(n => {
      if (activeFilter && n.domain !== activeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          n.label.toLowerCase().includes(q) ||
          (n.summary || '').toLowerCase().includes(q) ||
          (n.organizations || []).some(o => o.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [search, activeFilter]);

  const filteredIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes]);

  const activeHighlightId = pinnedId || hoveredId;
  const connectedIds = useMemo(() => {
    if (!activeHighlightId) return null;
    const ids = new Set([activeHighlightId]);
    layout.edges.forEach(e => {
      if (e.source === activeHighlightId) ids.add(e.target);
      if (e.target === activeHighlightId) ids.add(e.source);
    });
    return ids;
  }, [activeHighlightId]);

  const edgesToShow = useMemo(() => {
    if (activeHighlightId) {
      return layout.edges.filter(e =>
        (e.source === activeHighlightId || e.target === activeHighlightId) &&
        filteredIds.has(e.source) && filteredIds.has(e.target)
      );
    }
    return layout.edges.filter(e => {
      const priority = RELATION_PRIORITY[e.relation_type] || 5;
      return priority <= 3 && filteredIds.has(e.source) && filteredIds.has(e.target);
    });
  }, [activeHighlightId, filteredIds]);

  const onPointerDown = useCallback((e) => {
    if (e.target.closest('.event-node') || e.target.closest('.detail-panel') || e.target.closest('.explore-zoom-controls')) return;
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [offset]);

  const onPointerMove = useCallback((e) => {
    setMouse({ x: e.clientX, y: e.clientY });
    if (!dragging || !dragStart) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [dragging, dragStart]);

  const onPointerUp = useCallback(() => {
    setDragging(false);
    setDragStart(null);
  }, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Pinch-zoom on trackpad (or Ctrl+wheel)
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = 1 - e.deltaY * 0.01;
      const prevScale = scaleRef.current;
      const prevOffset = offsetRef.current;
      const newScale = Math.min(Math.max(prevScale * factor, 0.25), 2.0);
      const newOffsetX = mx - (mx - prevOffset.x) * (newScale / prevScale);
      const newOffsetY = my - (my - prevOffset.y) * (newScale / prevScale);
      scaleRef.current = newScale;
      offsetRef.current = { x: newOffsetX, y: newOffsetY };
      setScale(newScale);
      setOffset({ x: newOffsetX, y: newOffsetY });
    } else {
      // Regular scroll → pan
      const prevOffset = offsetRef.current;
      const newOffsetY = prevOffset.y - e.deltaY;
      const newOffsetX = prevOffset.x - (e.deltaX || 0);
      offsetRef.current = { x: newOffsetX, y: newOffsetY };
      setOffset({ x: newOffsetX, y: newOffsetY });
    }
  }, []);

  const zoomBy = useCallback((factor) => {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight - (window.innerWidth <= MOBILE_BREAKPOINT ? MOBILE_HEADER_H : 52);
    const cx = viewW / 2;
    const cy = viewH / 2;
    const prevScale = scaleRef.current;
    const prevOffset = offsetRef.current;
    const newScale = Math.min(Math.max(prevScale * factor, 0.25), 2.0);
    const newOffsetX = cx - (cx - prevOffset.x) * (newScale / prevScale);
    const newOffsetY = cy - (cy - prevOffset.y) * (newScale / prevScale);
    scaleRef.current = newScale;
    offsetRef.current = { x: newOffsetX, y: newOffsetY };
    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const formatDateShort = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return parts.length >= 2 ? `${parts[0]}/${parseInt(parts[1])}` : parts[0];
  };

  return (
    <div className="explore-overlay">
      {/* Header */}
      <div className="explore-header">
        <h2>探索モード</h2>
        <input
          className="explore-search"
          placeholder="イベント・組織・キーワードで検索..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="explore-filter-chips">
          {domains.map(d => {
            const info = DOMAIN_COLORS[d];
            return (
              <button
                key={d}
                className={`filter-chip ${activeFilter === d ? 'active' : ''}`}
                style={activeFilter === d ? { background: info.border, borderColor: info.border } : {}}
                onClick={() => setActiveFilter(prev => prev === d ? null : d)}
              >
                {d}
              </button>
            );
          })}
        </div>
        <div className="explore-legend">
          <span className="legend-item">
            <span className="legend-dot" style={{ background: EDGE_COLORS[1] }} />発端・実施
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: EDGE_COLORS[2] }} />制度的連鎖
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: EDGE_COLORS[3] }} />外部影響
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="explore-canvas-wrap"
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={(e) => {
          if (!e.target.closest('.event-node') && !e.target.closest('.detail-panel')) {
            setSelectedNode(null);
            setPinnedId(null);
          }
        }}
      >
        <div
          className="explore-canvas"
          style={{
            width: CANVAS_WIDTH,
            height: ACTUAL_CANVAS_HEIGHT,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        >
          {/* Year bands + labels */}
          {YEARS.map(year => {
            const { start, end } = ACTUAL_BANDS[year];
            return (
              <React.Fragment key={year}>
                <div
                  className={`year-band ${year % 2 === 0 ? 'even' : 'odd'}`}
                  style={{ top: start, height: end - start }}
                />
                <div className="year-label" style={{ top: start + 4 }}>{year}</div>
              </React.Fragment>
            );
          })}

          {/* Lane headers */}
          {Object.entries(DOMAIN_COLORS).map(([domain, info]) => (
            <div
              key={domain}
              className="lane-header"
              style={{ left: LANE_CENTERS[info.lane], top: 0, background: info.bg, color: info.border, border: `1px solid ${info.border}33` }}
            >
              {domain}
            </div>
          ))}

          {/* Edges */}
          <svg
            style={{ position: 'absolute', top: 0, left: 0, width: CANVAS_WIDTH, height: ACTUAL_CANVAS_HEIGHT, pointerEvents: 'none', zIndex: 3 }}
          >
            <defs>
              {[1,2,3,4,5].map(pri => (
                <marker key={pri} id={`exp-arrow-${pri}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill={EDGE_COLORS[pri]} fillOpacity={activeHighlightId ? (edgesToShow.some(e => (RELATION_PRIORITY[e.relation_type]||5) === pri) ? 1 : 0.2) : 0.6} />
                </marker>
              ))}
            </defs>
            {edgesToShow.map(edge => {
              const src = layout.nodeMap[edge.source];
              const tgt = layout.nodeMap[edge.target];
              if (!src || !tgt) return null;
              const priority = RELATION_PRIORITY[edge.relation_type] || 5;
              const color = EDGE_COLORS[priority];
              const isActive = activeHighlightId && (edge.source === activeHighlightId || edge.target === activeHighlightId);
              return (
                <line
                  key={edge.id}
                  x1={src.x} y1={src.y}
                  x2={tgt.x} y2={tgt.y}
                  stroke={color}
                  strokeWidth={isActive ? 2.5 : 1.2}
                  strokeOpacity={activeHighlightId ? (isActive ? 0.9 : 0.1) : 0.4}
                  strokeDasharray={priority >= 4 ? '4,3' : undefined}
                  markerEnd={`url(#exp-arrow-${priority})`}
                  style={{ pointerEvents: 'none' }}
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {layout.nodes.map(node => {
            const inFilter = filteredIds.has(node.id);
            if (!inFilter) return null;
            const domainInfo = DOMAIN_COLORS[node.domain] || { border: '#64748b', bg: '#f8fafc' };
            const { w, h } = CARD_SIZES[node.tier];
            const isDimmed = connectedIds ? !connectedIds.has(node.id) : false;
            const isHovered = hoveredId === node.id;
            const isSelected = selectedNode?.id === node.id;

            let cls = `event-node ${node.tier}`;
            if (isDimmed) cls += ' dimmed';
            if (isHovered || isSelected) cls += ' highlighted';

            return (
              <div
                key={node.id}
                className={cls}
                style={{ left: node.x, top: node.y, width: w, height: h }}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNode(prev => {
                    const next = prev?.id === node.id ? null : node;
                    setPinnedId(next ? node.id : null);
                    return next;
                  });
                  if (onSelectNode) onSelectNode(node);
                }}
              >
                <div className="node-color-bar" style={{ background: domainInfo.border, borderRadius: '5px 0 0 5px' }} />
                <div className="node-content">
                  {node.tier !== 'minor' && <div className="node-date">{formatDateShort(node.date)}</div>}
                  <div className="node-title">{node.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Zoom controls */}
        <div className="explore-zoom-controls">
          <button className="zoom-btn" onClick={() => zoomBy(1.3)} title="ズームイン">+</button>
          <button className="zoom-btn" onClick={() => zoomBy(1 / 1.3)} title="ズームアウト">−</button>
        </div>

        {/* Tooltip */}
        {hoveredId && (() => {
          const n = layout.nodeMap[hoveredId];
          return n ? <Tooltip node={n} mouseX={mouse.x} mouseY={mouse.y} /> : null;
        })()}
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <DetailPanel
          node={selectedNode}
          onClose={() => { setSelectedNode(null); setPinnedId(null); }}
          onNavigate={(id) => {
            const n = layout.nodeMap[id];
            if (n) setSelectedNode(n);
          }}
          onNavigateToOrg={onNavigateToOrg}
        />
      )}
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [activeStep, setActiveStep] = useState(-1);
  const [viewMode, setViewMode] = useState('story');
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAKPOINT);
  const [viewportH, setViewportH] = useState(
    window.innerHeight - (window.innerWidth <= MOBILE_BREAKPOINT ? MOBILE_HEADER_H : VIEWPORT_HEIGHT_OFFSET)
  );
  const [pendingEventId, setPendingEventId] = useState(null);
  const [expandedSteps, setExpandedSteps] = useState(new Set());

  const mobileScale = isMobile ? Math.min(1, window.innerWidth / CANVAS_WIDTH) : 1;

  const stepRefs = useRef([]);
  const heroRef = useRef(null);
  const observerRef = useRef(null);
  const prevViewOffsetRef = useRef(0);

  // Cumulative revealed node IDs up to active step
  const revealedIds = useMemo(() => {
    if (activeStep < 0) return [];
    const ids = new Set();
    for (let i = 0; i <= activeStep; i++) {
      const step = narrativeSteps[i];
      if (step?.revealNodes) {
        step.revealNodes.forEach(id => ids.add(id));
      }
    }
    return Array.from(ids);
  }, [activeStep]);

  const currentStep = narrativeSteps[activeStep];

  // Camera position: center on timeCenter, then nudge to ensure focusNodes are visible
  // Summary steps (no focusNodes + no revealNodes) keep the previous view position.
  // On mobile the timeline is scaled down, so we use effectiveVH (original-coord viewport height).
  const viewOffset = useMemo(() => {
    const step = narrativeSteps[activeStep];
    if (!step?.timeCenter) return prevViewOffsetRef.current;

    const isSummaryStep = (!step.focusNodes || step.focusNodes.length === 0)
      && (!step.revealNodes || step.revealNodes.length === 0);
    if (isSummaryStep) return prevViewOffsetRef.current;

    const effectiveVH = mobileScale !== 1 ? viewportH / mobileScale : viewportH;
    const y = yearToY(step.timeCenter);
    let target = y - effectiveVH / 2;

    // Ensure focusNodes (not all revealNodes) are in viewport — they are few and close together
    const focusYs = (step.focusNodes || [])
      .map(id => layout.nodeMap[id])
      .filter(Boolean)
      .map(n => n.y);

    if (focusYs.length > 0) {
      const pad = 80;
      const minFocusY = Math.min(...focusYs);
      const maxFocusY = Math.max(...focusYs);
      if (minFocusY < target + pad) target = minFocusY - pad;
      if (maxFocusY > target + effectiveVH - pad) target = maxFocusY - effectiveVH + pad;
    }

    const result = Math.max(0, Math.min(target, ACTUAL_CANVAS_HEIGHT - effectiveVH));
    prevViewOffsetRef.current = result;
    return result;
  }, [activeStep, viewportH, mobileScale]);

  // IntersectionObserver for scroll steps
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = parseInt(entry.target.dataset.stepIdx, 10);
            if (!isNaN(idx)) setActiveStep(idx);
          }
        });
      },
      { threshold: 0.15, rootMargin: '-15% 0px -30% 0px' }
    );
    if (heroRef.current) observerRef.current.observe(heroRef.current);
    stepRefs.current.forEach(ref => {
      if (ref) observerRef.current.observe(ref);
    });
    return () => observerRef.current?.disconnect();
  }, []);

  useEffect(() => {
    const handle = () => {
      const mob = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mob);
      setViewportH(window.innerHeight - (mob ? MOBILE_HEADER_H : VIEWPORT_HEIGHT_OFFSET));
    };
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  // Clear pendingEventId when leaving explore mode
  useEffect(() => {
    if (viewMode !== 'explore' && pendingEventId) {
      setPendingEventId(null);
    }
  }, [viewMode]);

  // In story mode, close detail panel and clear focus when step changes via scroll
  useEffect(() => {
    if (viewMode === 'story') {
      setSelectedNode(null);
    }
  }, [activeStep]);

  const handleNodeHover = useCallback((id, e) => {
    setHoveredId(id);
    if (id) {
      const n = layout.nodeMap[id];
      setHoveredNode(n || null);
      if (e) setMouse({ x: e.clientX, y: e.clientY });
    } else {
      setHoveredNode(null);
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (hoveredNode) setMouse({ x: e.clientX, y: e.clientY });
  }, [hoveredNode]);

  return (
    <div onMouseMove={handleMouseMove}>
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-left">
          <h1>{config.title}</h1>
          <span className="subtitle">{config.subtitle || `${YEAR_START}〜${YEAR_END} | ${layout.nodes.length}イベント · ${layout.edges.length}接続`}</span>
        </div>
        <div className="header-right">
          <div className="mode-toggle" role="group" aria-label="表示モード切替">
            <button className={`mode-toggle-btn ${viewMode === 'story' ? 'active' : ''}`}
              onClick={() => setViewMode('story')}>ストーリー</button>
            <button className={`mode-toggle-btn ${viewMode === 'explore' ? 'active' : ''}`}
              onClick={() => setViewMode('explore')}>タイムライン</button>
            <button className={`mode-toggle-btn ${viewMode === 'network' ? 'active' : ''}`}
              onClick={() => setViewMode('network')}>アクター</button>
          </div>
        </div>
      </header>

      {/* ── Explore Mode Overlay ── */}
      {viewMode === 'explore' && (
        <ExploreMode
          onClose={() => setViewMode('story')}
          onSelectNode={(n) => setSelectedNode(n)}
          onNavigateToOrg={(orgName) => {
            const normalized = networkData.orgNameMap?.[orgName] || orgName;
            setSelectedOrgId(normalized);
            setViewMode('network');
          }}
          initialNodeId={pendingEventId}
        />
      )}

      {/* ── Network Mode Overlay ── */}
      {viewMode === 'network' && (
        <div className="orgnet-overlay">
          <OrgNetwork
            selectedOrgId={selectedOrgId}
            onSelectOrg={setSelectedOrgId}
            onNavigateToEvent={(eventId) => {
              setPendingEventId(eventId);
              setViewMode('explore');
            }}
          />
        </div>
      )}

      {/* ── Scrollytelling ── */}
      <div className="scrolly" onClick={() => setSelectedNode(null)}>
        {/* Sticky timeline visualization */}
        <div className="sticky-viz" style={{ height: viewportH }}>
          <TimelineViz
            viewOffset={viewOffset}
            viewportHeight={viewportH}
            revealedIds={revealedIds}
            focusNodes={currentStep?.focusNodes || []}
            hoveredId={hoveredId}
            selectedId={selectedNode?.id}
            onNodeHover={handleNodeHover}
            onNodeClick={(n) => {
              setSelectedNode(prev => prev?.id === n.id ? null : n);
            }}
            narrativeMode={true}
            showEdgesForStep={currentStep?.showEdges || activeStep === narrativeSteps.length - 1}
            mobileScale={mobileScale}
          />
          <MiniBar viewOffset={viewOffset} canvasHeight={ACTUAL_CANVAS_HEIGHT} viewportH={viewportH} />
        </div>

        {/* Scroll steps */}
        <div className="scroll-steps">
          {/* Hero screen */}
          <div
            className="scroll-hero"
            data-step-idx="-1"
            ref={heroRef}
          >
            <div className="hero-card">
              <div className="hero-eyebrow">政策調査タイムライン</div>
              <h2 className="hero-title">{config.title}</h2>
              <p className="hero-subtitle">{YEAR_START}〜{YEAR_END} ｜ {layout.nodes.length}イベント · {layout.edges.length}接続</p>
              <div className="hero-scroll-hint">スクロールして読む ↓</div>
            </div>
          </div>

          {narrativeSteps.map((step, idx) => (
            <div
              key={step.id}
              className="scroll-step"
              data-step-idx={idx}
              ref={el => { stepRefs.current[idx] = el; }}
            >
              <div className={`step-card ${activeStep === idx ? 'active' : ''}`}>
                <div className="step-number">ステップ {idx + 1} / {narrativeSteps.length}</div>
                <h3>{step.title}</h3>
                <div className="step-subtitle">{step.subtitle}</div>
                {(() => {
                  const MAX_BODY = 364;
                  const isLong = step.body.length > MAX_BODY;
                  const isExpanded = expandedSteps.has(step.id);
                  const displayBody = isLong && !isExpanded ? step.body.slice(0, MAX_BODY) + '…' : step.body;
                  return (
                    <>
                      <p>{displayBody}</p>
                      {isLong && (
                        <button
                          className="step-expand-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedSteps(prev => {
                              const next = new Set(prev);
                              if (next.has(step.id)) next.delete(step.id);
                              else next.add(step.id);
                              return next;
                            });
                          }}
                        >
                          {isExpanded ? '閉じる' : '続きを読む'}
                        </button>
                      )}
                    </>
                  );
                })()}

                {/* Step progress dots */}
                <div className="step-progress">
                  {narrativeSteps.map((_, di) => (
                    <div
                      key={di}
                      className={`step-dot ${di === idx ? 'active' : di < idx ? 'done' : ''}`}
                    />
                  ))}
                </div>

                {/* Final step CTA */}
                {idx === narrativeSteps.length - 1 && (
                  <div className="final-step-cta">
                    <button
                      className="final-cta-btn"
                      onClick={(e) => { e.stopPropagation(); setViewMode('explore'); }}
                    >
                      <span className="final-cta-btn-text">全体を自由に探索する</span>
                      <span className="final-cta-btn-arrow">→</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tooltip ── */}
      {hoveredNode && viewMode === 'story' && (
        <Tooltip node={hoveredNode} mouseX={mouse.x} mouseY={mouse.y} />
      )}

      {/* ── Detail Panel (narrative mode) ── */}
      {viewMode === 'story' && (
        <DetailPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onNavigate={(id) => {
            const n = layout.nodeMap[id];
            if (n) setSelectedNode(n);
          }}
          onNavigateToOrg={(orgName) => {
            const normalized = networkData.orgNameMap?.[orgName] || orgName;
            setSelectedOrgId(normalized);
            setViewMode('network');
          }}
        />
      )}
    </div>
  );
}
