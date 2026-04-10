/**
 * @phantom-os/terminal — xterm.js-based terminal pane type.
 * @author Subash Karki
 */
export { TerminalPane } from './TerminalPane.js';
export { useTerminal } from './useTerminal.js';
export { getTerminalTheme } from './theme.js';
export {
  hasSession,
  getSession,
  attachSession,
  detachSession,
  disposeSession,
  disposeAllSessions,
  type TerminalSession,
  type AttachOptions,
} from './state.js';
