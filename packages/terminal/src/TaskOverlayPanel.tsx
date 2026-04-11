/**
 * TaskOverlayPanel — unified floating overlay inside terminal panes.
 * Shows incomplete tasks (top) and matching plans (bottom) in a single panel.
 * Collapsed: thin edge tab on right with task badge count.
 * Expanded: scrollable panel with both sections.
 * Plan items are expandable to show full markdown content inline.
 * Panel auto-widens from 250px to 350px when a plan is expanded.
 * Auto-hides when zero tasks AND zero plans exist.
 * @author Subash Karki
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskData {
  id: string;
  sessionId: string;
  taskNum: number;
  subject: string;
  description: string;
  crew: string | null;
  status: string;
  activeForm: string | null;
  createdAt: number;
  updatedAt: number;
}

interface PlanFile {
  filename: string;
  title: string;
  modifiedAt: number;
  preview: string;
  fullPath: string;
}

interface GroupedPlans {
  branch: PlanFile[];
  project: PlanFile[];
}

// ---------------------------------------------------------------------------
// Hook: useIncompleteTasks
// ---------------------------------------------------------------------------

function useIncompleteTasks(cwd: string) {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const lastHash = useRef('');

  const refresh = useCallback(() => {
    fetch(`/api/tasks/by-cwd?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((all: TaskData[]) => {
        const incomplete = all.filter(
          (t) => t.status === 'pending' || t.status === 'in_progress',
        );
        const hash = incomplete
          .map((t) => `${t.id}:${t.status}:${t.updatedAt}`)
          .join(',');
        if (hash !== lastHash.current) {
          lastHash.current = hash;
          setTasks(incomplete);
        }
      })
      .catch(() => {
        if (lastHash.current !== '') {
          lastHash.current = '';
          setTasks([]);
        }
      });
  }, [cwd]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return tasks;
}

// ---------------------------------------------------------------------------
// Hook: usePlans
// ---------------------------------------------------------------------------

function usePlans(cwd: string) {
  const [plans, setPlans] = useState<PlanFile[]>([]);
  const lastHash = useRef('');

  const refresh = useCallback(() => {
    fetch(`/api/plans/by-cwd?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => (r.ok ? r.json() : { branch: [], project: [] }))
      .then((data: GroupedPlans) => {
        const all = [...(data.branch ?? []), ...(data.project ?? [])];
        const hash = all.map((p) => `${p.filename}:${p.modifiedAt}`).join(',');
        if (hash !== lastHash.current) {
          lastHash.current = hash;
          setPlans(all);
        }
      })
      .catch(() => {
        if (lastHash.current !== '') {
          lastHash.current = '';
          setPlans([]);
        }
      });
  }, [cwd]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return plans;
}

// ---------------------------------------------------------------------------
// Hook: usePlanContent — lazy-loads plan file content on expand
// ---------------------------------------------------------------------------

function usePlanContent(fullPath: string | null) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!fullPath) { setContent(null); return; }
    setLoading(true);
    fetch(`/api/file-read?path=${encodeURIComponent(fullPath)}`)
      .then((r) => (r.ok ? r.text() : ''))
      .then(setContent)
      .catch(() => setContent(''))
      .finally(() => setLoading(false));
  }, [fullPath]);

  return { content, loading };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatAge = (ts: number | null): string => {
  if (!ts) return '';
  const ms = Date.now() - ts;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
};

// ---------------------------------------------------------------------------
// Inline SVG icons (avoids adding lucide-react dependency to terminal pkg)
// ---------------------------------------------------------------------------

const IconCircle = ({ color }: { color: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const IconSpinner = ({ color }: { color: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, animation: 'phantom-task-spin 2s linear infinite' }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const IconChevron = ({ direction }: { direction: 'left' | 'right' | 'down' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'transform 150ms ease' }}>
    {direction === 'right' && <polyline points="9 18 15 12 9 6" />}
    {direction === 'left' && <polyline points="15 18 9 12 15 6" />}
    {direction === 'down' && <polyline points="6 9 12 15 18 9" />}
  </svg>
);

const IconFileText = ({ color }: { color: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <line x1="16" x2="8" y1="13" y2="13" />
    <line x1="16" x2="8" y1="17" y2="17" />
    <line x1="10" x2="8" y1="9" y2="9" />
  </svg>
);

const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'in_progress') return <IconSpinner color="var(--phantom-accent-cyan, #00c8ff)" />;
  return <IconCircle color="var(--phantom-text-muted, #666)" />;
};

// ---------------------------------------------------------------------------
// Sub-component: PlanItem — expandable plan row with lazy content loading
// ---------------------------------------------------------------------------

const PlanItem = memo(function PlanItem({
  plan,
  isExpanded,
  onToggle,
}: {
  plan: PlanFile;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { content, loading } = usePlanContent(isExpanded ? plan.fullPath : null);

  return (
    <div>
      {/* Plan header row */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          cursor: 'pointer',
          borderRadius: 4,
          transition: 'background-color 100ms ease',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.04)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
      >
        <div style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms ease' }}>
          <IconChevron direction="down" />
        </div>
        <IconFileText color="var(--phantom-accent-glow, #a78bfa)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '11px',
            fontFamily: 'JetBrains Mono, monospace',
            color: 'var(--phantom-text-primary, #eee)',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {plan.title}
          </div>
        </div>
        <span style={{
          fontSize: '9px',
          fontFamily: 'JetBrains Mono, monospace',
          color: 'var(--phantom-text-muted, #666)',
          flexShrink: 0,
        }}>
          {formatAge(plan.modifiedAt)}
        </span>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{
          padding: '4px 12px 8px 36px',
          maxHeight: 300,
          overflowY: 'auto',
        }}>
          {loading ? (
            <span style={{
              fontSize: '10px',
              fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--phantom-text-muted, #666)',
            }}>
              Loading...
            </span>
          ) : (
            <pre style={{
              fontSize: '10px',
              fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--phantom-text-secondary, #aaa)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}>
              {content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const PANEL_WIDTH = 250;
const PANEL_WIDTH_EXPANDED = 350;
const TAB_WIDTH = 24;

export const TaskOverlayPanel = memo(function TaskOverlayPanel({
  cwd,
}: {
  cwd: string;
}) {
  const tasks = useIncompleteTasks(cwd);
  const plans = usePlans(cwd);
  const [expanded, setExpanded] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasPlanExpanded = expandedPlan !== null;
  const panelWidth = hasPlanExpanded ? PANEL_WIDTH_EXPANDED : PANEL_WIDTH;

  const togglePlan = useCallback((filename: string) => {
    setExpandedPlan((prev) => (prev === filename ? null : filename));
  }, []);

  // Click-outside to collapse
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [expanded]);

  // Nothing to show — hide completely
  if (tasks.length === 0 && plans.length === 0) return null;

  return (
    <>
      {/* Keyframes for spinner */}
      <style>{`
        @keyframes phantom-task-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div
        ref={panelRef}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: expanded ? panelWidth : TAB_WIDTH,
          zIndex: 15,
          transition: 'width 200ms ease',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'row',
        }}
      >
        {/* — Collapsed: edge tab — */}
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: TAB_WIDTH,
              border: 'none',
              borderLeft: '1px solid var(--phantom-border-subtle, rgba(255,255,255,0.08))',
              background: 'rgba(15, 15, 20, 0.75)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 0,
            }}
          >
            {/* Task badge count */}
            {tasks.length > 0 && (
              <span style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                borderRadius: '50%',
                backgroundColor: 'var(--phantom-accent-cyan, #00c8ff)',
                color: '#000',
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: 'JetBrains Mono, monospace',
                lineHeight: 1,
              }}>
                {tasks.length}
              </span>
            )}
            {/* Plan indicator dot when only plans exist */}
            {tasks.length === 0 && plans.length > 0 && (
              <span style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                borderRadius: '50%',
                backgroundColor: 'var(--phantom-accent-glow, #a78bfa)',
                color: '#000',
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: 'JetBrains Mono, monospace',
                lineHeight: 1,
              }}>
                {plans.length}
              </span>
            )}
            {/* Vertical label */}
            <span style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              transform: 'rotate(180deg)',
              fontSize: '10px',
              fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--phantom-text-muted, #888)',
              letterSpacing: '0.5px',
              userSelect: 'none',
            }}>
              {tasks.length > 0 ? 'Tasks' : 'Plans'}
            </span>
          </button>
        )}

        {/* — Expanded: full panel — */}
        {expanded && (
          <div style={{
            width: panelWidth,
            height: '100%',
            background: 'rgba(15, 15, 20, 0.88)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderLeft: '1px solid var(--phantom-border-subtle, rgba(255,255,255,0.08))',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'width 200ms ease',
          }}>
            {/* Header with collapse button */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: '1px solid var(--phantom-border-subtle, rgba(255,255,255,0.08))',
              flexShrink: 0,
            }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                fontFamily: 'JetBrains Mono, monospace',
                color: 'var(--phantom-text-muted, #888)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                Session
              </span>
              <button
                onClick={() => setExpanded(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 2,
                  color: 'var(--phantom-text-muted, #888)',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Collapse"
              >
                <IconChevron direction="right" />
              </button>
            </div>

            {/* Scrollable content area */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '4px 0',
            }}>
              {/* ——— Tasks Section ——— */}
              {tasks.length > 0 && (
                <div>
                  <div style={{
                    padding: '6px 12px 4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: 'var(--phantom-accent-cyan, #00c8ff)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    Tasks ({tasks.length})
                  </div>
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '5px 12px',
                        cursor: 'default',
                      }}
                    >
                      <div style={{ paddingTop: 2 }}>
                        <StatusIcon status={task.status} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '11px',
                          fontFamily: 'JetBrains Mono, monospace',
                          color: task.status === 'in_progress'
                            ? 'var(--phantom-accent-cyan, #00c8ff)'
                            : 'var(--phantom-text-primary, #eee)',
                          lineHeight: 1.4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}>
                          {task.status === 'in_progress' && task.activeForm
                            ? task.activeForm
                            : task.subject ?? `Task #${task.taskNum}`}
                        </div>
                        {task.updatedAt && (
                          <div style={{
                            fontSize: '9px',
                            fontFamily: 'JetBrains Mono, monospace',
                            color: 'var(--phantom-text-muted, #666)',
                            marginTop: 2,
                          }}>
                            {formatAge(task.updatedAt)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ——— Divider (only when both sections are present) ——— */}
              {tasks.length > 0 && plans.length > 0 && (
                <div style={{
                  margin: '8px 12px',
                  borderTop: '1px solid var(--phantom-border-subtle, rgba(255,255,255,0.08))',
                }} />
              )}

              {/* ——— Plans Section ——— */}
              {plans.length > 0 && (
                <div>
                  <div style={{
                    padding: '6px 12px 4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: 'var(--phantom-accent-glow, #a78bfa)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    Plans ({plans.length})
                  </div>
                  {plans.map((plan) => (
                    <PlanItem
                      key={plan.filename}
                      plan={plan}
                      isExpanded={expandedPlan === plan.filename}
                      onToggle={() => togglePlan(plan.filename)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
});
