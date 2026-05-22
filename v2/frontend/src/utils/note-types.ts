// Author: Subash Karki
export const NOTE_COLORS: Record<string, string> = {
  todo: '#f59e0b',
  idea: '#3b82f6',
  bug: '#ef4444',
  note: '#00d4ff',
};

export const NOTE_TYPES = [
  { value: 'todo', label: 'Todo', color: NOTE_COLORS.todo },
  { value: 'idea', label: 'Idea', color: NOTE_COLORS.idea },
  { value: 'bug', label: 'Bug', color: NOTE_COLORS.bug },
  { value: 'note', label: 'Note', color: NOTE_COLORS.note },
] as const;
