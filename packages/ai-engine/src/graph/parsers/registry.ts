/**
 * ParserRegistry — maps file extensions to language parsers
 * @author Subash Karki
 */
import type { LanguageParser } from './types.js';
import { JavaScriptParser } from './javascript.js';
import { PythonParser } from './python.js';
import { GoParser } from './go.js';
import { RustParser } from './rust.js';
import { JavaParser } from './java.js';

export class ParserRegistry {
  private parsers = new Map<string, LanguageParser>();
  private extensionMap = new Map<string, LanguageParser>();

  constructor() {
    // Pre-register all built-in parsers
    this.register(new JavaScriptParser());
    this.register(new PythonParser());
    this.register(new GoParser());
    this.register(new RustParser());
    this.register(new JavaParser());
  }

  /**
   * Register a language parser. Maps all its declared extensions.
   */
  register(parser: LanguageParser): void {
    this.parsers.set(parser.id, parser);
    for (const ext of parser.extensions) {
      this.extensionMap.set(ext, parser);
    }
  }

  /**
   * Get the parser for a given file extension (without dot).
   * Returns null if no parser handles that extension.
   */
  getParser(extension: string): LanguageParser | null {
    return this.extensionMap.get(extension) ?? null;
  }

  /**
   * Get all file extensions supported by registered parsers.
   */
  getSupportedExtensions(): string[] {
    return [...this.extensionMap.keys()];
  }

  /**
   * Initialize all parsers that have an init() method.
   * Called once at startup.
   */
  async initAll(): Promise<void> {
    const initPromises: Promise<void>[] = [];
    for (const parser of this.parsers.values()) {
      if (parser.init) {
        initPromises.push(parser.init());
      }
    }
    await Promise.all(initPromises);
  }
}
