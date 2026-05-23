// Author: Subash Karki

export type PillState = 'idle' | 'observing' | 'attention' | 'listening' | 'speaking';

export interface PersonaState {
  pillState: PillState;
  statusText: string;
  activeProject: string;
  expanded: boolean;
}

export interface PersonaResponse {
  text: string;
  speak: string;
  quickActions?: QuickAction[];
}

export interface QuickAction {
  label: string;
  action: string;
  args?: Record<string, string>;
}

export interface Message {
  role: 'user' | 'phantom';
  text: string;
  timestamp: string;
}

export interface ClaudeSessionStatus {
  sessionId: string;
  projectPath: string;
  liveState: string;
  lastTool: string;
  filesChanged: number;
  startedAt: string;
}

export interface PersonaContext {
  activeProject: string;
  claudeSessions: ClaudeSessionStatus[];
  terminalSessions: { id: string; cwd: string; attached: boolean; title: string }[];
  recentGit: { branch: string; isClean: boolean; staged: number; unstaged: number; untracked: number };
  fileGraph: { fileCount: number; symbolCount: number; edgeCount: number };
}
