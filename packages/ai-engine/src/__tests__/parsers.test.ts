/**
 * Tests for multi-language import parsers and ParserRegistry
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JavaScriptParser } from '../graph/parsers/javascript.js';
import { PythonParser } from '../graph/parsers/python.js';
import { GoParser } from '../graph/parsers/go.js';
import { RustParser } from '../graph/parsers/rust.js';
import { JavaParser } from '../graph/parsers/java.js';
import { ParserRegistry } from '../graph/parsers/registry.js';
import { InMemoryGraph } from '../graph/in-memory-graph.js';
import { GraphBuilder } from '../graph/builder.js';
import { EventBus } from '../events/event-bus.js';

// ===========================================================================
// JavaScript / TypeScript Parser
// ===========================================================================

describe('JavaScriptParser', () => {
  const parser = new JavaScriptParser();

  it('should have correct id and extensions', () => {
    expect(parser.id).toBe('javascript');
    expect(parser.extensions).toContain('ts');
    expect(parser.extensions).toContain('tsx');
    expect(parser.extensions).toContain('js');
    expect(parser.extensions).toContain('jsx');
    expect(parser.extensions).toContain('mjs');
    expect(parser.extensions).toContain('cjs');
  });

  it('should parse ESM named imports', () => {
    const content = `import { foo, bar } from './utils';`;
    const result = parser.parse(content, 'index.ts');
    expect(result.imports).toContainEqual({ specifier: './utils', isRelative: true });
  });

  it('should parse default imports', () => {
    const content = `import React from 'react';`;
    const result = parser.parse(content, 'index.ts');
    expect(result.imports).toContainEqual({ specifier: 'react', isRelative: false });
  });

  it('should parse side-effect imports', () => {
    const content = `import './styles.css';`;
    const result = parser.parse(content, 'index.ts');
    expect(result.imports).toContainEqual({ specifier: './styles.css', isRelative: true });
  });

  it('should parse require calls', () => {
    const content = `const fs = require('fs');`;
    const result = parser.parse(content, 'index.js');
    expect(result.imports).toContainEqual({ specifier: 'fs', isRelative: false });
  });

  it('should parse re-exports', () => {
    const content = `export { foo } from './bar';`;
    const result = parser.parse(content, 'index.ts');
    expect(result.imports).toContainEqual({ specifier: './bar', isRelative: true });
  });

  it('should identify relative vs absolute imports correctly', () => {
    const content = [
      `import { a } from './local';`,
      `import { b } from '../parent';`,
      `import { c } from 'external-pkg';`,
      `import { d } from '@scope/pkg';`,
    ].join('\n');
    const result = parser.parse(content, 'index.ts');

    const relative = result.imports.filter((i) => i.isRelative);
    const absolute = result.imports.filter((i) => !i.isRelative);

    expect(relative).toHaveLength(2);
    expect(absolute).toHaveLength(2);
  });

  it('should deduplicate repeated specifiers', () => {
    const content = [
      `import { a } from 'react';`,
      `import { b } from 'react';`,
    ].join('\n');
    const result = parser.parse(content, 'index.ts');
    expect(result.imports.filter((i) => i.specifier === 'react')).toHaveLength(1);
  });

  it('should parse export declarations', () => {
    const content = [
      `export const foo = 1;`,
      `export function bar() {}`,
      `export class Baz {}`,
      `export default function main() {}`,
      `export interface Config {}`,
      `export type Options = {};`,
      `export enum Status {}`,
    ].join('\n');
    const result = parser.parse(content, 'index.ts');
    const names = result.exports.map((e) => e.name);

    expect(names).toContain('foo');
    expect(names).toContain('bar');
    expect(names).toContain('Baz');
    expect(names).toContain('main');
    expect(names).toContain('Config');
    expect(names).toContain('Options');
    expect(names).toContain('Status');
  });
});

// ===========================================================================
// Python Parser
// ===========================================================================

describe('PythonParser', () => {
  const parser = new PythonParser();

  it('should have correct id and extensions', () => {
    expect(parser.id).toBe('python');
    expect(parser.extensions).toEqual(['py']);
  });

  it('should parse bare imports', () => {
    const content = `import os`;
    const result = parser.parse(content, 'main.py');
    expect(result.imports).toContainEqual({ specifier: 'os', isRelative: false });
  });

  it('should parse dotted bare imports', () => {
    const content = `import os.path`;
    const result = parser.parse(content, 'main.py');
    expect(result.imports).toContainEqual({ specifier: 'os.path', isRelative: false });
  });

  it('should parse absolute from-imports', () => {
    const content = `from os.path import join`;
    const result = parser.parse(content, 'main.py');
    expect(result.imports).toContainEqual({ specifier: 'os.path', isRelative: false });
  });

  it('should parse relative from-import with dot', () => {
    const content = `from . import utils`;
    const result = parser.parse(content, 'main.py');
    expect(result.imports).toContainEqual({ specifier: '.', isRelative: true });
  });

  it('should parse relative from-import with module', () => {
    const content = `from .utils import helper`;
    const result = parser.parse(content, 'main.py');
    expect(result.imports).toContainEqual({ specifier: '.utils', isRelative: true });
  });

  it('should parse double-dot relative imports', () => {
    const content = `from ..parent import thing`;
    const result = parser.parse(content, 'sub/main.py');
    expect(result.imports).toContainEqual({ specifier: '..parent', isRelative: true });
  });

  it('should handle import with alias', () => {
    const content = `import numpy as np`;
    const result = parser.parse(content, 'main.py');
    expect(result.imports).toContainEqual({ specifier: 'numpy', isRelative: false });
  });

  it('should parse multi-module bare import (import a, b, c)', () => {
    const content = `import os, sys, json`;
    const result = parser.parse(content, 'main.py');
    expect(result.imports).toContainEqual({ specifier: 'os', isRelative: false });
    expect(result.imports).toContainEqual({ specifier: 'sys', isRelative: false });
    expect(result.imports).toContainEqual({ specifier: 'json', isRelative: false });
    expect(result.imports).toHaveLength(3);
  });

  it('should parse multi-module bare import with aliases (import a as x, b)', () => {
    const content = `import os as _os, sys`;
    const result = parser.parse(content, 'main.py');
    expect(result.imports).toContainEqual({ specifier: 'os', isRelative: false });
    expect(result.imports).toContainEqual({ specifier: 'sys', isRelative: false });
    expect(result.imports).toHaveLength(2);
  });

  it('should not regress from-import — from x import y still works', () => {
    const content = `from pathlib import Path`;
    const result = parser.parse(content, 'main.py');
    expect(result.imports).toContainEqual({ specifier: 'pathlib', isRelative: false });
    expect(result.imports).toHaveLength(1);
  });

  it('should handle multiple imports in one file', () => {
    const content = [
      `import os`,
      `import sys`,
      `from pathlib import Path`,
      `from .utils import helper`,
      `from ..config import settings`,
    ].join('\n');
    const result = parser.parse(content, 'main.py');
    expect(result.imports).toHaveLength(5);
  });
});

// ===========================================================================
// Go Parser
// ===========================================================================

describe('GoParser', () => {
  const parser = new GoParser();

  it('should have correct id and extensions', () => {
    expect(parser.id).toBe('go');
    expect(parser.extensions).toEqual(['go']);
  });

  it('should parse single import', () => {
    const content = `import "fmt"`;
    const result = parser.parse(content, 'main.go');
    expect(result.imports).toContainEqual({ specifier: 'fmt', isRelative: false });
  });

  it('should parse grouped imports', () => {
    const content = [
      `import (`,
      `  "fmt"`,
      `  "os"`,
      `)`,
    ].join('\n');
    const result = parser.parse(content, 'main.go');
    expect(result.imports).toContainEqual({ specifier: 'fmt', isRelative: false });
    expect(result.imports).toContainEqual({ specifier: 'os', isRelative: false });
    expect(result.imports).toHaveLength(2);
  });

  it('should parse module path imports', () => {
    const content = `import "github.com/pkg/errors"`;
    const result = parser.parse(content, 'main.go');
    expect(result.imports).toContainEqual({
      specifier: 'github.com/pkg/errors',
      isRelative: false,
    });
  });

  it('should parse named (aliased) imports', () => {
    const content = `import alias "github.com/some/pkg"`;
    const result = parser.parse(content, 'main.go');
    expect(result.imports).toContainEqual({
      specifier: 'github.com/some/pkg',
      isRelative: false,
    });
  });

  it('should parse grouped imports with aliases', () => {
    const content = [
      `import (`,
      `  "fmt"`,
      `  log "github.com/sirupsen/logrus"`,
      `  _ "net/http/pprof"`,
      `)`,
    ].join('\n');
    const result = parser.parse(content, 'main.go');
    expect(result.imports.map((i) => i.specifier).sort()).toEqual([
      'fmt',
      'github.com/sirupsen/logrus',
      'net/http/pprof',
    ]);
  });

  it('should detect relative Go imports', () => {
    const content = `import "./internal/foo"`;
    const result = parser.parse(content, 'main.go');
    expect(result.imports).toContainEqual({ specifier: './internal/foo', isRelative: true });
  });
});

// ===========================================================================
// Rust Parser
// ===========================================================================

describe('RustParser', () => {
  const parser = new RustParser();

  it('should have correct id and extensions', () => {
    expect(parser.id).toBe('rust');
    expect(parser.extensions).toEqual(['rs']);
  });

  it('should parse external use statements', () => {
    const content = `use std::io;`;
    const result = parser.parse(content, 'main.rs');
    expect(result.imports).toContainEqual({ specifier: 'std::io', isRelative: false });
  });

  it('should parse crate-relative use as relative', () => {
    const content = `use crate::utils;`;
    const result = parser.parse(content, 'main.rs');
    expect(result.imports).toContainEqual({ specifier: 'crate::utils', isRelative: true });
  });

  it('should parse self-relative use as relative', () => {
    const content = `use self::helper;`;
    const result = parser.parse(content, 'lib.rs');
    expect(result.imports).toContainEqual({ specifier: 'self::helper', isRelative: true });
  });

  it('should parse super-relative use as relative', () => {
    const content = `use super::parent;`;
    const result = parser.parse(content, 'sub/mod.rs');
    expect(result.imports).toContainEqual({ specifier: 'super::parent', isRelative: true });
  });

  it('should parse mod declarations as relative', () => {
    const content = `mod tests;`;
    const result = parser.parse(content, 'lib.rs');
    expect(result.imports).toContainEqual({ specifier: 'tests', isRelative: true });
  });

  it('should parse extern crate as non-relative', () => {
    const content = `extern crate serde;`;
    const result = parser.parse(content, 'lib.rs');
    expect(result.imports).toContainEqual({ specifier: 'serde', isRelative: false });
  });

  it('should handle multiple use statements', () => {
    const content = [
      `use std::io;`,
      `use std::collections::HashMap;`,
      `use crate::config::Settings;`,
      `use self::utils::format;`,
      `use super::parent_mod;`,
      `mod helpers;`,
      `extern crate tokio;`,
    ].join('\n');
    const result = parser.parse(content, 'lib.rs');
    expect(result.imports).toHaveLength(7);

    const relative = result.imports.filter((i) => i.isRelative);
    const external = result.imports.filter((i) => !i.isRelative);

    // crate::, self::, super::, mod → relative
    expect(relative).toHaveLength(4);
    // std::io, std::collections::HashMap, tokio → external
    expect(external).toHaveLength(3);
  });
});

// ===========================================================================
// Java Parser
// ===========================================================================

describe('JavaParser', () => {
  const parser = new JavaParser();

  it('should have correct id and extensions', () => {
    expect(parser.id).toBe('java');
    expect(parser.extensions).toEqual(['java']);
  });

  it('should parse standard import', () => {
    const content = `import java.util.List;`;
    const result = parser.parse(content, 'Main.java');
    expect(result.imports).toContainEqual({ specifier: 'java.util.List', isRelative: false });
  });

  it('should parse static import', () => {
    const content = `import static java.lang.Math.*;`;
    const result = parser.parse(content, 'Main.java');
    expect(result.imports).toContainEqual({ specifier: 'java.lang.Math', isRelative: false });
  });

  it('should parse application import', () => {
    const content = `import com.myapp.utils.Helper;`;
    const result = parser.parse(content, 'Main.java');
    expect(result.imports).toContainEqual({
      specifier: 'com.myapp.utils.Helper',
      isRelative: false,
    });
  });

  it('should parse wildcard import', () => {
    const content = `import java.util.*;`;
    const result = parser.parse(content, 'Main.java');
    expect(result.imports).toContainEqual({ specifier: 'java.util', isRelative: false });
  });

  it('should handle multiple imports', () => {
    const content = [
      `package com.myapp;`,
      ``,
      `import java.util.List;`,
      `import java.util.Map;`,
      `import com.google.common.collect.ImmutableList;`,
      `import static org.junit.Assert.assertEquals;`,
    ].join('\n');
    const result = parser.parse(content, 'Main.java');
    expect(result.imports).toHaveLength(4);
  });

  it('should mark all Java imports as non-relative', () => {
    const content = [
      `import java.util.List;`,
      `import com.myapp.Helper;`,
    ].join('\n');
    const result = parser.parse(content, 'Main.java');
    expect(result.imports.every((i) => !i.isRelative)).toBe(true);
  });
});

// ===========================================================================
// ParserRegistry
// ===========================================================================

describe('ParserRegistry', () => {
  let registry: ParserRegistry;

  beforeEach(() => {
    registry = new ParserRegistry();
  });

  it('should map JS/TS extensions to JavaScriptParser', () => {
    for (const ext of ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']) {
      const parser = registry.getParser(ext);
      expect(parser).not.toBeNull();
      expect(parser!.id).toBe('javascript');
    }
  });

  it('should map .py to PythonParser', () => {
    const parser = registry.getParser('py');
    expect(parser).not.toBeNull();
    expect(parser!.id).toBe('python');
  });

  it('should map .go to GoParser', () => {
    const parser = registry.getParser('go');
    expect(parser).not.toBeNull();
    expect(parser!.id).toBe('go');
  });

  it('should map .rs to RustParser', () => {
    const parser = registry.getParser('rs');
    expect(parser).not.toBeNull();
    expect(parser!.id).toBe('rust');
  });

  it('should map .java to JavaParser', () => {
    const parser = registry.getParser('java');
    expect(parser).not.toBeNull();
    expect(parser!.id).toBe('java');
  });

  it('should return null for unknown extensions', () => {
    expect(registry.getParser('rb')).toBeNull();
    expect(registry.getParser('cpp')).toBeNull();
    expect(registry.getParser('unknown')).toBeNull();
  });

  it('should return all supported extensions', () => {
    const exts = registry.getSupportedExtensions();
    expect(exts).toContain('ts');
    expect(exts).toContain('tsx');
    expect(exts).toContain('js');
    expect(exts).toContain('py');
    expect(exts).toContain('go');
    expect(exts).toContain('rs');
    expect(exts).toContain('java');
  });

  it('should allow registering custom parsers', () => {
    registry.register({
      id: 'ruby',
      extensions: ['rb'],
      parse: () => ({ imports: [], exports: [] }),
    });
    const parser = registry.getParser('rb');
    expect(parser).not.toBeNull();
    expect(parser!.id).toBe('ruby');
  });

  it('should call initAll without errors', async () => {
    await expect(registry.initAll()).resolves.toBeUndefined();
  });
});

// ===========================================================================
// Integration: Mixed-language project build
// ===========================================================================

describe('GraphBuilder — multi-language integration', () => {
  let tmpDir: string;
  let graph: InMemoryGraph;
  let eventBus: EventBus;
  let builder: GraphBuilder;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'multi-lang-test-'));
    graph = new InMemoryGraph();
    eventBus = new EventBus();
    builder = new GraphBuilder(graph, eventBus);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should parse Python files alongside TypeScript files', async () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });

    // TypeScript file
    writeFileSync(
      join(tmpDir, 'src', 'index.ts'),
      `import { helper } from './utils.js';\nexport const main = () => helper();`,
    );
    writeFileSync(
      join(tmpDir, 'src', 'utils.ts'),
      `export const helper = () => 'hello';`,
    );

    // Python files
    writeFileSync(
      join(tmpDir, 'src', 'main.py'),
      [
        `import os`,
        `from .helpers import do_stuff`,
      ].join('\n'),
    );
    writeFileSync(
      join(tmpDir, 'src', 'helpers.py'),
      `def do_stuff():\n    return "done"`,
    );

    await builder.buildProject('test', tmpDir);

    // Verify TS files are present
    expect(graph.getFileByPath('src/index.ts')).toBeDefined();
    expect(graph.getFileByPath('src/utils.ts')).toBeDefined();

    // Verify Python files are present
    expect(graph.getFileByPath('src/main.py')).toBeDefined();
    expect(graph.getFileByPath('src/helpers.py')).toBeDefined();

    // Verify TS edges still work
    const tsImportEdge = graph.getEdge(
      'edge:file:test:src/index.ts:file:test:src/utils.ts:imports',
    );
    expect(tsImportEdge).toBeDefined();

    // Verify Python external module edge
    const modules = graph.getNodesByType('module');
    const osModule = modules.find((m) => (m as any).name === 'os');
    expect(osModule).toBeDefined();
  });

  it('should parse Go files and create module edges', async () => {
    mkdirSync(join(tmpDir, 'cmd'), { recursive: true });

    writeFileSync(
      join(tmpDir, 'cmd', 'main.go'),
      [
        `package main`,
        ``,
        `import (`,
        `  "fmt"`,
        `  "github.com/pkg/errors"`,
        `)`,
        ``,
        `func main() {`,
        `  fmt.Println(errors.New("test"))`,
        `}`,
      ].join('\n'),
    );

    await builder.buildProject('test', tmpDir);

    expect(graph.getFileByPath('cmd/main.go')).toBeDefined();

    const modules = graph.getNodesByType('module');
    const moduleNames = modules.map((m) => (m as any).name);
    expect(moduleNames).toContain('fmt');
    expect(moduleNames).toContain('github.com/pkg/errors');
  });

  it('should skip __pycache__ and venv directories', async () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    mkdirSync(join(tmpDir, '__pycache__'), { recursive: true });
    mkdirSync(join(tmpDir, 'venv', 'lib'), { recursive: true });

    writeFileSync(join(tmpDir, 'src', 'app.py'), `import os`);
    writeFileSync(join(tmpDir, '__pycache__', 'app.cpython-311.pyc.py'), `cached = True`);
    writeFileSync(join(tmpDir, 'venv', 'lib', 'something.py'), `venv_file = True`);

    await builder.buildProject('test', tmpDir);

    const files = graph.getNodesByType('file');
    const paths = files.map((f) => (f as any).path);

    expect(paths).toContain('src/app.py');
    expect(paths.some((p: string) => p.includes('__pycache__'))).toBe(false);
    expect(paths.some((p: string) => p.includes('venv'))).toBe(false);
  });

  it('should skip Rust target directory', async () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    mkdirSync(join(tmpDir, 'target', 'debug'), { recursive: true });

    writeFileSync(
      join(tmpDir, 'src', 'main.rs'),
      `use std::io;\nfn main() {}`,
    );
    writeFileSync(
      join(tmpDir, 'target', 'debug', 'build.rs'),
      `fn build() {}`,
    );

    await builder.buildProject('test', tmpDir);

    const paths = graph.getNodesByType('file').map((f) => (f as any).path);
    expect(paths).toContain('src/main.rs');
    expect(paths.some((p: string) => p.includes('target'))).toBe(false);
  });
});
