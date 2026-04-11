/**
 * JavaScript/TypeScript import parser — regex-based, fast
 * Handles: import/export from, require(), export declarations
 * @author Subash Karki
 */
import type { LanguageParser, ParseResult, ParsedImport, ParsedExport } from './types.js';

/** import ... from '...' / import '...' */
const IMPORT_FROM_RE = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;

/** export ... from '...' */
const EXPORT_FROM_RE = /export\s+(?:[\s\S]*?\s+from\s+)['"]([^'"]+)['"]/g;

/** require('...') */
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Detect exported declarations */
const EXPORT_DECL_RE = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g;

export class JavaScriptParser implements LanguageParser {
  readonly id = 'javascript';
  readonly extensions = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'];

  parse(content: string, _filePath: string): ParseResult {
    const imports = this.parseImports(content);
    const exports = this.parseExports(content);
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
