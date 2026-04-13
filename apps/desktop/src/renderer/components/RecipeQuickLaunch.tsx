/**
 * RecipeQuickLaunch — Ctrl+R recipe fuzzy-search palette
 * Quick-launch modal for finding and running terminal recipes with keyboard navigation.
 *
 * @author Subash Karki
 */
import { useAtomValue } from 'jotai';
import { Play, Search, Star } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePaneStore } from '@phantom-os/panes';
import { activeWorktreeAtom, projectsAtom } from '../atoms/worktrees';
import { useProjectProfile } from '../hooks/useProjectProfile';
import { useRecipes, type EnrichedRecipe } from '../hooks/useRecipes';

// ---------------------------------------------------------------------------
// Category badge color map
// ---------------------------------------------------------------------------
const CATEGORY_COLORS: Record<string, string> = {
  setup: '#00bcd4',
  test: '#4caf50',
  lint: '#ffeb3b',
  build: '#ab47bc',
  serve: '#2196f3',
  deploy: '#f44336',
  custom: '#9e9e9e',
};

const getCategoryColor = (category: string): string =>
  CATEGORY_COLORS[category.toLowerCase()] ?? CATEGORY_COLORS.custom;

export const RecipeQuickLaunch = () => {
  const [open, setOpen] = useState(false);

  // Global keyboard shortcut: Ctrl+R — always active
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  if (!open) return null;

  return <RecipeQuickLaunchInner onClose={() => setOpen(false)} />;
};

const RecipeQuickLaunchInner = ({ onClose }: { onClose: () => void }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const worktree = useAtomValue(activeWorktreeAtom);
  const projects = useAtomValue(projectsAtom);
  const store = usePaneStore();

  const project = worktree
    ? projects.find((p) => p.id === worktree.projectId) ?? null
    : null;
  const { profile: projectProfile } = useProjectProfile(project?.id ?? null);
  const { allRecipes } = useRecipes(project?.id ?? null, projectProfile);

  // Auto-focus input on mount
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // ---------------------------------------------------------------------------
  // Fuzzy filter + sort (favorites first, then alphabetical)
  // ---------------------------------------------------------------------------
  const filtered = useMemo<EnrichedRecipe[]>(() => {
    const q = query.toLowerCase().trim();
    const matching = q
      ? allRecipes.filter(
          (r) =>
            r.label.toLowerCase().includes(q) ||
            r.command.toLowerCase().includes(q) ||
            r.category.toLowerCase().includes(q),
        )
      : allRecipes;

    return [...matching].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  }, [allRecipes, query]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, query]);

  // ---------------------------------------------------------------------------
  // Run a recipe — open terminal tab with command
  // ---------------------------------------------------------------------------
  const runRecipe = useCallback(
    (recipe: EnrichedRecipe) => {
      if (!worktree) return;
      store.addPaneAsTab(
        'terminal',
        {
          cwd: worktree.worktreePath ?? project?.repoPath,
          initialCommand: recipe.command,
          worktreeId: worktree.id,
          projectId: project?.id,
          recipeCommand: recipe.command,
          recipeLabel: recipe.label,
          recipeCategory: recipe.category,
        } as Record<string, unknown>,
        recipe.label,
      );
      onClose();
    },
    [worktree, project, store, onClose],
  );

  // ---------------------------------------------------------------------------
  // Keyboard navigation inside the modal
  // ---------------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filtered.length === 0 ? 0 : (prev + 1) % filtered.length,
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filtered.length === 0 ? 0 : (prev - 1 + filtered.length) % filtered.length,
        );
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          runRecipe(filtered[selectedIndex]);
        }
      }
    },
    [filtered, selectedIndex, runRecipe, onClose],
  );

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const noWorktree = !worktree;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '15vh',
        backgroundColor: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      {/* Modal */}
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'var(--phantom-surface-card, #1a1a2e)',
          border: '1px solid var(--phantom-border-subtle, rgba(255,255,255,0.12))',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid var(--phantom-border-subtle, rgba(255,255,255,0.12))',
          }}
        >
          <Search
            size={16}
            style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--phantom-text-primary)',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: 'var(--phantom-text-muted)',
              opacity: 0.6,
              whiteSpace: 'nowrap',
            }}
          >
            Ctrl+R
          </span>
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          style={{
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {noWorktree && (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--phantom-text-muted)',
                fontSize: 13,
              }}
            >
              No active worktree
            </div>
          )}

          {!noWorktree && filtered.length === 0 && (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--phantom-text-muted)',
                fontSize: 13,
              }}
            >
              {query.trim() ? 'No matching recipes' : 'No recipes available'}
            </div>
          )}

          {!noWorktree &&
            filtered.map((recipe, i) => {
              const isSelected = i === selectedIndex;
              const badgeColor = getCategoryColor(recipe.category);
              return (
                <div
                  key={recipe.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 16px',
                    cursor: 'pointer',
                    backgroundColor: isSelected
                      ? 'rgba(99,102,241,0.15)'
                      : 'transparent',
                    borderLeft: isSelected
                      ? '2px solid rgb(99,102,241)'
                      : '2px solid transparent',
                    transition: 'background-color 80ms ease',
                  }}
                  onClick={() => runRecipe(recipe)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  {/* Category badge */}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '2px 6px',
                      borderRadius: 4,
                      backgroundColor: `${badgeColor}22`,
                      color: badgeColor,
                      flexShrink: 0,
                      minWidth: 42,
                      textAlign: 'center',
                    }}
                  >
                    {recipe.category}
                  </span>

                  {/* Label + command */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        color: 'var(--phantom-text-primary)',
                        fontSize: 13,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {recipe.label}
                    </div>
                    <div
                      style={{
                        color: 'var(--phantom-text-muted)',
                        fontSize: 11,
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {recipe.command}
                    </div>
                  </div>

                  {/* Favorite star */}
                  {recipe.favorite && (
                    <Star
                      size={14}
                      fill="var(--phantom-accent-gold, #f5a623)"
                      style={{
                        color: 'var(--phantom-accent-gold, #f5a623)',
                        flexShrink: 0,
                      }}
                    />
                  )}

                  {/* Play icon */}
                  <Play
                    size={14}
                    style={{
                      color: isSelected
                        ? 'rgb(99,102,241)'
                        : 'var(--phantom-text-muted)',
                      flexShrink: 0,
                      opacity: isSelected ? 1 : 0.4,
                      transition: 'opacity 80ms ease',
                    }}
                  />
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
