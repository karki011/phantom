/**
 * Go import parser — regex-based
 * Handles: import "pkg", import ( "pkg1" "pkg2" )
 * @author Subash Karki
 */
import type { LanguageParser, ParseResult, ParsedImport } from './types.js';

/** Single import: import "fmt" or import alias "fmt" */
const SINGLE_IMPORT_RE = /import\s+(?:\w+\s+)?"([^"]+)"/g;

/** Grouped import block: import ( ... ) — use dotall-aware approach */
const GROUP_IMPORT_RE = /import\s*\(([\s\S]*?)\)/g;

/** Extract individual package paths from inside a group block */
const PKG_PATH_RE = /"([^"]+)"/g;

export class GoParser implements LanguageParser {
  readonly id = 'go';
  readonly extensions = ['go'];

  parse(content: string, _filePath: string): ParseResult {
    const imports = this.parseImports(content);
    return { imports, exports: [] };
  }

  private parseImports(content: string): ParsedImport[] {
    const seen = new Set<string>();
    const imports: ParsedImport[] = [];

    const add = (specifier: string) => {
      if (!seen.has(specifier)) {
        seen.add(specifier);
        imports.push({
          specifier,
          isRelative: specifier.startsWith('./') || specifier.startsWith('../'),
        });
      }
    };

    // Grouped imports first
    GROUP_IMPORT_RE.lastIndex = 0;
    let groupMatch: RegExpExecArray | null;
    while ((groupMatch = GROUP_IMPORT_RE.exec(content)) !== null) {
      const block = groupMatch[1]!;
      PKG_PATH_RE.lastIndex = 0;
      let pkgMatch: RegExpExecArray | null;
      while ((pkgMatch = PKG_PATH_RE.exec(block)) !== null) {
        add(pkgMatch[1]!);
      }
    }

    // Single imports — skip those that appear inside a group block (already handled)
    // Simple approach: match single imports that are NOT followed by a `(`
    SINGLE_IMPORT_RE.lastIndex = 0;
    let singleMatch: RegExpExecArray | null;
    while ((singleMatch = SINGLE_IMPORT_RE.exec(content)) !== null) {
      add(singleMatch[1]!);
    }

    return imports;
  }
}
