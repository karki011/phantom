declare module '*.css' {
  const content: string;
  export default content;
}

declare module '@xterm/xterm/css/xterm.css';

interface Window {
  go?: {
    app: {
      App: {
        HealthCheck(): Promise<import('./core/types').HealthResponse>;
        GetSessions(): Promise<import('./core/types').Session[]>;
        GetActiveSessions(): Promise<import('./core/types').Session[]>;
        GetSession(id: string): Promise<import('./core/types').Session>;
        GetSessionTasks(sessionId: string): Promise<import('./core/types').Task[]>;
        GetActivityLog(sessionId: string, limit: number): Promise<import('./core/types').ActivityLog[]>;
        CreateTerminal(id: string, cwd: string, cols: number, rows: number): Promise<void>;
        WriteTerminal(id: string, data: string): Promise<void>;
        ResizeTerminal(id: string, cols: number, rows: number): Promise<void>;
        DestroyTerminal(id: string): Promise<void>;
        GetTerminalScrollback(id: string): Promise<string>;
        GetProjects(): Promise<import('./core/types').Project[]>;
        AddProject(repoPath: string): Promise<import('./core/types').Project>;
        DetectProject(repoPath: string): Promise<import('./core/types').ProjectProfile>;
        GetPreference(key: string): Promise<string>;
        SetPreference(key: string, value: string): Promise<void>;
        GetGitUserName(): Promise<string>;
      };
    };
  };
  runtime?: {
    EventsOn(event: string, callback: (...args: unknown[]) => void): () => void;
  };
}
