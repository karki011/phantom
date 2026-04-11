/**
 * Language Parser Interface — contract for extracting imports from source files
 * @author Subash Karki
 */

export interface ParsedImport {
  /** The raw import specifier (e.g., './utils', 'react', 'os') */
  specifier: string;
  /** Whether this is a relative import (starts with . or ..) */
  isRelative: boolean;
}

export interface ParsedExport {
  /** The exported identifier name */
  name: string;
}

export interface ParseResult {
  imports: ParsedImport[];
  exports: ParsedExport[];
}

export interface LanguageParser {
  /** Language identifier */
  id: string;
  /** File extensions this parser handles (without dot) */
  extensions: string[];
  /** Parse imports and exports from source content */
  parse(content: string, filePath: string): ParseResult;
  /** Initialize the parser (load WASM, etc.) — called once */
  init?(): Promise<void>;
}
