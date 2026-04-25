// Build-time converter: electerm .txt → xterm.js ITheme TypeScript module
// Author: Subash Karki
// Run: pnpm run generate-themes

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ELECTERM_DIR = join(__dirname, 'electerm-themes');
const OUTPUT = join(__dirname, '..', 'src', 'core', 'terminal', 'themes', 'theme-data.generated.ts');

const KEY_MAP: Record<string, string> = {
  'terminal:background': 'background',
  'terminal:foreground': 'foreground',
  'terminal:cursor': 'cursor',
  'terminal:cursorAccent': 'cursorAccent',
  'terminal:selection': 'selectionBackground',
  'terminal:selectionBackground': 'selectionBackground',
  'terminal:selectionForeground': 'selectionForeground',
  'terminal:selectionInactiveBackground': 'selectionInactiveBackground',
  'terminal:black': 'black',
  'terminal:red': 'red',
  'terminal:green': 'green',
  'terminal:yellow': 'yellow',
  'terminal:blue': 'blue',
  'terminal:magenta': 'magenta',
  'terminal:cyan': 'cyan',
  'terminal:white': 'white',
  'terminal:brightBlack': 'brightBlack',
  'terminal:brightRed': 'brightRed',
  'terminal:brightGreen': 'brightGreen',
  'terminal:brightYellow': 'brightYellow',
  'terminal:brightBlue': 'brightBlue',
  'terminal:brightMagenta': 'brightMagenta',
  'terminal:brightCyan': 'brightCyan',
  'terminal:brightWhite': 'brightWhite',
};

interface ThemeEntry {
  id: string;
  name: string;
  colors: Record<string, string>;
}

const parseThemeFile = (filePath: string): ThemeEntry | null => {
  const content = readFileSync(filePath, 'utf-8');
  const name = basename(filePath, '.txt');
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const colors: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    const mapped = KEY_MAP[key];
    if (mapped) colors[mapped] = value;
  }

  if (!colors.background || !colors.foreground) return null;
  return { id, name, colors };
};

const main = () => {
  const files = readdirSync(ELECTERM_DIR)
    .filter((f) => f.endsWith('.txt'))
    .sort();
  const themes: ThemeEntry[] = [];

  for (const file of files) {
    const theme = parseThemeFile(join(ELECTERM_DIR, file));
    if (theme) themes.push(theme);
  }

  const lines: string[] = [
    '// AUTO-GENERATED — do not edit. Run: pnpm run generate-themes',
    '// Source: mbadolato/iTerm2-Color-Schemes (electerm format)',
    '// Author: Subash Karki',
    '',
    'import type { ITheme } from "@xterm/xterm";',
    '',
    'export interface TerminalThemeDefinition {',
    '  id: string;',
    '  name: string;',
    '  colors: ITheme;',
    '}',
    '',
    `export const TERMINAL_THEMES: TerminalThemeDefinition[] = ${JSON.stringify(themes, null, 2)};`,
  ];

  writeFileSync(OUTPUT, lines.join('\n') + '\n');
  console.log(`Generated ${themes.length} terminal themes → ${OUTPUT}`);
};

main();
