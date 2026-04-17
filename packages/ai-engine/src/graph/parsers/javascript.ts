/**
 * JavaScript/TypeScript import parser — regex-based, fast
 * Handles: import/export from, require(), export declarations
 * @author Subash Karki
 */
import type { LanguageParser, ParseResult, ParsedImport, ParsedExport } from './types.js';

/** import ... from '...' / import '...' — line-anchored so matches don't fire inside string literals */
const IMPORT_FROM_RE = /^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

/** export ... from '...' — line-anchored */
const EXPORT_FROM_RE = /^\s*export\s+(?:[\s\S]*?\s+from\s+)['"]([^'"]+)['"]/gm;

/** require('...') — legitimately appears mid-expression, no anchor */
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Detect exported declarations — line-anchored */
const EXPORT_DECL_RE = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/gm;

/** Strip block + line comments before scanning for imports/exports */
function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

export class JavaScriptParser implements LanguageParser {
  readonly id = 'javascript';
  readonly extensions = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'];

  parse(content: string, _filePath: string): ParseResult {
    const clean = stripComments(content);
    const imports = this.parseImports(clean);
    const exports = this.parseExports(clean);
    return { imports, exports };
  }

  private parseImports(content: string): ParsedImport[] {
    const seen = new Set<string>();
    const imports: ParsedImport[] = [];

    for (const re of [IMPORT_FROM_RE, EXPORT_FROM_RE, REQUIRE_RE]) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        const specifier = match[1]!;
        if (!seen.has(specifier)) {
          seen.add(specifier);
          imports.push({
            specifier,
            isRelative: specifier.startsWith('.'),
          });
        }
      }
    }

    return imports;
  }

  private parseExports(content: string): ParsedExport[] {
    const exports: ParsedExport[] = [];
    EXPORT_DECL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = EXPORT_DECL_RE.exec(content)) !== null) {
      exports.push({ name: match[1]! });
    }
    return exports;
  }
}
