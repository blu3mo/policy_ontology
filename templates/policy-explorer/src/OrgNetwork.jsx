import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import networkData from './data/network.js';

/* ── Constants ────────────────────────────────────────────────── */
const GROUP_COLORS = {
  '政府':   '#2563eb',
  '業界':   '#e11d48',
  '国際':   '#f59e0b',
  '専門家': '#059669',
  'その他': '#64748b',
};

const DOMAIN_COLORS = {
  '公式制度過程':       '#2563eb',
  '制度への入力・反応': '#e11d48',
  '社会的外部要因':     '#f59e0b',
};

function nodeRadius(eventCount) {
  const minR = 12, maxR = 32;
  const minC = 1, maxC = 13;
  const t = Math.min(1, Math.max(0, (eventCount - minC) / (maxC - minC)));
  return minR + t * (maxR - minR);
}

function edgeWidth(weight) {
  return 1.5 + weight * 0.9;
}

/* ── Precompute adjacency ─────────────────────────────────────── */
const adjacency = new Map();
networkData.orgNodes.forEach(n => adjacency.set(n.id, new Set()));
networkData.orgEdges.forEach(e => {
  adjacency.get(e.source)?.add(e.target);
  adjacency.get(e.target)?.add(e.source);
});

/* Build co-occurrence map: orgId -> [{orgId, sharedCount, sharedEvents}] */
function buildCooccurrences(orgId) {
  const result = [];
  networkData.orgEdges.forEach(e => {
    if (e.source === orgId) {
      result.push({ orgId: e.target, sharedCount: e.weight, sharedEvents: e.shared_events });
    } else if (e.target === orgId) {
      result.push({ orgId: e.source, sharedCount: e.weight, sharedEvents: e.shared_events });
    }
  });
  result.sort((a, b) => b.sharedCount - a.sharedCount);
  return result;
}

/* ── Event by ID lookup ───────────────────────────────────────── */
const eventById = new Map();
networkData.eventNodes.forEach(ev => eventById.set(ev.id, ev));

/* ── Util: wrap text into lines ───────────────────────────────── */
function wrapText(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const lines = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      lines.push(remaining);
      break;
    }
    lines.push(remaining.slice(0, maxChars));
    remaining = remaining.slice(maxChars);
    if (lines.length >= 3) {
      if (remaining.length > 0) {
        lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + '…';
      }
      break;
    }
  }
  return lines;
}

/* ── OrgNetwork Component ────────────────────────────────────── */
export default function OrgNetwork({ selectedOrgId, onSelectOrg, onNavigateToEvent }) {
  const [selectedOrg, setSelectedOrg] = useState(selectedOrgId || null);
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, text: '' });
  const svgRef = useRef(null);
  const simulationRef = useRef(null);
  const nodesRef = useRef([]);
  const containerRef = useRef(null);

  /* ── Sync external selectedOrgId with internal state ────────── */
  useEffect(() => {
    setSelectedOrg(selectedOrgId || null);
    setExpandedEvents(new Set());
  }, [selectedOrgId]);

  /* ── Initialize D3 simulation ───────────────────────────────── */
  useEffect(() => {
    const svg = d3.select(svgRef.current);

    // Fixed viewBox — never changes
    svg.attr('viewBox', '0 0 900 700');

    // Clone node data for simulation
    const nodes = networkData.orgNodes.map(n => ({
      ...n,
      r: nodeRadius(n.event_count),
    }));
    nodesRef.current = nodes;

    const nodeById = new Map();
    nodes.forEach(n => nodeById.set(n.id, n));

    const links = networkData.orgEdges.map(e => ({
      source: nodeById.get(e.source),
      target: nodeById.get(e.target),
      weight: e.weight,
      shared_events: e.shared_events,
    }));

    // D3 force simulation
    const sim = d3.forceSimulation(nodes)
      .force('center', d3.forceCenter(450, 350).strength(0.05))
      .force('charge', d3.forceManyBody().strength(-280).distanceMax(400))
      .force('collision', d3.forceCollide().radius(d => d.r + 8).strength(0.8))
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => 120 - d.weight * 5).strength(d => 0.3 + d.weight * 0.05))
      .force('x', d3.forceX(450).strength(0.03))
      .force('y', d3.forceY(350).strength(0.03))
      .alphaDecay(0.02)
      .velocityDecay(0.4);

    simulationRef.current = sim;

    // ── Edge group
    const edgeG = svg.select('.orgnet-edges');
    const edgeSel = edgeG.selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'orgnet-edge-line')
      .attr('stroke-width', d => edgeWidth(d.weight));

    // ── Node group
    const nodeG = svg.select('.orgnet-nodes');
    const nodeSel = nodeG.selectAll('g.orgnet-org-node')
      .data(nodes, d => d.id)
      .join('g')
      .attr('class', 'orgnet-org-node');

    nodeSel.selectAll('*').remove();

    nodeSel.append('circle')
      .attr('class', 'orgnet-node-bg')
      .attr('r', d => d.r)
      .attr('fill', d => GROUP_COLORS[d.group] || '#64748b')
      .attr('stroke', d => GROUP_COLORS[d.group] || '#64748b')
      .attr('stroke-width', 2)
      .attr('fill-opacity', 0.15);

    // Label
    nodeSel.each(function(d) {
      const g = d3.select(this);
      const label = d.label;
      if (d.r >= 20) {
        const maxCharsPerLine = Math.max(2, Math.floor(d.r / 5.5));
        const lines = wrapText(label, maxCharsPerLine);
        const lineHeight = 11;
        const startY = -(lines.length - 1) * lineHeight / 2;
        lines.forEach((line, i) => {
          g.append('text')
            .attr('dy', startY + i * lineHeight + 4)
            .attr('font-size', '9.5px')
            .text(line);
        });
      } else {
        g.append('text')
          .attr('dy', d.r + 13)
          .attr('font-size', '9px')
          .text(label);
      }
    });

    // Drag behavior
    const drag = d3.drag()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.15).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeSel.call(drag);

    // Tick
    sim.on('tick', () => {
      edgeSel
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => {
      sim.stop();
    };
  }, []); // run once

  /* ── Update selection visuals ───────────────────────────────── */
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const nodes = nodesRef.current;
    const neighbors = selectedOrg ? adjacency.get(selectedOrg) : null;

    // Update node classes
    svg.selectAll('g.orgnet-org-node')
      .classed('selected', d => d.id === selectedOrg)
      .classed('dimmed', d => {
        if (!selectedOrg) return false;
        return d.id !== selectedOrg && !neighbors?.has(d.id);
      });

    // Update edges
    svg.selectAll('line.orgnet-edge-line')
      .classed('dimmed', d => {
        if (!selectedOrg) return false;
        const src = typeof d.source === 'object' ? d.source.id : d.source;
        const tgt = typeof d.target === 'object' ? d.target.id : d.target;
        return src !== selectedOrg && tgt !== selectedOrg;
      });

    // Event dots
    svg.selectAll('.orgnet-event-dot').remove();
    if (selectedOrg) {
      const orgNode = nodes.find(n => n.id === selectedOrg);
      if (orgNode) {
        const org = networkData.orgNodes.find(o => o.id === selectedOrg);
        if (org) {
          const eventDotG = svg.select('.orgnet-event-dots');
          const eventCount = org.event_ids.length;
          const angleStep = (2 * Math.PI) / eventCount;
          const orbitRadius = orgNode.r + 14;

          org.event_ids.forEach((eid, i) => {
            const ev = eventById.get(eid);
            if (!ev) return;
            const angle = angleStep * i - Math.PI / 2;
            const ex = orgNode.x + Math.cos(angle) * orbitRadius;
            const ey = orgNode.y + Math.sin(angle) * orbitRadius;
            eventDotG.append('circle')
              .attr('class', 'orgnet-event-dot')
              .attr('cx', ex)
              .attr('cy', ey)
              .attr('r', 5)
              .attr('fill', DOMAIN_COLORS[ev.domain] || '#64748b')
              .attr('opacity', 0.85);
          });

          // Update dot positions on tick
          if (simulationRef.current) {
            simulationRef.current.on('tick.dots', () => {
              const node = nodes.find(n => n.id === selectedOrg);
              if (!node) return;
              let idx = 0;
              svg.selectAll('.orgnet-event-dot').each(function() {
                const angle = angleStep * idx - Math.PI / 2;
                const ex = node.x + Math.cos(angle) * orbitRadius;
                const ey = node.y + Math.sin(angle) * orbitRadius;
                d3.select(this).attr('cx', ex).attr('cy', ey);
                idx++;
              });
            });
          }
        }
      }
    } else {
      if (simulationRef.current) {
        simulationRef.current.on('tick.dots', null);
      }
    }
  }, [selectedOrg]);

  /* ── Handlers ───────────────────────────────────────────────── */
  const handleNodeClick = useCallback((orgId) => {
    const newOrg = selectedOrg === orgId ? null : orgId;
    setSelectedOrg(newOrg);
    setExpandedEvents(new Set());
    if (onSelectOrg) onSelectOrg(newOrg);
    // Do NOT reheat simulation on selection change
  }, [selectedOrg, onSelectOrg]);

  const handleBackgroundClick = useCallback((e) => {
    if (e.target.tagName === 'svg' || e.target.classList.contains('orgnet-canvas-bg')) {
      setSelectedOrg(null);
      setExpandedEvents(new Set());
      if (onSelectOrg) onSelectOrg(null);
    }
  }, [onSelectOrg]);

  const handlePivot = useCallback((orgId) => {
    setSelectedOrg(orgId);
    setExpandedEvents(new Set());
    if (onSelectOrg) onSelectOrg(orgId);
    // Gently reheat only for pivot (co-occurrence click)
    if (simulationRef.current) {
      simulationRef.current.alpha(0.03).restart();
    }
  }, [onSelectOrg]);

  const toggleEvent = useCallback((eventId) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  const handleNodeHover = useCallback((e, orgNode) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      text: `${orgNode.label}（${orgNode.event_count}件）`,
    });
  }, []);

  const handleNodeLeave = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  /* ── Bind click/hover events to SVG nodes ───────────────────── */
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('g.orgnet-org-node')
      .on('click', (event, d) => {
        event.stopPropagation();
        handleNodeClick(d.id);
      })
      .on('mouseenter', (event, d) => handleNodeHover(event, d))
      .on('mouseleave', () => handleNodeLeave());
  }, [handleNodeClick, handleNodeHover, handleNodeLeave]);

  /* ── Derive panel data ──────────────────────────────────────── */
  const panelData = useMemo(() => {
    if (!selectedOrg) return null;
    const org = networkData.orgNodes.find(o => o.id === selectedOrg);
    if (!org) return null;

    const events = org.event_ids
      .map(eid => eventById.get(eid))
      .filter(Boolean)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const cooccurrences = buildCooccurrences(selectedOrg);

    // Group events by co-occurring org
    const cooccurGroups = cooccurrences.map(co => ({
      ...co,
      events: co.sharedEvents.map(eid => eventById.get(eid)).filter(Boolean)
        .sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    }));

    // Events with no co-occurring orgs (solo)
    const sharedEventIds = new Set(cooccurrences.flatMap(c => c.sharedEvents));
    const soloEvents = events.filter(ev => !sharedEventIds.has(ev.id));

    return { org, events, cooccurrences, cooccurGroups, soloEvents };
  }, [selectedOrg]);

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="orgnet-main-content">
      {/* Legend */}
      <div className="orgnet-legend-bar">
        {Object.entries(GROUP_COLORS).map(([group, color]) => (
          <div key={group} className="orgnet-legend-item">
            <span className="orgnet-legend-dot" style={{ background: color }} />
            <span>{group}</span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div className="orgnet-body">
        <div
          ref={containerRef}
          className={`orgnet-canvas-container${selectedOrg ? ' orgnet-with-panel' : ''}`}
        >
          <svg ref={svgRef} onClick={handleBackgroundClick}>
            <rect className="orgnet-canvas-bg" width="100%" height="100%" fill="white" />
            <g className="orgnet-edges" />
            <g className="orgnet-event-dots" />
            <g className="orgnet-nodes" />
          </svg>
          <div
            className={`orgnet-tooltip${tooltip.visible ? ' visible' : ''}`}
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        </div>

        {/* Panel */}
        <div className={`orgnet-panel${selectedOrg ? ' open' : ''}`}>
          {panelData && (
            <div className="orgnet-panel-inner">
              <OrgPanelHeader org={panelData.org} eventCount={panelData.events.length} />
              <div className="orgnet-panel-scroll">
                {/* Co-occurrence groups */}
                {panelData.cooccurGroups.map(co => {
                  const coOrg = networkData.orgNodes.find(o => o.id === co.orgId);
                  return (
                    <div key={co.orgId} className="orgnet-cooccur-group">
                      <div className="orgnet-cooccur-group-header" onClick={() => handlePivot(co.orgId)}>
                        <span className="orgnet-cooccur-dot" style={{ background: GROUP_COLORS[coOrg?.group] || '#64748b' }} />
                        <span className="orgnet-cooccur-group-name">{co.orgId}</span>
                        <span className="orgnet-cooccur-count">{co.sharedCount}</span>
                        <span className="orgnet-cooccur-pivot">&rarr;</span>
                      </div>
                      {co.events.map(ev => (
                        <OrgEventItem key={ev.id} event={ev} expanded={expandedEvents.has(ev.id)}
                          onToggle={toggleEvent} sources={networkData.sourceLinks[ev.id] || []}
                          onNavigateToEvent={onNavigateToEvent} />
                      ))}
                    </div>
                  );
                })}

                {/* Solo events (no co-occurrence) */}
                {panelData.soloEvents.length > 0 && (
                  <div className="orgnet-cooccur-group">
                    <div className="orgnet-section-title" style={{marginTop: 16}}>単独で関与</div>
                    {panelData.soloEvents.map(ev => (
                      <OrgEventItem key={ev.id} event={ev} expanded={expandedEvents.has(ev.id)}
                        onToggle={toggleEvent} sources={networkData.sourceLinks[ev.id] || []}
                        onNavigateToEvent={onNavigateToEvent} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Panel Header ─────────────────────────────────────────────── */
function OrgPanelHeader({ org, eventCount }) {
  return (
    <div className="orgnet-panel-header">
      <div className="orgnet-panel-header-top">
        <span className="orgnet-panel-org-name">{org.label}</span>
        <span
          className="orgnet-group-badge"
          style={{ background: GROUP_COLORS[org.group] || '#64748b' }}
        >
          {org.group}
        </span>
      </div>
      <div className="orgnet-panel-event-count">{eventCount}件のイベント</div>
    </div>
  );
}

/* ── Event Item ───────────────────────────────────────────────── */
function OrgEventItem({ event, expanded, onToggle, sources, onNavigateToEvent }) {
  return (
    <div className="orgnet-event-item">
      <div className="orgnet-event-item-header" onClick={() => onToggle(event.id)}>
        <span
          className="orgnet-event-domain-dot"
          style={{ background: DOMAIN_COLORS[event.domain] || '#64748b' }}
        />
        <span className="orgnet-event-date">{event.date?.slice(0, 7) || '—'}</span>
        <span className="orgnet-event-title">{event.label}</span>
        <span className={`orgnet-event-expand-icon${expanded ? ' open' : ''}`}>&#9654;</span>
      </div>
      {expanded && (
        <div className="orgnet-event-detail">
          <div className="orgnet-event-summary">{event.summary}</div>
          <div className="orgnet-event-confidence">
            確信度: {event.confidence != null ? (event.confidence * 100).toFixed(0) + '%' : '—'}
          </div>
          {sources.length > 0 && (
            <ul className="orgnet-event-source-list">
              {sources.map((s, i) => (
                <li key={i}>
                  {s.source_url ? (
                    <a href={s.source_url} target="_blank" rel="noopener noreferrer">
                      {s.source_title || s.source_id}
                    </a>
                  ) : (
                    <span>{s.source_title || s.source_id}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {onNavigateToEvent && (
            <button
              className="orgnet-navigate-event-btn"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToEvent(event.id);
              }}
            >
              タイムラインで見る →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
