/**
 * Python import parser — regex-based
 * Handles: import foo, from foo import bar, from . import bar (relative)
 * @author Subash Karki
 */
import type { LanguageParser, ParseResult, ParsedImport, ParsedExport } from './types.js';

/**
 * `import foo` or `import foo.bar` or `import foo as bar`
 * Also handles multi-module form: `import os, sys, json` or `import os as _os, sys`
 * Captures everything after `import ` up to end-of-line, then splits by comma.
 */
const BARE_IMPORT_RE = /^import\s+(.+)$/gm;

/** `from .foo import bar` — relative (starts with dots) */
const FROM_RELATIVE_RE = /^from\s+(\.+\w*(?:\.\w+)*)\s+import\s+/gm;

/** `from foo import bar` — absolute */
const FROM_ABSOLUTE_RE = /^from\s+(\w+(?:\.\w+)*)\s+import\s+/gm;

export class PythonParser implements LanguageParser {
  readonly id = 'python';
  readonly extensions = ['py'];

  parse(content: string, _filePath: string): ParseResult {
    const imports = this.parseImports(content);
    return { imports, exports: [] };
  }

  private parseImports(content: string): ParsedImport[] {
    const seen = new Set<string>();
    const imports: ParsedImport[] = [];

    const add = (specifier: string, isRelative: boolean) => {
      if (!seen.has(specifier)) {
        seen.add(specifier);
        imports.push({ specifier, isRelative });
      }
    };

    // Relative from-imports first (must check before absolute since absolute
    // regex would also match `from .foo` if we're not careful)
    FROM_RELATIVE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = FROM_RELATIVE_RE.exec(content)) !== null) {
      add(match[1]!, true);
    }

    // Absolute from-imports — skip anything starting with a dot (already captured above)
    FROM_ABSOLUTE_RE.lastIndex = 0;
    while ((match = FROM_ABSOLUTE_RE.exec(content)) !== null) {
      const specifier = match[1]!;
      if (!specifier.startsWith('.')) {
        add(specifier, false);
      }
    }

    // Bare imports: `import os`, `import os.path`, `import os, sys, json`, `import os as _os, sys`
    // Each comma-separated segment may be `module` or `module as alias` — we want just `module`.
    BARE_IMPORT_RE.lastIndex = 0;
    while ((match = BARE_IMPORT_RE.exec(content)) !== null) {
      const segments = match[1]!.split(',');
      for (const segment of segments) {
        // Trim whitespace; strip trailing `as <alias>` if present
        const moduleName = segment.trim().replace(/\s+as\s+\w+$/, '').trim();
        if (moduleName) {
          add(moduleName, false);
        }
      }
    }

    return imports;
  }
}
