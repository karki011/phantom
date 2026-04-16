// Browser-safe exports (no Node.js built-ins)
export * from './constants.js';
export * from './cockpit-types.js';

// Node-only exports — import directly:
//   import { CLAUDE_DIR, ... } from '@phantom-os/shared/constants-node';
//   import { safeReadJson, ... } from '@phantom-os/shared/file-utils';
