/**
 * Built-in Claude CLI slash commands. Inserted as text into the composer
 * when the user picks one — the Claude terminal parses them at runtime.
 *
 * This is the well-known set shipped with Claude Code v2.x. User-defined
 * commands in ~/.claude/commands/ and project-level commands in
 * <worktree>/.claude/commands/ are a future enhancement (would need an IPC
 * to the main process to scan the directories).
 *
 * @author Subash Karki
 */

export interface ClaudeSlashCommand {
  /** The command as typed, without the leading slash. */
  name: string;
  description: string;
  /** Whether this command typically takes an argument (shows placeholder). */
  takesArg?: boolean;
}

export const CLAUDE_SLASH_COMMANDS: ClaudeSlashCommand[] = [
  { name: 'agents', description: 'Manage subagents (list, create, edit)' },
  { name: 'bug', description: 'Report a bug to Anthropic' },
  { name: 'clear', description: 'Clear the conversation history' },
  { name: 'compact', description: 'Compact the conversation to reduce context' },
  { name: 'config', description: 'Open the Claude Code config' },
  { name: 'context', description: 'Show the current context window usage' },
  { name: 'cost', description: 'Show token usage and estimated cost' },
  { name: 'doctor', description: 'Diagnose and verify your Claude Code installation' },
  { name: 'exit', description: 'Exit the Claude session' },
  { name: 'help', description: 'Show available commands' },
  { name: 'hooks', description: 'Manage Claude Code hooks' },
  { name: 'ide', description: 'Open the current file in your IDE' },
  { name: 'init', description: 'Initialize a new CLAUDE.md in the current directory' },
  { name: 'login', description: 'Log in to Anthropic' },
  { name: 'logout', description: 'Log out of Anthropic' },
  { name: 'mcp', description: 'Manage MCP (Model Context Protocol) servers' },
  { name: 'memory', description: 'View or edit persistent memory' },
  { name: 'migrate-installer', description: 'Migrate the Claude Code installer' },
  { name: 'model', description: 'Switch model (opus, sonnet, haiku)', takesArg: true },
  { name: 'permissions', description: 'Manage tool permissions' },
  { name: 'pr-comments', description: 'Review pull request comments' },
  { name: 'release-notes', description: 'Show recent release notes' },
  { name: 'resume', description: 'Resume a previous conversation' },
  { name: 'review', description: 'Review code changes' },
  { name: 'status', description: 'Show the current session status' },
  { name: 'terminal-setup', description: 'Configure your terminal for Claude Code' },
  { name: 'upgrade', description: 'Upgrade Claude Code to the latest version' },
  { name: 'vim', description: 'Toggle vim keybindings' },
];
