/**
 * Rust import parser — regex-based
 * Handles: use statements, mod declarations, extern crate
 * @author Subash Karki
 */
import type { LanguageParser, ParseResult, ParsedImport } from './types.js';

/** `use crate::foo::bar` or `use self::foo` or `use super::foo` — relative */
const USE_RELATIVE_RE = /use\s+((?:crate|self|super)(?:::\w+)*)/g;

/** `use std::io` or `use serde::Deserialize` — external crate path */
const USE_EXTERNAL_RE = /use\s+(\w+(?:::\w+)*)/g;

/** `mod foo;` — module declaration (relative file) */
const MOD_DECL_RE = /mod\s+(\w+)\s*;/g;

/** `extern crate serde;` */
const EXTERN_CRATE_RE = /extern\s+crate\s+(\w+)/g;

const RELATIVE_PREFIXES = ['crate', 'self', 'super'];

export class RustParser implements LanguageParser {
  readonly id = 'rust';
  readonly extensions = ['rs'];

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

    // Relative use (crate/self/super) — check these first
    USE_RELATIVE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = USE_RELATIVE_RE.exec(content)) !== null) {
      add(match[1]!, true);
    }

    // External use — skip anything starting with crate/self/super
    USE_EXTERNAL_RE.lastIndex = 0;
    while ((match = USE_EXTERNAL_RE.exec(content)) !== null) {
      const specifier = match[1]!;
      const root = specifier.split('::')[0]!;
      if (!RELATIVE_PREFIXES.includes(root)) {
        add(specifier, false);
      }
    }

    // mod declarations (always relative — refers to a sibling file or dir)
    MOD_DECL_RE.lastIndex = 0;
    while ((match = MOD_DECL_RE.exec(content)) !== null) {
      add(match[1]!, true);
    }

    // extern crate
    EXTERN_CRATE_RE.lastIndex = 0;
    while ((match = EXTERN_CRATE_RE.exec(content)) !== null) {
      add(match[1]!, false);
    }

    return imports;
  }
}
