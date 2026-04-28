// Author: Subash Karki

export interface AIFeature {
  key: string;
  label: string;
  description: string;
  recommended: boolean;
  default: boolean;
}

export const AI_FEATURES: AIFeature[] = [
  {
    key: 'ai.autoContext',
    label: 'Auto Context Injection',
    description: 'Automatically inject codebase context into every AI message',
    recommended: true,
    default: true,
  },
  {
    key: 'ai.editGate',
    label: 'Edit Safety Gate',
    description: 'Require dependency analysis before file modifications',
    recommended: true,
    default: true,
  },
  {
    key: 'ai.outcomeCapture',
    label: 'Outcome Learning',
    description: "Track what works and what doesn't to improve over time",
    recommended: false,
    default: true,
  },
  {
    key: 'ai.fileSync',
    label: 'File Sync',
    description: 'Keep the dependency graph updated as files change',
    recommended: false,
    default: true,
  },
  {
    key: 'ai.mcpTools',
    label: 'MCP Tools',
    description: 'Register PhantomOS tools for on-demand analysis in Claude',
    recommended: true,
    default: true,
  },
];

/** Build a Record<string, string> from feature states for persistence */
export const buildAIPrefs = (states: Record<string, boolean>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(states).map(([k, v]) => [k, String(v)]),
  );

/** Default state map (all features at their default value) */
export const defaultAIState = (): Record<string, boolean> =>
  Object.fromEntries(AI_FEATURES.map((f) => [f.key, f.default]));
