/**
 * PhantomOS Node-only Constants (requires Node.js runtime)
 * @author Subash Karki
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();

export const CLAUDE_DIR = join(HOME, '.claude');
export const SESSIONS_DIR = join(CLAUDE_DIR, 'sessions');
export const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');
export const TASKS_DIR = join(CLAUDE_DIR, 'tasks');
export const TEAM_EVENTS_DIR = join(CLAUDE_DIR, 'team', 'events');
export const PHANTOM_DATA_DIR = join(HOME, '.phantom-os');
export const DB_PATH = join(PHANTOM_DATA_DIR, 'phantom.db');
export const AI_ENGINE_DIR = join(PHANTOM_DATA_DIR, 'ai-engine');
