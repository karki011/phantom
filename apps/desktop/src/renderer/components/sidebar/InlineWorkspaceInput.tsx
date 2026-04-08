/**
 * InlineWorkspaceInput — branch picker dropdown for creating workspaces
 * Shows searchable list of local/remote branches with option to create new
 *
 * @author Subash Karki
 */
import {
  Badge,
  Paper,
  ScrollArea,
  Skeleton,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { GitBranch, Plus, Search } from 'lucide-react';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createWorkspaceAtom } from '../../atoms/workspaces';
import { type BranchesData, getProjectBranches } from '../../lib/api';

interface InlineWorkspaceInputProps {
  projectId: string;
  onDone: () => void;
}

export function InlineWorkspaceInput({
  projectId,
  onDone,
}: InlineWorkspaceInputProps) {
  const createWorkspace = useSetAtom(createWorkspaceAtom);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<BranchesData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch branches on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProjectBranches(projectId)
      .then((data) => {
        if (!cancelled) setBranches(data);
      })
      .catch(() => {
        if (!cancelled) setBranches({ local: [], remote: [], current: '' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Auto-focus input
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onDone();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onDone]);

  const query = search.trim().toLowerCase();

  const filteredLocal = useMemo(
    () =>
      branches?.local.filter((b) => b.toLowerCase().includes(query)) ?? [],
    [branches, query],
  );

  const filteredRemote = useMemo(
    () =>
      branches?.remote.filter((b) => b.toLowerCase().includes(query)) ?? [],
    [branches, query],
  );

  const allBranches = useMemo(
    () => [...(branches?.local ?? []), ...(branches?.remote ?? [])],
    [branches],
  );

  const exactMatch = useMemo(
    () => allBranches.some((b) => b.toLowerCase() === query),
    [allBranches, query],
  );

  const showCreate = query.length > 0 && !exactMatch;

  const handleSelect = useCallback(
    async (branch: string, type: 'branch' | 'worktree') => {
      if (submitting) return;
      setSubmitting(true);
      try {
        await createWorkspace({
          projectId,
          branch,
          name: branch,
        });
        onDone();
      } catch {
        // Error handled at atom level
      } finally {
        setSubmitting(false);
      }
    },
    [projectId, createWorkspace, onDone, submitting],
  );

  const handleCreate = useCallback(async () => {
    const name = search.trim();
    if (!name || submitting) return;
    setSubmitting(true);
    try {
      await createWorkspace({ projectId, branch: name, name });
      onDone();
    } catch {
      // Error handled at atom level
    } finally {
      setSubmitting(false);
    }
  }, [search, projectId, createWorkspace, onDone, submitting]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDone();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (showCreate) {
          handleCreate();
        } else if (filteredLocal.length > 0) {
          handleSelect(filteredLocal[0], 'branch');
        } else if (filteredRemote.length > 0) {
          handleSelect(filteredRemote[0], 'worktree');
        }
      }
    },
    [onDone, showCreate, handleCreate, handleSelect, filteredLocal, filteredRemote],
  );

  const branchItemStyle = {
    display: 'block',
    width: '100%',
    padding: '4px 10px',
    borderRadius: 3,
    fontSize: '0.75rem',
    color: 'var(--phantom-text-secondary)',
    cursor: 'pointer',
    transition: 'background-color 100ms ease',
  } as const;

  return (
    <div ref={containerRef} style={{ position: 'relative', zIndex: 10 }}>
      <Paper
        shadow="md"
        style={{
          backgroundColor: 'var(--phantom-surface-card)',
          border: '1px solid var(--phantom-border-subtle)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div style={{ padding: '6px 6px 4px' }}>
          <TextInput
            ref={inputRef}
            placeholder="Search or create..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting}
            size="xs"
            leftSection={
              <Search size={12} style={{ color: 'var(--phantom-text-muted)' }} />
            }
            styles={{
              input: {
                height: 28,
                minHeight: 28,
                fontSize: '0.75rem',
                backgroundColor: 'var(--phantom-surface-bg)',
                borderColor: 'var(--phantom-border-subtle)',
                color: 'var(--phantom-text-primary)',
                '&::placeholder': {
                  color: 'var(--phantom-text-muted)',
                },
              },
            }}
          />
        </div>

        {/* Branch list */}
        <ScrollArea.Autosize mah={250} scrollbarSize={4}>
          <div style={{ padding: '2px 4px 6px' }}>
            {loading ? (
              <div style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Skeleton height={18} radius="sm" />
                <Skeleton height={18} radius="sm" />
                <Skeleton height={18} radius="sm" width="80%" />
              </div>
            ) : (
              <>
                {/* Local branches */}
                {filteredLocal.length > 0 && (
                  <>
                    <Text
                      fz="0.65rem"
                      fw={600}
                      c="var(--phantom-text-muted)"
                      tt="uppercase"
                      px={10}
                      py={3}
                    >
                      Local
                    </Text>
                    {filteredLocal.map((b) => (
                      <UnstyledButton
                        key={`local-${b}`}
                        onClick={() => handleSelect(b, 'branch')}
                        disabled={submitting}
                        style={branchItemStyle}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            'var(--phantom-surface-hover)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <GitBranch
                            size={11}
                            style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }}
                          />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b}
                          </span>
                          {b === branches?.current && (
                            <Badge size="xs" variant="light" color="cyan" style={{ flexShrink: 0 }}>
                              current
                            </Badge>
                          )}
                        </div>
                      </UnstyledButton>
                    ))}
                  </>
                )}

                {/* Remote branches */}
                {filteredRemote.length > 0 && (
                  <>
                    <Text
                      fz="0.65rem"
                      fw={600}
                      c="var(--phantom-text-muted)"
                      tt="uppercase"
                      px={10}
                      py={3}
                      mt={filteredLocal.length > 0 ? 4 : 0}
                    >
                      Remote
                    </Text>
                    {filteredRemote.map((b) => (
                      <UnstyledButton
                        key={`remote-${b}`}
                        onClick={() => handleSelect(b, 'worktree')}
                        disabled={submitting}
                        style={branchItemStyle}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            'var(--phantom-surface-hover)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <GitBranch
                            size={11}
                            style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }}
                          />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b}
                          </span>
                        </div>
                      </UnstyledButton>
                    ))}
                  </>
                )}

                {/* Empty state */}
                {filteredLocal.length === 0 &&
                  filteredRemote.length === 0 &&
                  !showCreate && (
                    <Text fz="0.7rem" c="var(--phantom-text-muted)" ta="center" py={8}>
                      No branches found
                    </Text>
                  )}

                {/* Create new branch option */}
                {showCreate && (
                  <UnstyledButton
                    onClick={handleCreate}
                    disabled={submitting}
                    style={{
                      ...branchItemStyle,
                      color: 'var(--phantom-accent-cyan)',
                      marginTop: 2,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        'var(--phantom-surface-hover)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Plus size={12} style={{ flexShrink: 0 }} />
                      <span>
                        Create &ldquo;{search.trim()}&rdquo;
                      </span>
                    </div>
                  </UnstyledButton>
                )}
              </>
            )}
          </div>
        </ScrollArea.Autosize>
      </Paper>
    </div>
  );
}
