import React from 'react';
import { layout, DOMAIN_COLORS } from './data/layout.js';
import sourceLinks from './data/sourceLinks.js';

export default function DetailPanel({ node, onClose, onNavigate, onNavigateToOrg }) {
  if (!node) return null;

  const domainColor = DOMAIN_COLORS[node.domain] || { border: '#64748b', bg: '#f8fafc' };

  const inEdges = layout.edges.filter(e => e.target === node.id);
  const outEdges = layout.edges.filter(e => e.source === node.id);

  const getNodeTitle = (id) => {
    const n = layout.nodeMap[id];
    return n ? n.label : id;
  };

  const confVal = typeof node.confidence === 'number'
    ? node.confidence
    : node.confidence === 'high' ? 0.9 : node.confidence === 'medium' ? 0.7 : 0.5;

  return (
    <div className={`detail-panel open`}>
      <button className="detail-close" onClick={onClose} title="閉じる">×</button>

      <div className="detail-header">
        <div
          className="detail-domain-badge"
          style={{
            background: domainColor.bg,
            color: domainColor.border,
            border: `1px solid ${domainColor.border}22`,
          }}
        >
          {node.domain || '不明'}
        </div>
        <div className="detail-date">{node.date_text || node.date || '日付不明'}</div>
        <div className="detail-title">{node.label}</div>

        <div className="confidence-bar">
          <span className="confidence-label">信頼度</span>
          <div className="confidence-track">
            <div className="confidence-fill" style={{ width: `${Math.round(confVal * 100)}%` }} />
          </div>
          <span className="confidence-label">{Math.round(confVal * 100)}%</span>
        </div>
      </div>

      <div className="detail-body">
        {node.summary && (
          <div className="detail-section">
            <div className="detail-section-label">要約</div>
            <div className="detail-summary">{node.summary}</div>
          </div>
        )}

        {node.notes_uncertainty && (
          <div className="detail-section">
            <div className="detail-section-label" style={{ color: 'var(--text-muted)' }}>注記</div>
            <div className="detail-uncertainty">{node.notes_uncertainty}</div>
          </div>
        )}

        {(node.organizations?.length > 0 || node.people?.length > 0) && (
          <div className="detail-section">
            <div className="detail-section-label">アクター</div>
            <div className="detail-tags">
              {(node.organizations || []).map((org, i) => (
                <span
                  key={`org-${i}`}
                  className="detail-tag detail-tag-clickable"
                  onClick={() => onNavigateToOrg?.(org)}
                  title="アクター関係図で見る"
                >
                  {org} →
                </span>
              ))}
              {(node.people || []).map((p, i) => (
                <span
                  key={`ppl-${i}`}
                  className="detail-tag detail-tag-clickable"
                  style={{ background: '#fef3c7' }}
                  onClick={() => onNavigateToOrg?.(p)}
                  title="アクター関係図で見る"
                >
                  {p} →
                </span>
              ))}
            </div>
          </div>
        )}

        {node.places?.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-label">場所</div>
            <div className="detail-tags">
              {node.places.map((pl, i) => (
                <span key={`pl-${i}`} className="detail-tag" style={{ background: '#ecfdf5' }}>{pl}</span>
              ))}
            </div>
          </div>
        )}

        {node.policy_stage && (
          <div className="detail-section">
            <div className="detail-section-label">政策段階</div>
            <div className="detail-tags">
              <span className="detail-tag" style={{ background: '#eff6ff', color: '#2563eb' }}>
                {node.policy_stage}
              </span>
              <span className="detail-tag" style={{ background: '#f8fafc' }}>
                {node.event_type}
              </span>
            </div>
          </div>
        )}

        {(() => {
          const linkedSources = sourceLinks[node.id] || [];
          if (linkedSources.length > 0) {
            return (
              <div className="detail-section">
                <div className="detail-section-label">資料</div>
                <div className="detail-source-list">
                  {linkedSources.map((src, i) => (
                    <div key={`src-${i}`} className="detail-source-entry">
                      <a
                        href={src.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="detail-source-link"
                      >
                        <span className="detail-source-id">{src.source_id}</span>
                        <span className="detail-source-title">{src.source_title}</span>
                        <span className="detail-source-ext">↗</span>
                      </a>
                      {(src.why_relevant || src.evidence_snippet) && (
                        <div className="detail-source-meta">
                          {src.why_relevant && (
                            <div className="detail-source-why">{src.why_relevant}</div>
                          )}
                          {src.evidence_snippet && (
                            <div className="detail-source-evidence">「{src.evidence_snippet}」</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          } else if (node.source_ids?.length > 0) {
            return (
              <div className="detail-section">
                <div className="detail-section-label">資料ID</div>
                <div className="detail-tags">
                  {node.source_ids.map((sid, i) => (
                    <span key={`src-${i}`} className="detail-tag" style={{ background: '#f0fdf4', color: '#166534', fontFamily: 'monospace' }}>
                      {sid}
                    </span>
                  ))}
                </div>
              </div>
            );
          }
          return null;
        })()}

        {inEdges.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-label">このイベントへの関係 ({inEdges.length}件)</div>
            <div className="detail-connections">
              {inEdges.map(edge => (
                <div
                  key={edge.id}
                  className="detail-connection-item"
                  onClick={() => onNavigate && onNavigate(edge.source)}
                >
                  <span className="conn-rel-badge">{edge.relation_type}</span>
                  <div className="conn-body">
                    <div className="conn-title">{getNodeTitle(edge.source)}</div>
                    {edge.rationale && (
                      <div className="conn-rationale">{edge.rationale}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {outEdges.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-label">このイベントからの関係 ({outEdges.length}件)</div>
            <div className="detail-connections">
              {outEdges.map(edge => (
                <div
                  key={edge.id}
                  className="detail-connection-item"
                  onClick={() => onNavigate && onNavigate(edge.target)}
                >
                  <span className="conn-rel-badge">{edge.relation_type}</span>
                  <div className="conn-body">
                    <div className="conn-title">{getNodeTitle(edge.target)}</div>
                    {edge.rationale && (
                      <div className="conn-rationale">{edge.rationale}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
