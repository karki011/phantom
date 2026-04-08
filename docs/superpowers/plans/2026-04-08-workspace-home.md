# Workspace Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the empty black workspace center with a "Hunter's Terminal" home screen featuring rank display, quick actions, git status, daily quests, and Solo Leveling theming. Also fix auto-restore workspace and file-click-to-editor.

**Architecture:** New `WorkspaceHome` component registered as a pane kind (`workspace-home`) in the existing pane system. Default tab creates this pane instead of a terminal. Git status via IPC handler in main process. All gamification data via existing `useHunter()` and `useQuests()` hooks. Mantine v9 components with phantom CSS variables for full theme support.

**Tech Stack:** React 19, Mantine v9, Jotai, Zustand (pane store), Electron IPC, Lucide icons

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/desktop/src/renderer/components/WorkspaceHome.tsx` | Create | Main home component — rank header, quick actions, info cards, quote |
| `apps/desktop/src/renderer/panes/registry.ts` | Modify | Register `workspace-home` pane kind |
| `packages/panes/src/core/store.ts` | Modify | Change default pane in `makeTab` from `terminal` to `workspace-home` |
| `apps/desktop/src/main/ipc-handlers.ts` | Modify | Add `phantom:git-status` IPC handler |

---

### Task 1: Add `phantom:git-status` IPC Handler

**Files:**
- Modify: `apps/desktop/src/main/ipc-handlers.ts`

- [ ] **Step 1: Add the git-status handler**

Add this handler inside `registerIpcHandlers()`, after the existing handlers:

```ts
import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
```

And inside the function body:

```ts
  /** Return basic git status for a workspace path */
  ipcMain.handle('phantom:git-status', async (_e, repoPath: string) => {
    try {
      const { stdout } = await execFileAsync('git', [
        '-C', repoPath,
        'status', '--porcelain=v1', '-b', '--ahead-behind',
      ], { timeout: 5000 });

      const lines = stdout.split('\n').filter(Boolean);
      const branchLine = lines[0] ?? '';

      // Parse branch: ## main...origin/main [ahead 11]
      const branchMatch = branchLine.match(/^## (.+?)(?:\.\.\.(\S+))?(?:\s+\[(.+)])?$/);
      const branch = branchMatch?.[1] ?? 'unknown';
      const tracking = branchMatch?.[2] ?? null;
      const aheadBehind = branchMatch?.[3] ?? '';

      const aheadMatch = aheadBehind.match(/ahead (\d+)/);
      const behindMatch = aheadBehind.match(/behind (\d+)/);
      const ahead = aheadMatch ? Number(aheadMatch[1]) : 0;
      const behind = behindMatch ? Number(behindMatch[1]) : 0;

      // Count file statuses
      const files = lines.slice(1);
      let staged = 0;
      let modified = 0;
      let untracked = 0;
      for (const f of files) {
        const x = f[0]; // index status
        const y = f[1]; // worktree status
        if (x === '?') { untracked++; continue; }
        if (x !== ' ' && x !== '?') staged++;
        if (y !== ' ' && y !== '?') modified++;
      }

      return { branch, tracking, ahead, behind, staged, modified, untracked };
    } catch {
      return null;
    }
  });
```

- [ ] **Step 2: Verify the handler compiles**

Run: `cd /Users/subash.karki/.claude/phantom-os && npx tsc --noEmit -p apps/desktop/tsconfig.node.json 2>&1 | head -20`

If no tsconfig.node.json, just verify the build in Task 5.

- [ ] **Step 3: Commit**

```bash
cd /Users/subash.karki/.claude/phantom-os
git add apps/desktop/src/main/ipc-handlers.ts
git commit -m "feat: add phantom:git-status IPC handler for workspace home"
```

---

### Task 2: Create WorkspaceHome Component

**Files:**
- Create: `apps/desktop/src/renderer/components/WorkspaceHome.tsx`

- [ ] **Step 1: Create the WorkspaceHome component**

```tsx
/**
 * WorkspaceHome — "Hunter's Terminal"
 * Default pane content for workspace tabs. Shows rank, quick actions,
 * git status, daily quests, and a Solo Leveling quote.
 *
 * @author Subash Karki
 */
import {
  Center,
  Group,
  Kbd,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { usePaneStore } from '@phantom-os/panes';
import { useAtomValue } from 'jotai';
import { FileCode, Flame, GitBranch, Sword, Target, Terminal as TerminalIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { activeWorkspaceAtom } from '../atoms/workspaces';
import { useHunter } from '../hooks/useHunter';
import { useQuests } from '../hooks/useQuests';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUOTES = [
  'I alone level up.',
  'Arise.',
  'Every day I get stronger.',
  'I am the Shadow Monarch.',
  'The System has awakened.',
  'This is just the beginning.',
  'I will not run away anymore.',
  'The weak have no right to choose how they die.',
];

interface GitStatus {
  branch: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RankHeader({ profile }: {
  profile: { rank: string; title: string; level: number; xp: number; xpToNext: number } | null;
}) {
  if (!profile) return null;
  const xpPercent = profile.xpToNext > 0 ? (profile.xp / profile.xpToNext) * 100 : 0;

  return (
    <Stack align="center" gap={4}>
      <Title
        order={1}
        ff="'Orbitron', sans-serif"
        fw={900}
        fz="2.5rem"
        c="var(--phantom-accent-glow)"
        style={{ textShadow: '0 0 20px var(--phantom-accent-glow), 0 0 40px var(--phantom-accent-glow)' }}
      >
        {profile.rank}-RANK
      </Title>
      <Text fz="sm" c="var(--phantom-text-secondary)">
        {profile.title} &middot; Lv.{profile.level}
      </Text>
      <Progress
        value={xpPercent}
        color="var(--phantom-accent-glow)"
        size="xs"
        w={200}
        bg="var(--phantom-surface-elevated)"
        radius="xl"
      />
      <Text fz="xs" c="var(--phantom-text-muted)">
        {profile.xp} / {profile.xpToNext} XP
      </Text>
    </Stack>
  );
}

function QuickActionCard({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  onClick: () => void;
}) {
  return (
    <Paper
      p="lg"
      bg="var(--phantom-surface-card)"
      radius="md"
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: '1px solid var(--phantom-border-subtle)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--phantom-accent-glow)';
        e.currentTarget.style.boxShadow = '0 0 12px color-mix(in srgb, var(--phantom-accent-glow) 30%, transparent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--phantom-border-subtle)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <Stack align="center" gap="xs">
        {icon}
        <Text fw={600} fz="sm" c="var(--phantom-text-primary)">{label}</Text>
        <Kbd fz="xs">{shortcut}</Kbd>
      </Stack>
    </Paper>
  );
}

function GitStatusCard({ status }: { status: GitStatus | null }) {
  if (!status) {
    return (
      <Paper p="md" bg="var(--phantom-surface-card)" radius="md" style={{ border: '1px solid var(--phantom-border-subtle)' }}>
        <Group gap="xs" mb="xs">
          <GitBranch size={14} style={{ color: 'var(--phantom-text-muted)' }} />
          <Text fz="xs" fw={600} c="var(--phantom-text-secondary)">Git Status</Text>
        </Group>
        <Text fz="xs" c="var(--phantom-text-muted)">Loading...</Text>
      </Paper>
    );
  }

  const isDirty = status.staged > 0 || status.modified > 0 || status.untracked > 0;
  const dotColor = isDirty ? 'var(--phantom-status-warning)' : 'var(--phantom-status-active)';

  return (
    <Paper p="md" bg="var(--phantom-surface-card)" radius="md" style={{ border: '1px solid var(--phantom-border-subtle)' }}>
      <Group gap="xs" mb="xs">
        <GitBranch size={14} style={{ color: 'var(--phantom-accent-glow)' }} />
        <Text fz="xs" fw={600} c="var(--phantom-text-secondary)">Git Status</Text>
      </Group>
      <Group gap="xs">
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor }} />
        <Text fz="sm" fw={600} c="var(--phantom-text-primary)">{status.branch}</Text>
        {status.ahead > 0 && (
          <Text fz="xs" c="var(--phantom-accent-glow)">+{status.ahead} ahead</Text>
        )}
        {status.behind > 0 && (
          <Text fz="xs" c="var(--phantom-status-warning)">{status.behind} behind</Text>
        )}
      </Group>
      <Text fz="xs" c="var(--phantom-text-muted)" mt={4}>
        {status.staged} staged &middot; {status.modified} modified &middot; {status.untracked} untracked
      </Text>
    </Paper>
  );
}

function DailyQuestsCard({ quests }: { quests: { total: number; completed: number; availableXp: number } }) {
  const percent = quests.total > 0 ? (quests.completed / quests.total) * 100 : 0;

  return (
    <Paper p="md" bg="var(--phantom-surface-card)" radius="md" style={{ border: '1px solid var(--phantom-border-subtle)' }}>
      <Group gap="xs" mb="xs">
        <Target size={14} style={{ color: 'var(--phantom-accent-gold)' }} />
        <Text fz="xs" fw={600} c="var(--phantom-text-secondary)">Daily Quests</Text>
      </Group>
      <Group gap="xs">
        <Text fz="sm" fw={600} c="var(--phantom-text-primary)">
          {quests.completed}/{quests.total} complete
        </Text>
      </Group>
      <Progress
        value={percent}
        color="var(--phantom-accent-gold)"
        size="xs"
        bg="var(--phantom-surface-elevated)"
        radius="xl"
        mt={6}
      />
      {quests.availableXp > 0 && (
        <Text fz="xs" c="var(--phantom-accent-gold)" mt={4}>
          +{quests.availableXp} XP available
        </Text>
      )}
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkspaceHome() {
  const { profile } = useHunter();
  const { quests } = useQuests();
  const store = usePaneStore();
  const workspace = useAtomValue(activeWorkspaceAtom);

  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);

  // Fetch git status via IPC
  useEffect(() => {
    if (!workspace?.repoPath) return;
    const isDesktop = window.phantomOS?.isDesktop;
    if (!isDesktop) return;

    window.phantomOS.invoke('phantom:git-status', workspace.repoPath)
      .then((result) => setGitStatus(result as GitStatus | null))
      .catch(() => setGitStatus(null));
  }, [workspace?.repoPath]);

  // Random quote (stable per mount)
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

  // Quest summary
  const questSummary = useMemo(() => {
    const total = quests.length;
    const completed = quests.filter((q) => q.completed).length;
    const availableXp = quests
      .filter((q) => !q.completed)
      .reduce((sum, q) => sum + q.xpReward, 0);
    return { total, completed, availableXp };
  }, [quests]);

  const openTerminal = useCallback(() => store.addPane('terminal'), [store]);
  const openEditor = useCallback(() => store.addPane('editor'), [store]);

  return (
    <Center h="100%" style={{ overflow: 'auto' }}>
      <Stack align="center" gap="xl" maw={560} w="100%" px="md" py="xl">
        {/* Rank Header */}
        <RankHeader profile={profile} />

        {/* Quick Actions */}
        <SimpleGrid cols={{ base: 2, sm: 3 }} w="100%" spacing="md">
          <QuickActionCard
            icon={<TerminalIcon size={24} style={{ color: 'var(--phantom-accent-glow)' }} />}
            label="Terminal"
            shortcut="Ctrl+`"
            onClick={openTerminal}
          />
          <QuickActionCard
            icon={<FileCode size={24} style={{ color: 'var(--phantom-accent-glow)' }} />}
            label="Editor"
            shortcut="Ctrl+N"
            onClick={openEditor}
          />
          <QuickActionCard
            icon={<Sword size={24} style={{ color: 'var(--phantom-accent-gold)' }} />}
            label="New Quest"
            shortcut="Ctrl+Q"
            onClick={openTerminal}
          />
        </SimpleGrid>

        {/* Info Cards */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} w="100%" spacing="md">
          <GitStatusCard status={gitStatus} />
          <DailyQuestsCard quests={questSummary} />
        </SimpleGrid>

        {/* Quote */}
        <Text
          fz="sm"
          c="var(--phantom-text-muted)"
          fs="italic"
          ta="center"
          mt="md"
        >
          &ldquo;{quote}&rdquo;
        </Text>
      </Stack>
    </Center>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/subash.karki/.claude/phantom-os
git add apps/desktop/src/renderer/components/WorkspaceHome.tsx
git commit -m "feat: add WorkspaceHome component — Hunter's Terminal"
```

---

### Task 3: Register `workspace-home` Pane Kind

**Files:**
- Modify: `apps/desktop/src/renderer/panes/registry.ts`
- Modify: `packages/panes/src/core/store.ts`

- [ ] **Step 1: Add `workspace-home` to the pane registry**

In `apps/desktop/src/renderer/panes/registry.ts`, add the lazy import and definition:

After the existing lazy imports (line 18), add:

```ts
const WorkspaceHome = lazy(() =>
  import('../components/WorkspaceHome').then((m) => ({ default: m.WorkspaceHome })),
);
```

Then add to `paneDefinitions` after the `editor` entry:

```ts
  'workspace-home': {
    kind: 'workspace-home',
    title: 'Home',
    icon: '⬡',
    render: (_pane: Pane) =>
      createElement(Suspense, { fallback: createElement(Loading) },
        createElement(WorkspaceHome),
      ),
    defaultTitle: 'Home',
    component: () =>
      createElement(Suspense, { fallback: createElement(Loading) },
        createElement(WorkspaceHome),
      ),
  },
```

**Do NOT add `workspace-home` to `paneMenu`** — it should not appear in the "+" dropdown. It's only the initial default pane.

- [ ] **Step 2: Change default pane in store**

In `packages/panes/src/core/store.ts`, change the `makeTab` function (line 47) to use `workspace-home` instead of `terminal`:

```ts
function makeTab<TData = Record<string, unknown>>(label: string): Tab<TData> {
  const pane = makePane<TData>('workspace-home', undefined as TData, 'Home');
  return {
    id: uid(),
    label,
    createdAt: Date.now(),
    activePaneId: pane.id,
    layout: { type: 'pane', paneId: pane.id },
    panes: { [pane.id]: pane },
  };
}
```

Note: Existing persisted state in localStorage (`phantom-os:workspace`) will still have `terminal` pane kinds — those continue to work. Only NEW tabs get `workspace-home`.

- [ ] **Step 3: Commit**

```bash
cd /Users/subash.karki/.claude/phantom-os
git add apps/desktop/src/renderer/panes/registry.ts packages/panes/src/core/store.ts
git commit -m "feat: register workspace-home pane, set as default tab content"
```

---

### Task 4: Verify Auto-Restore and File Click

**Files:**
- Read-only: `apps/desktop/src/renderer/atoms/workspaces.ts`

- [ ] **Step 1: Verify auto-restore already works**

Check that `activeWorkspaceIdAtom` at line 67 of `workspaces.ts` uses `atomWithStorage`:

```ts
export const activeWorkspaceIdAtom = atomWithStorage<string | null>(
  'phantom-active-workspace',
  null,
);
```

This already persists to localStorage. Auto-restore works — the ID is saved when the user selects a workspace. On next load, the ID is restored, and once `refreshWorkspacesAtom` populates `workspacesDataAtom`, the derived `activeWorkspaceAtom` resolves to the full workspace object.

**No code changes needed.** If the user was seeing WelcomePage on reload, it was because the workspace data hadn't loaded yet (race condition) OR they never selected a workspace.

- [ ] **Step 2: Verify file click**

The `FilesView.tsx` line 62 calls `store.addPane('editor', { filePath, workspaceId }, entry.name)`. This was failing because Monaco's web workers couldn't load (blob URL CSP issue). With our `worker: { format: 'es' }` fix from the earlier bug fix session, this should now work.

**No code changes needed.** Will verify during build test.

- [ ] **Step 3: Commit (skip — no changes)**

---

### Task 5: Build Verification

- [ ] **Step 1: Clear old persisted pane state**

The localStorage key `phantom-os:workspace` may have stale pane data with `terminal` as the initial pane. To test the new `workspace-home` default, clear it:

When the app loads in dev mode, open DevTools Console and run:
```js
localStorage.removeItem('phantom-os:workspace');
```
Then reload.

- [ ] **Step 2: Run full build**

```bash
cd /Users/subash.karki/.claude/phantom-os && bun run build
```

Expected: Build passes with no errors.

- [ ] **Step 3: Run dev mode and verify**

```bash
cd /Users/subash.karki/.claude/phantom-os && bun run dev:desktop
```

Verify:
1. App opens to WelcomePage (no workspace selected yet, or last workspace restored)
2. Select a workspace from sidebar
3. Center shows WorkspaceHome with rank, quick actions, git status, daily quests, quote
4. Click "Terminal" quick action -> terminal pane opens
5. Click a file in right sidebar -> Monaco editor opens
6. Close app and reopen -> workspace is auto-restored
7. No `[ThemeProvider]` debug logs in console
8. No `getWorker` errors in console

- [ ] **Step 4: Final commit**

```bash
cd /Users/subash.karki/.claude/phantom-os
git add -A
git commit -m "feat: workspace home — Hunter's Terminal with rank, quests, git status"
```
