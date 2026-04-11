/**
 * Tests for ASTEnricher — Layer 2 AST enrichment engine
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';
import { InMemoryGraph } from '../graph/in-memory-graph.js';
import { ASTEnricher } from '../graph/ast-enricher.js';
import { GraphBuilder } from '../graph/builder.js';
import { EventBus } from '../events/event-bus.js';
import type { GraphEvent } from '../types/events.js';
import type {
  FunctionNode,
  ClassNode,
  ComponentNode,
  TypeDefinitionNode,
  FileNode,
} from '../types/graph.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const FUNCTION_FIXTURE = `
export function greet(name: string): string {
  return 'Hello ' + name;
}

const add = (a: number, b: number) => a + b;

export default function main() {
  greet('world');
  const result = add(1, 2);
}
`;

const CLASS_FIXTURE = `
interface Serializable {
  serialize(): string;
}

export class UserService implements Serializable {
  private name: string;
  private age: number;

  constructor(name: string, age: number) {
    this.name = name;
    this.age = age;
  }

  serialize(): string {
    return JSON.stringify({ name: this.name, age: this.age });
  }

  getName(): string {
    return this.name;
  }
}
`;

const COMPONENT_FIXTURE = `
import { useState, useEffect } from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
}

export const Button = ({ label, onClick }: ButtonProps) => {
  return <button onClick={onClick}>{label}</button>;
};

export function UserCard({ name }: { name: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    console.log(name);
  }, [name]);

  return (
    <div>
      <span>{name}</span>
      <Button label="Click" onClick={() => setCount(c => c + 1)} />
      <span>{count}</span>
    </div>
  );
}
`;

const TYPE_FIXTURE = `
export interface User {
  id: string;
  name: string;
  email: string;
}

export type Status = 'active' | 'inactive';

export enum Role {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest',
}
`;

const COMPLEXITY_FIXTURE = `
export function complexFunction(x: number): string {
  if (x > 10) {
    for (let i = 0; i < x; i++) {
      if (i % 2 === 0) {
        console.log(i);
      }
    }
  } else if (x < 0) {
    while (x < 0) {
      x++;
    }
  }

  switch (x) {
    case 0:
      return 'zero';
    case 1:
      return 'one';
    default:
      return x > 5 ? 'big' : 'small';
  }
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = 'test-project';
const FILE_PATH = 'src/test.ts';
const TSX_FILE_PATH = 'src/test.tsx';

function createFileNode(
  graph: InMemoryGraph,
  projectId: string,
  path: string,
): FileNode {
  const fileId = `file:${projectId}:${path}`;
  const node: FileNode = {
    id: fileId,
    type: 'file',
    projectId,
    path,
    extension: path.split('.').pop()!,
    size: 100,
    contentHash: 'abc123',
    lastModified: Date.now(),
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  graph.addNode(node);
  return node;
}

function enrichFixture(
  graph: InMemoryGraph,
  enricher: ASTEnricher,
  content: string,
  filePath: string = FILE_PATH,
  scriptKind: ts.ScriptKind = ts.ScriptKind.TS,
): FileNode {
  const fileNode = createFileNode(graph, PROJECT_ID, filePath);
  enricher.enrichFileContent(PROJECT_ID, fileNode.id, filePath, content, scriptKind);
  return fileNode;
}

function getNodesByType<T extends { type: string }>(
  graph: InMemoryGraph,
  type: string,
): T[] {
  return graph.getAllNodes().filter((n) => n.type === type) as unknown as T[];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ASTEnricher', () => {
  let graph: InMemoryGraph;
  let eventBus: EventBus;
  let enricher: ASTEnricher;

  beforeEach(() => {
    graph = new InMemoryGraph();
    eventBus = new EventBus();
    enricher = new ASTEnricher(graph, eventBus);
  });

  // -------------------------------------------------------------------------
  // Function Extraction
  // -------------------------------------------------------------------------

  describe('function extraction', () => {
    it('should extract function declarations', () => {
      enrichFixture(graph, enricher, FUNCTION_FIXTURE);

      const functions = getNodesByType<FunctionNode>(graph, 'function');
      const names = functions.map((f) => f.name);

      expect(names).toContain('greet');
      expect(names).toContain('main');
    });

    it('should extract arrow functions assigned to const', () => {
      enrichFixture(graph, enricher, FUNCTION_FIXTURE);

      const functions = getNodesByType<FunctionNode>(graph, 'function');
      const addFn = functions.find((f) => f.name === 'add');

      expect(addFn).toBeDefined();
    });

    it('should detect export status', () => {
      enrichFixture(graph, enricher, FUNCTION_FIXTURE);

      const functions = getNodesByType<FunctionNode>(graph, 'function');
      const greetFn = functions.find((f) => f.name === 'greet');
      const addFn = functions.find((f) => f.name === 'add');

      expect(greetFn!.isExported).toBe(true);
      expect(addFn!.isExported).toBe(false);
    });

    it('should capture param names', () => {
      enrichFixture(graph, enricher, FUNCTION_FIXTURE);

      const functions = getNodesByType<FunctionNode>(graph, 'function');
      const greetFn = functions.find((f) => f.name === 'greet');
      const addFn = functions.find((f) => f.name === 'add');

      expect(greetFn!.params).toEqual(['name']);
      expect(addFn!.params).toEqual(['a', 'b']);
    });

    it('should capture return type when explicit', () => {
      enrichFixture(graph, enricher, FUNCTION_FIXTURE);

      const functions = getNodesByType<FunctionNode>(graph, 'function');
      const greetFn = functions.find((f) => f.name === 'greet');
      const addFn = functions.find((f) => f.name === 'add');

      expect(greetFn!.returnType).toBe('string');
      expect(addFn!.returnType).toBeNull();
    });

    it('should capture line numbers', () => {
      enrichFixture(graph, enricher, FUNCTION_FIXTURE);

      const functions = getNodesByType<FunctionNode>(graph, 'function');
      const greetFn = functions.find((f) => f.name === 'greet');

      expect(greetFn!.lineStart).toBeGreaterThan(0);
      expect(greetFn!.lineEnd).toBeGreaterThanOrEqual(greetFn!.lineStart);
    });

    it('should calculate complexity with branches', () => {
      enrichFixture(graph, enricher, COMPLEXITY_FIXTURE);

      const functions = getNodesByType<FunctionNode>(graph, 'function');
      const complexFn = functions.find((f) => f.name === 'complexFunction');

      // Base 1 + if + for + if + else if (if) + while + switch + case + case + ternary = 10
      expect(complexFn).toBeDefined();
      expect(complexFn!.complexity).toBeGreaterThan(1);
    });

    it('should set fileId correctly', () => {
      const fileNode = enrichFixture(graph, enricher, FUNCTION_FIXTURE);

      const functions = getNodesByType<FunctionNode>(graph, 'function');
      for (const fn of functions) {
        expect(fn.fileId).toBe(fileNode.id);
      }
    });

    it('should generate deterministic IDs', () => {
      enrichFixture(graph, enricher, FUNCTION_FIXTURE);

      const functions = getNodesByType<FunctionNode>(graph, 'function');
      const greetFn = functions.find((f) => f.name === 'greet');

      expect(greetFn!.id).toMatch(/^fn:test-project:src\/test\.ts:greet:\d+$/);
    });
  });

  // -------------------------------------------------------------------------
  // Class Extraction
  // -------------------------------------------------------------------------

  describe('class extraction', () => {
    it('should extract class name', () => {
      enrichFixture(graph, enricher, CLASS_FIXTURE);

      const classes = getNodesByType<ClassNode>(graph, 'class');
      expect(classes).toHaveLength(1);
      expect(classes[0]!.name).toBe('UserService');
    });

    it('should extract methods list', () => {
      enrichFixture(graph, enricher, CLASS_FIXTURE);

      const classes = getNodesByType<ClassNode>(graph, 'class');
      const cls = classes[0]!;

      expect(cls.methods).toContain('constructor');
      expect(cls.methods).toContain('serialize');
      expect(cls.methods).toContain('getName');
    });

    it('should extract properties list', () => {
      enrichFixture(graph, enricher, CLASS_FIXTURE);

      const classes = getNodesByType<ClassNode>(graph, 'class');
      const cls = classes[0]!;

      expect(cls.properties).toContain('name');
      expect(cls.properties).toContain('age');
    });

    it('should detect implements', () => {
      enrichFixture(graph, enricher, CLASS_FIXTURE);

      const classes = getNodesByType<ClassNode>(graph, 'class');
      const cls = classes[0]!;

      expect(cls.implements).toContain('Serializable');
    });

    it('should detect export status', () => {
      enrichFixture(graph, enricher, CLASS_FIXTURE);

      const classes = getNodesByType<ClassNode>(graph, 'class');
      expect(classes[0]!.isExported).toBe(true);
    });

    it('should set fileId correctly', () => {
      const fileNode = enrichFixture(graph, enricher, CLASS_FIXTURE);

      const classes = getNodesByType<ClassNode>(graph, 'class');
      expect(classes[0]!.fileId).toBe(fileNode.id);
    });
  });

  // -------------------------------------------------------------------------
  // Component Detection
  // -------------------------------------------------------------------------

  describe('component detection', () => {
    it('should detect arrow function components', () => {
      enrichFixture(graph, enricher, COMPONENT_FIXTURE, TSX_FILE_PATH, ts.ScriptKind.TSX);

      const components = getNodesByType<ComponentNode>(graph, 'component');
      const button = components.find((c) => c.name === 'Button');

      expect(button).toBeDefined();
    });

    it('should detect function declaration components', () => {
      enrichFixture(graph, enricher, COMPONENT_FIXTURE, TSX_FILE_PATH, ts.ScriptKind.TSX);

      const components = getNodesByType<ComponentNode>(graph, 'component');
      const userCard = components.find((c) => c.name === 'UserCard');

      expect(userCard).toBeDefined();
    });

    it('should extract props from destructured parameter', () => {
      enrichFixture(graph, enricher, COMPONENT_FIXTURE, TSX_FILE_PATH, ts.ScriptKind.TSX);

      const components = getNodesByType<ComponentNode>(graph, 'component');
      const button = components.find((c) => c.name === 'Button');

      expect(button!.props).toContain('label');
      expect(button!.props).toContain('onClick');
    });

    it('should extract hooks', () => {
      enrichFixture(graph, enricher, COMPONENT_FIXTURE, TSX_FILE_PATH, ts.ScriptKind.TSX);

      const components = getNodesByType<ComponentNode>(graph, 'component');
      const userCard = components.find((c) => c.name === 'UserCard');

      expect(userCard!.hooks).toContain('useState');
      expect(userCard!.hooks).toContain('useEffect');
    });

    it('should NOT create FunctionNode for components', () => {
      enrichFixture(graph, enricher, COMPONENT_FIXTURE, TSX_FILE_PATH, ts.ScriptKind.TSX);

      const functions = getNodesByType<FunctionNode>(graph, 'function');
      const componentNames = getNodesByType<ComponentNode>(graph, 'component').map((c) => c.name);

      for (const fn of functions) {
        expect(componentNames).not.toContain(fn.name);
      }
    });

    it('should set fileId correctly for components', () => {
      const fileNode = enrichFixture(
        graph,
        enricher,
        COMPONENT_FIXTURE,
        TSX_FILE_PATH,
        ts.ScriptKind.TSX,
      );

      const components = getNodesByType<ComponentNode>(graph, 'component');
      for (const comp of components) {
        expect(comp.fileId).toBe(fileNode.id);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Type Extraction
  // -------------------------------------------------------------------------

  describe('type extraction', () => {
    it('should extract interfaces with fields', () => {
      enrichFixture(graph, enricher, TYPE_FIXTURE);

      const types = getNodesByType<TypeDefinitionNode>(graph, 'type');
      const user = types.find((t) => t.name === 'User');

      expect(user).toBeDefined();
      expect(user!.kind).toBe('interface');
      expect(user!.fields).toContain('id');
      expect(user!.fields).toContain('name');
      expect(user!.fields).toContain('email');
    });

    it('should extract type aliases', () => {
      enrichFixture(graph, enricher, TYPE_FIXTURE);

      const types = getNodesByType<TypeDefinitionNode>(graph, 'type');
      const status = types.find((t) => t.name === 'Status');

      expect(status).toBeDefined();
      expect(status!.kind).toBe('type');
    });

    it('should extract enums with members', () => {
      enrichFixture(graph, enricher, TYPE_FIXTURE);

      const types = getNodesByType<TypeDefinitionNode>(graph, 'type');
      const role = types.find((t) => t.name === 'Role');

      expect(role).toBeDefined();
      expect(role!.kind).toBe('enum');
      expect(role!.fields).toContain('Admin');
      expect(role!.fields).toContain('User');
      expect(role!.fields).toContain('Guest');
    });

    it('should detect export status for types', () => {
      enrichFixture(graph, enricher, TYPE_FIXTURE);

      const types = getNodesByType<TypeDefinitionNode>(graph, 'type');
      for (const t of types) {
        expect(t.isExported).toBe(true);
      }
    });

    it('should set fileId correctly for types', () => {
      const fileNode = enrichFixture(graph, enricher, TYPE_FIXTURE);

      const types = getNodesByType<TypeDefinitionNode>(graph, 'type');
      for (const t of types) {
        expect(t.fileId).toBe(fileNode.id);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Edge Creation
  // -------------------------------------------------------------------------

  describe('edge creation', () => {
    it('should create CALLS edges between functions', () => {
      enrichFixture(graph, enricher, FUNCTION_FIXTURE);

      const edges = graph.getAllEdges().filter((e) => e.type === 'calls');
      const functions = getNodesByType<FunctionNode>(graph, 'function');
      const mainFn = functions.find((f) => f.name === 'main');
      const greetFn = functions.find((f) => f.name === 'greet');
      const addFn = functions.find((f) => f.name === 'add');

      expect(mainFn).toBeDefined();
      expect(greetFn).toBeDefined();
      expect(addFn).toBeDefined();

      // main calls greet
      const mainCallsGreet = edges.find(
        (e) => e.sourceId === mainFn!.id && e.targetId === greetFn!.id,
      );
      expect(mainCallsGreet).toBeDefined();

      // main calls add
      const mainCallsAdd = edges.find(
        (e) => e.sourceId === mainFn!.id && e.targetId === addFn!.id,
      );
      expect(mainCallsAdd).toBeDefined();
    });

    it('should create RENDERS edges from component to component', () => {
      enrichFixture(graph, enricher, COMPONENT_FIXTURE, TSX_FILE_PATH, ts.ScriptKind.TSX);

      const edges = graph.getAllEdges().filter((e) => e.type === 'renders');
      const components = getNodesByType<ComponentNode>(graph, 'component');
      const userCard = components.find((c) => c.name === 'UserCard');
      const button = components.find((c) => c.name === 'Button');

      expect(userCard).toBeDefined();
      expect(button).toBeDefined();

      const rendersEdge = edges.find(
        (e) => e.sourceId === userCard!.id && e.targetId === button!.id,
      );
      expect(rendersEdge).toBeDefined();
    });

    it('should create IMPLEMENTS edges from class to interface', () => {
      enrichFixture(graph, enricher, CLASS_FIXTURE);

      const edges = graph.getAllEdges().filter((e) => e.type === 'implements');
      const classes = getNodesByType<ClassNode>(graph, 'class');
      const types = getNodesByType<TypeDefinitionNode>(graph, 'type');
      const userService = classes.find((c) => c.name === 'UserService');
      const serializable = types.find((t) => t.name === 'Serializable');

      expect(userService).toBeDefined();
      expect(serializable).toBeDefined();

      const implEdge = edges.find(
        (e) => e.sourceId === userService!.id && e.targetId === serializable!.id,
      );
      expect(implEdge).toBeDefined();
    });

    it('should not create duplicate edges on re-enrichment', () => {
      const fileNode = createFileNode(graph, PROJECT_ID, FILE_PATH);

      enricher.enrichFileContent(PROJECT_ID, fileNode.id, FILE_PATH, FUNCTION_FIXTURE);
      const edgeCountAfterFirst = graph.getAllEdges().length;

      // Re-enrich same content — should not add duplicates
      enricher.enrichFileContent(PROJECT_ID, fileNode.id, FILE_PATH, FUNCTION_FIXTURE);
      const edgeCountAfterSecond = graph.getAllEdges().length;

      expect(edgeCountAfterSecond).toBe(edgeCountAfterFirst);
    });
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  describe('idempotency', () => {
    it('should not duplicate nodes on re-enrichment', () => {
      const fileNode = createFileNode(graph, PROJECT_ID, FILE_PATH);

      enricher.enrichFileContent(PROJECT_ID, fileNode.id, FILE_PATH, FUNCTION_FIXTURE);
      const nodeCountAfterFirst = graph.getAllNodes().length;

      enricher.enrichFileContent(PROJECT_ID, fileNode.id, FILE_PATH, FUNCTION_FIXTURE);
      const nodeCountAfterSecond = graph.getAllNodes().length;

      expect(nodeCountAfterSecond).toBe(nodeCountAfterFirst);
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('should skip files with invalid syntax without crashing', () => {
      const badContent = `
        function broken( {
          this is not valid typescript at all
        }
      `;

      // ts.createSourceFile is lenient — it produces a tree with diagnostics but doesn't throw.
      // The enricher should handle this gracefully.
      expect(() => {
        enrichFixture(graph, enricher, badContent);
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Integration — enrichProject
  // -------------------------------------------------------------------------

  describe('enrichProject integration', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'ast-enricher-test-'));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should enrich all files in a project and emit events', async () => {
      // Set up temp project with files
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      writeFileSync(
        join(tmpDir, 'src', 'utils.ts'),
        `export function helper(x: string): string { return x.toUpperCase(); }`,
      );
      writeFileSync(
        join(tmpDir, 'src', 'App.tsx'),
        `export const App = () => { return <div>Hello</div>; };`,
      );

      // First build Layer 1
      const builder = new GraphBuilder(graph, eventBus);
      await builder.buildProject(PROJECT_ID, tmpDir);

      // Collect Layer 2 events
      const layer2Events: GraphEvent[] = [];
      eventBus.onAll((e) => {
        if ('phase' in e && (e as any).phase === 'layer2') {
          layer2Events.push(e);
        }
      });

      // Run Layer 2 enrichment
      await enricher.enrichProject(PROJECT_ID, tmpDir);

      // Verify events
      const eventTypes = layer2Events.map((e) => e.type);
      expect(eventTypes[0]).toBe('graph:build:start');
      expect(eventTypes[eventTypes.length - 1]).toBe('graph:build:complete');
      expect(eventTypes.filter((t) => t === 'graph:build:progress').length).toBeGreaterThan(0);

      // Verify start event has phase layer2
      const startEvent = layer2Events.find((e) => e.type === 'graph:build:start');
      expect((startEvent as any).phase).toBe('layer2');
    });

    it('should link Layer 2 nodes to Layer 1 FileNodes via fileId', async () => {
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      writeFileSync(
        join(tmpDir, 'src', 'index.ts'),
        `export function main(): void { console.log('hello'); }`,
      );

      // Build Layer 1
      const builder = new GraphBuilder(graph, eventBus);
      await builder.buildProject(PROJECT_ID, tmpDir);

      // Run Layer 2
      await enricher.enrichProject(PROJECT_ID, tmpDir);

      // Get the Layer 1 file node
      const fileNode = graph.getFileByPath('src/index.ts');
      expect(fileNode).toBeDefined();

      // Get Layer 2 function nodes
      const functions = getNodesByType<FunctionNode>(graph, 'function');
      expect(functions.length).toBeGreaterThan(0);

      // All functions should reference the correct fileId
      for (const fn of functions) {
        expect(fn.fileId).toBe(fileNode!.id);
      }
    });

    it('should handle mixed file types (.ts, .tsx, .json)', async () => {
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      writeFileSync(
        join(tmpDir, 'src', 'utils.ts'),
        `export const add = (a: number, b: number) => a + b;`,
      );
      writeFileSync(
        join(tmpDir, 'src', 'App.tsx'),
        `export const App = () => <div>Hello</div>;`,
      );
      writeFileSync(join(tmpDir, 'src', 'config.json'), `{"key": "value"}`);

      // Build Layer 1
      const builder = new GraphBuilder(graph, eventBus);
      await builder.buildProject(PROJECT_ID, tmpDir);

      // Run Layer 2
      await enricher.enrichProject(PROJECT_ID, tmpDir);

      // Should have a function from utils.ts
      const functions = getNodesByType<FunctionNode>(graph, 'function');
      expect(functions.some((f) => f.name === 'add')).toBe(true);

      // Should have a component from App.tsx
      const components = getNodesByType<ComponentNode>(graph, 'component');
      expect(components.some((c) => c.name === 'App')).toBe(true);

      // JSON file should NOT produce any Layer 2 nodes
      const allLayer2 = graph.getAllNodes().filter((n) => 'fileId' in n);
      const jsonFileId = `file:${PROJECT_ID}:src/config.json`;
      const jsonLayer2Nodes = allLayer2.filter((n) => (n as any).fileId === jsonFileId);
      expect(jsonLayer2Nodes).toHaveLength(0);
    });

    it('should skip unparseable files gracefully', async () => {
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      writeFileSync(join(tmpDir, 'src', 'good.ts'), `export const x = 1;`);
      // Binary-like content that won't cause ts.createSourceFile to crash
      // but may produce garbage AST — enricher should still not throw
      writeFileSync(join(tmpDir, 'src', 'weird.ts'), Buffer.from([0x00, 0x01, 0x02, 0xff]));

      const builder = new GraphBuilder(graph, eventBus);
      await builder.buildProject(PROJECT_ID, tmpDir);

      // Should not throw
      await expect(enricher.enrichProject(PROJECT_ID, tmpDir)).resolves.not.toThrow();
    });
  });
});
