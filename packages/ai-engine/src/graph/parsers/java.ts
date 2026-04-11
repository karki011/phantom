/**
 * Java import parser — regex-based
 * Handles: import statements, package declaration
 * @author Subash Karki
 */
import type { LanguageParser, ParseResult, ParsedImport } from './types.js';

/** `import com.foo.Bar;` or `import static com.foo.Bar.*;` */
const IMPORT_RE = /import\s+(?:static\s+)?(\w+(?:\.\w+)*)(?:\.\*)?;/g;

/** `package com.foo.bar;` — stored as metadata, not an import */
const PACKAGE_RE = /package\s+(\w+(?:\.\w+)*);/;

export class JavaParser implements LanguageParser {
  readonly id = 'java';
  readonly extensions = ['java'];

  parse(content: string, _filePath: string): ParseResult {
    const imports = this.parseImports(content);
    return { imports, exports: [] };
  }

  private parseImports(content: string): ParsedImport[] {
    const seen = new Set<string>();
    const imports: ParsedImport[] = [];

    IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMPORT_RE.exec(content)) !== null) {
      const specifier = match[1]!;
      if (!seen.has(specifier)) {
        seen.add(specifier);
        imports.push({
          specifier,
          isRelative: false, // All Java imports are absolute (package-based)
        });
      }
    }

    return imports;
  }
}
