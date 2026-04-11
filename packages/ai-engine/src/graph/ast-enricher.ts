/**
 * ASTEnricher — Layer 2 AST enrichment for the code graph
 * Parses TypeScript/TSX files to extract functions, classes, components, and types.
 * Runs progressively in background after Layer 1 build completes.
 *
 * Uses TypeScript compiler API (ts.createSourceFile) for fast single-file parsing.
 * No full program creation or type checker — keeps it fast.
 *
 * @author Subash Karki
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { relative, extname, resolve } from 'node:path';
import ts from 'typescript';
import type {
  FunctionNode,
  ClassNode,
  ComponentNode,
  TypeDefinitionNode,
  GraphEdge,
  FileNode,
  GraphNode,
} from '../types/graph.js';
import type { EventBus } from '../events/event-bus.js';
import type { InMemoryGraph } from './in-memory-graph.js';

/** File extensions eligible for AST enrichment */
const AST_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/** Branch-point syntax kinds for cyclomatic complexity */
const BRANCH_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.CatchClause,
]);

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

interface ExtractedFunction {
  name: string;
  params: string[];
  returnType: string | null;
  lineStart: number;
  lineEnd: number;
  isExported: boolean;
  complexity: number;
  body: ts.Node | undefined;
}

interface ExtractedClass {
  name: string;
  methods: string[];
  properties: string[];
  implements: string[];
  lineStart: number;
  lineEnd: number;
  isExported: boolean;
}

interface ExtractedComponent {
  name: string;
  props: string[];
  hooks: string[];
  lineStart: number;
  lineEnd: number;
  isExported: boolean;
  body: ts.Node | undefined;
}

interface ExtractedType {
  name: string;
  kind: 'interface' | 'type' | 'enum';
  fields: string[];
  lineStart: number;
  lineEnd: number;
  isExported: boolean;
}

// ---------------------------------------------------------------------------
// ASTEnricher
// ---------------------------------------------------------------------------

export class ASTEnricher {
  constructor(
    private graph: InMemoryGraph,
    private eventBus: EventBus,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Enrich all files for a project with Layer 2 AST nodes.
   * Emits progress events as it processes each file.
   */
  async enrichProject(projectId: string, rootDir: string): Promise<void> {
    const startTime = Date.now();

    // Get all FileNodes for this project
    const allNodes = this.graph.getNodesByProject(projectId);
    const fileNodes = allNodes.filter(
      (n): n is FileNode =>
        n.type === 'file' && AST_EXTENSIONS.has('.' + (n as FileNode).extension),
    );

    this.eventBus.emit({
      type: 'graph:build:start',
      projectId,
      phase: 'layer2',
      totalFiles: fileNodes.length,
      timestamp: Date.now(),
    });

    let processedCount = 0;

    // Build name lookups once before the file loop (avoids O(n²) per-file rebuild)
    const projectFunctions = this.buildNameLookup(projectId, 'function');
    const projectComponents = this.buildNameLookup(projectId, 'component');
    const projectTypes = this.buildNameLookup(projectId, 'type');

    for (const fileNode of fileNodes) {
      try {
        const absPath = this.resolveAbsPath(rootDir, fileNode.path);
        const content = await readFile(absPath, 'utf-8');
        const scriptKind = this.getScriptKind(fileNode.path);
        this.enrichFileContent(projectId, fileNode.id, fileNode.path, content, scriptKind, {
          functions: projectFunctions,
          components: projectComponents,
          types: projectTypes,
        });
      } catch (err) {
        this.eventBus.emit({
          type: 'graph:build:error',
          projectId,
          phase: 'layer2',
          error: err instanceof Error ? err.message : String(err),
          file: fileNode.path,
          timestamp: Date.now(),
        });
      }

      processedCount++;
      this.eventBus.emit({
        type: 'graph:build:progress',
        projectId,
        phase: 'layer2',
        current: processedCount,
        total: fileNodes.length,
        currentFile: fileNode.path,
        timestamp: Date.now(),
      });
    }

    this.eventBus.emit({
      type: 'graph:build:complete',
      projectId,
      phase: 'layer2',
      stats: {
        files: fileNodes.length,
        edges: this.graph.stats.edges,
        durationMs: Date.now() - startTime,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Enrich a single file (sync, for incremental updates).
   * Reads the file from disk and parses its AST.
   */
  enrichFile(projectId: string, rootDir: string, filePath: string): void {
    const relPath = relative(rootDir, filePath);
    const ext = extname(filePath);
    if (!AST_EXTENSIONS.has(ext)) return;

    const fileNode = this.graph.getFileByPath(relPath);
    if (!fileNode) return;

    try {
      const content = readFileSync(filePath, 'utf-8');
      const scriptKind = this.getScriptKind(relPath);
      this.enrichFileContent(projectId, fileNode.id, relPath, content, scriptKind);
    } catch {
      // Skip files that can't be read
    }
  }

  /**
   * Package-internal method for enriching from string content.
   * Used by tests to avoid filesystem access.
   */
  enrichFileContent(
    projectId: string,
    fileId: string,
    relativePath: string,
    content: string,
    scriptKind: ts.ScriptKind = ts.ScriptKind.TS,
    prebuiltLookups?: {
      functions: Map<string, string>;
      components: Map<string, string>;
      types: Map<string, string>;
    },
  ): void {
    let sourceFile: ts.SourceFile;
    try {
      sourceFile = ts.createSourceFile(
        relativePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        scriptKind,
      );
    } catch {
      // File couldn't be parsed — skip silently
      return;
    }

    const now = Date.now();

    // Extract all declarations
    const functions = this.extractFunctions(sourceFile);
    const classes = this.extractClasses(sourceFile);
    const types = this.extractTypes(sourceFile);

    // Separate components from functions
    const components: ExtractedComponent[] = [];
    const pureFunctions: ExtractedFunction[] = [];

    for (const fn of functions) {
      if (this.isReactComponent(fn, sourceFile)) {
        components.push({
          name: fn.name,
          props: this.extractProps(fn, sourceFile),
          hooks: this.extractHooks(fn.body, sourceFile),
          lineStart: fn.lineStart,
          lineEnd: fn.lineEnd,
          isExported: fn.isExported,
          body: fn.body,
        });
      } else {
        pureFunctions.push(fn);
      }
    }

    // Build ID maps for edge creation (name → nodeId)
    const functionIds = new Map<string, string>();
    const componentIds = new Map<string, string>();
    const typeIds = new Map<string, string>();
    const classIds = new Map<string, string>();

    // Add FunctionNodes
    for (const fn of pureFunctions) {
      const id = this.functionId(projectId, relativePath, fn.name, fn.lineStart);
      // Idempotent: skip if already exists
      if (this.graph.getNode(id)) continue;

      const node: FunctionNode = {
        id,
        type: 'function',
        projectId,
        name: fn.name,
        fileId,
        params: fn.params,
        returnType: fn.returnType,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
        isExported: fn.isExported,
        complexity: fn.complexity,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };
      this.graph.addNode(node);
      functionIds.set(fn.name, id);
    }

    // Add ClassNodes
    for (const cls of classes) {
      const id = this.classId(projectId, relativePath, cls.name);
      if (this.graph.getNode(id)) continue;

      const node: ClassNode = {
        id,
        type: 'class',
        projectId,
        name: cls.name,
        fileId,
        methods: cls.methods,
        properties: cls.properties,
        implements: cls.implements,
        lineStart: cls.lineStart,
        lineEnd: cls.lineEnd,
        isExported: cls.isExported,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };
      this.graph.addNode(node);
      classIds.set(cls.name, id);
    }

    // Add ComponentNodes
    for (const comp of components) {
      const id = this.componentId(projectId, relativePath, comp.name);
      if (this.graph.getNode(id)) continue;

      const node: ComponentNode = {
        id,
        type: 'component',
        projectId,
        name: comp.name,
        fileId,
        props: comp.props,
        hooks: comp.hooks,
        lineStart: comp.lineStart,
        lineEnd: comp.lineEnd,
        isExported: comp.isExported,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };
      this.graph.addNode(node);
      componentIds.set(comp.name, id);
    }

    // Add TypeDefinitionNodes
    for (const typeDef of types) {
      const id = this.typeId(projectId, relativePath, typeDef.name);
      if (this.graph.getNode(id)) continue;

      const node: TypeDefinitionNode = {
        id,
        type: 'type',
        projectId,
        name: typeDef.name,
        fileId,
        kind: typeDef.kind,
        fields: typeDef.fields,
        lineStart: typeDef.lineStart,
        lineEnd: typeDef.lineEnd,
        isExported: typeDef.isExported,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };
      this.graph.addNode(node);
      typeIds.set(typeDef.name, id);
    }

    // Build a combined lookup for all named entities in this project
    // (uses prebuilt lookups when available to avoid O(n²) per-file rebuild)
    const allProjectFunctions = prebuiltLookups?.functions ?? this.buildNameLookup(projectId, 'function');
    const allProjectComponents = prebuiltLookups?.components ?? this.buildNameLookup(projectId, 'component');
    const allProjectTypes = prebuiltLookups?.types ?? this.buildNameLookup(projectId, 'type');

    // Merge just-added nodes into the lookups (so subsequent files see them)
    for (const [name, id] of functionIds) allProjectFunctions.set(name, id);
    for (const [name, id] of componentIds) allProjectComponents.set(name, id);
    for (const [name, id] of typeIds) allProjectTypes.set(name, id);
    for (const [name, id] of classIds) {
      // Classes are not in the "function" lookup but we need them for IMPLEMENTS
    }

    // Create CALLS edges for functions
    for (const fn of pureFunctions) {
      if (!fn.body) continue;
      const sourceId = functionIds.get(fn.name);
      if (!sourceId) continue;

      const callees = this.extractCallExpressionNames(fn.body);
      for (const calleeName of callees) {
        const targetId = allProjectFunctions.get(calleeName);
        if (targetId && targetId !== sourceId) {
          this.addEdgeIfMissing(sourceId, targetId, 'calls', projectId, now);
        }
      }
    }

    // Create CALLS, USES_HOOK, and RENDERS edges for components
    for (const comp of components) {
      if (!comp.body) continue;
      const sourceId = componentIds.get(comp.name);
      if (!sourceId) continue;

      // USES_HOOK edges
      for (const hookName of comp.hooks) {
        const hookTargetId = allProjectFunctions.get(hookName);
        if (hookTargetId) {
          this.addEdgeIfMissing(sourceId, hookTargetId, 'uses_hook', projectId, now);
        }
      }

      // RENDERS edges — find JSX tag names that match known components
      const jsxTagNames = this.extractJsxTagNames(comp.body);
      for (const tagName of jsxTagNames) {
        const renderTargetId = allProjectComponents.get(tagName);
        if (renderTargetId && renderTargetId !== sourceId) {
          this.addEdgeIfMissing(sourceId, renderTargetId, 'renders', projectId, now);
        }
      }

      // CALLS edges for non-hook calls in components
      const callees = this.extractCallExpressionNames(comp.body);
      for (const calleeName of callees) {
        // Skip hooks (they're already covered by uses_hook)
        if (calleeName.startsWith('use') && calleeName.length > 3 && calleeName[3] === calleeName[3]!.toUpperCase()) continue;
        const targetId = allProjectFunctions.get(calleeName);
        if (targetId && targetId !== sourceId) {
          this.addEdgeIfMissing(sourceId, targetId, 'calls', projectId, now);
        }
      }
    }

    // Create IMPLEMENTS edges for classes
    for (const cls of classes) {
      const sourceId = classIds.get(cls.name);
      if (!sourceId) continue;

      for (const ifaceName of cls.implements) {
        const targetId = allProjectTypes.get(ifaceName);
        if (targetId) {
          this.addEdgeIfMissing(sourceId, targetId, 'implements', projectId, now);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // AST Extraction — Functions
  // -------------------------------------------------------------------------

  private extractFunctions(sourceFile: ts.SourceFile): ExtractedFunction[] {
    const results: ExtractedFunction[] = [];

    const visit = (node: ts.Node): void => {
      // function foo() {}
      if (ts.isFunctionDeclaration(node) && node.name) {
        results.push(this.parseFunctionLike(node, node.name.text, sourceFile));
        return; // Don't recurse into function body for nested functions
      }

      // const foo = () => {} / const foo = function() {}
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            decl.initializer &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
          ) {
            const fn = this.parseFunctionLikeExpression(
              decl,
              decl.name.text,
              decl.initializer,
              node,
              sourceFile,
            );
            results.push(fn);
          }
        }
        return;
      }

      // Only recurse into top-level declarations (export default, etc.)
      if (ts.isExportAssignment(node) && node.expression) {
        if (ts.isFunctionExpression(node.expression) && node.expression.name) {
          results.push(
            this.parseFunctionLike(node.expression, node.expression.name.text, sourceFile),
          );
          return;
        }
      }

      // export default function foo() {}
      ts.forEachChild(node, visit);
    };

    // Only visit top-level statements
    for (const stmt of sourceFile.statements) {
      visit(stmt);
    }

    return results;
  }

  private parseFunctionLike(
    node: ts.FunctionDeclaration | ts.FunctionExpression,
    name: string,
    sourceFile: ts.SourceFile,
  ): ExtractedFunction {
    const params = node.parameters.map((p) => {
      if (ts.isIdentifier(p.name)) return p.name.text;
      return p.name.getText(sourceFile);
    });

    const returnType = node.type ? node.type.getText(sourceFile) : null;
    const lineStart = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const lineEnd = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    const isExported = this.hasExportModifier(node);
    const complexity = this.calculateComplexity(node);

    return {
      name,
      params,
      returnType,
      lineStart,
      lineEnd,
      isExported,
      complexity,
      body: node.body,
    };
  }

  private parseFunctionLikeExpression(
    decl: ts.VariableDeclaration,
    name: string,
    funcExpr: ts.ArrowFunction | ts.FunctionExpression,
    varStatement: ts.VariableStatement,
    sourceFile: ts.SourceFile,
  ): ExtractedFunction {
    const params = funcExpr.parameters.map((p) => {
      if (ts.isIdentifier(p.name)) return p.name.text;
      return p.name.getText(sourceFile);
    });

    const returnType = funcExpr.type ? funcExpr.type.getText(sourceFile) : null;
    const lineStart =
      sourceFile.getLineAndCharacterOfPosition(varStatement.getStart(sourceFile)).line + 1;
    const lineEnd = sourceFile.getLineAndCharacterOfPosition(varStatement.getEnd()).line + 1;
    const isExported = this.hasExportModifier(varStatement);
    const complexity = this.calculateComplexity(funcExpr);

    return {
      name,
      params,
      returnType,
      lineStart,
      lineEnd,
      isExported,
      complexity,
      body: funcExpr.body,
    };
  }

  // -------------------------------------------------------------------------
  // AST Extraction — Classes
  // -------------------------------------------------------------------------

  private extractClasses(sourceFile: ts.SourceFile): ExtractedClass[] {
    const results: ExtractedClass[] = [];

    for (const stmt of sourceFile.statements) {
      let classDecl: ts.ClassDeclaration | undefined;

      if (ts.isClassDeclaration(stmt) && stmt.name) {
        classDecl = stmt;
      }

      if (!classDecl) continue;

      const methods: string[] = [];
      const properties: string[] = [];
      const implementsList: string[] = [];

      // Extract implements
      if (classDecl.heritageClauses) {
        for (const clause of classDecl.heritageClauses) {
          if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
            for (const type of clause.types) {
              implementsList.push(type.expression.getText(sourceFile));
            }
          }
        }
      }

      // Extract members
      for (const member of classDecl.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          methods.push(member.name.getText(sourceFile));
        } else if (ts.isConstructorDeclaration(member)) {
          methods.push('constructor');
        } else if (ts.isPropertyDeclaration(member) && member.name) {
          properties.push(member.name.getText(sourceFile));
        }
      }

      const lineStart =
        sourceFile.getLineAndCharacterOfPosition(classDecl.getStart(sourceFile)).line + 1;
      const lineEnd = sourceFile.getLineAndCharacterOfPosition(classDecl.getEnd()).line + 1;
      const isExported = this.hasExportModifier(classDecl);

      results.push({
        name: classDecl.name!.text,
        methods,
        properties,
        implements: implementsList,
        lineStart,
        lineEnd,
        isExported,
      });
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // AST Extraction — Types
  // -------------------------------------------------------------------------

  private extractTypes(sourceFile: ts.SourceFile): ExtractedType[] {
    const results: ExtractedType[] = [];

    for (const stmt of sourceFile.statements) {
      // interface Foo {}
      if (ts.isInterfaceDeclaration(stmt)) {
        const fields = stmt.members
          .filter((m): m is ts.PropertySignature => ts.isPropertySignature(m))
          .map((m) => m.name.getText(sourceFile));

        // Also include method signatures
        const methodFields = stmt.members
          .filter((m): m is ts.MethodSignature => ts.isMethodSignature(m))
          .map((m) => m.name.getText(sourceFile));

        results.push({
          name: stmt.name.text,
          kind: 'interface',
          fields: [...fields, ...methodFields],
          lineStart: sourceFile.getLineAndCharacterOfPosition(stmt.getStart(sourceFile)).line + 1,
          lineEnd: sourceFile.getLineAndCharacterOfPosition(stmt.getEnd()).line + 1,
          isExported: this.hasExportModifier(stmt),
        });
      }

      // type Foo = ...
      if (ts.isTypeAliasDeclaration(stmt)) {
        const fields: string[] = [];
        if (ts.isTypeLiteralNode(stmt.type)) {
          for (const m of stmt.type.members) {
            if (ts.isPropertySignature(m) && m.name) {
              fields.push(m.name.getText(sourceFile));
            }
          }
        }

        results.push({
          name: stmt.name.text,
          kind: 'type',
          fields,
          lineStart: sourceFile.getLineAndCharacterOfPosition(stmt.getStart(sourceFile)).line + 1,
          lineEnd: sourceFile.getLineAndCharacterOfPosition(stmt.getEnd()).line + 1,
          isExported: this.hasExportModifier(stmt),
        });
      }

      // enum Foo {}
      if (ts.isEnumDeclaration(stmt)) {
        const fields = stmt.members.map((m) => m.name.getText(sourceFile));

        results.push({
          name: stmt.name.text,
          kind: 'enum',
          fields,
          lineStart: sourceFile.getLineAndCharacterOfPosition(stmt.getStart(sourceFile)).line + 1,
          lineEnd: sourceFile.getLineAndCharacterOfPosition(stmt.getEnd()).line + 1,
          isExported: this.hasExportModifier(stmt),
        });
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Component Detection
  // -------------------------------------------------------------------------

  /**
   * Determine if a function is a React component:
   * 1. Name starts with uppercase
   * 2. Body contains JSX
   */
  private isReactComponent(fn: ExtractedFunction, sourceFile: ts.SourceFile): boolean {
    // Name must start with uppercase
    if (!fn.name || fn.name[0] !== fn.name[0]!.toUpperCase() || fn.name[0] === fn.name[0]!.toLowerCase()) {
      return false;
    }

    // Body must contain JSX
    if (!fn.body) return false;
    return this.containsJsx(fn.body);
  }

  private containsJsx(node: ts.Node): boolean {
    if (
      node.kind === ts.SyntaxKind.JsxElement ||
      node.kind === ts.SyntaxKind.JsxSelfClosingElement ||
      node.kind === ts.SyntaxKind.JsxFragment
    ) {
      return true;
    }

    let found = false;
    ts.forEachChild(node, (child) => {
      if (!found && this.containsJsx(child)) {
        found = true;
      }
    });
    return found;
  }

  /**
   * Extract props from the first parameter's type annotation or destructured names.
   */
  private extractProps(fn: ExtractedFunction, sourceFile: ts.SourceFile): string[] {
    // We need to find the original node to access its parameters
    // Since we stored body, let's use the sourceFile to find the function again
    // For simplicity, look at the function's params — if it's a destructured object,
    // extract the property names
    const props: string[] = [];

    // Walk to find the actual function node
    const findFunc = (node: ts.Node): ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | undefined => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === fn.name) return node;
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            decl.name.text === fn.name &&
            decl.initializer &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
          ) {
            return decl.initializer;
          }
        }
      }
      let result: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | undefined;
      ts.forEachChild(node, (child) => {
        if (!result) result = findFunc(child);
      });
      return result;
    };

    const funcNode = findFunc(sourceFile);
    if (!funcNode || funcNode.parameters.length === 0) return props;

    const firstParam = funcNode.parameters[0]!;

    // Destructured: ({ label, onClick }: Props) => ...
    if (ts.isObjectBindingPattern(firstParam.name)) {
      for (const element of firstParam.name.elements) {
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          props.push(element.name.text);
        }
      }
    }
    // Named: (props: Props) => ... — extract from type if it's a type literal
    else if (firstParam.type && ts.isTypeLiteralNode(firstParam.type)) {
      for (const member of firstParam.type.members) {
        if (ts.isPropertySignature(member) && member.name) {
          props.push(member.name.getText(sourceFile));
        }
      }
    }
    // Named with type reference: (props: ButtonProps) => ... — store the type name
    else if (firstParam.type && ts.isTypeReferenceNode(firstParam.type)) {
      props.push(firstParam.type.typeName.getText(sourceFile));
    }

    return props;
  }

  /**
   * Extract hook calls from a function/component body.
   * Hooks are calls to functions whose name starts with "use" and has uppercase 4th char.
   */
  private extractHooks(body: ts.Node | undefined, sourceFile: ts.SourceFile): string[] {
    if (!body) return [];

    const hooks = new Set<string>();

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const name = this.getCallExpressionName(node);
        if (name && this.isHookName(name)) {
          hooks.add(name);
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(body);
    return [...hooks];
  }

  // -------------------------------------------------------------------------
  // Edge Extraction Helpers
  // -------------------------------------------------------------------------

  /**
   * Extract all call expression names from a node (non-recursive into nested functions).
   */
  private extractCallExpressionNames(body: ts.Node): Set<string> {
    const names = new Set<string>();

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const name = this.getCallExpressionName(node);
        if (name) names.add(name);
      }
      ts.forEachChild(node, visit);
    };

    visit(body);
    return names;
  }

  /**
   * Extract JSX element tag names from a node.
   * Only uppercase-first tags (components), not lowercase (HTML elements).
   */
  private extractJsxTagNames(body: ts.Node): Set<string> {
    const names = new Set<string>();

    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText();
        if (tagName[0] === tagName[0]!.toUpperCase() && tagName[0] !== tagName[0]!.toLowerCase()) {
          names.add(tagName);
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(body);
    return names;
  }

  /**
   * Get the simple name from a CallExpression.
   * `foo(...)` → "foo"
   * `this.foo(...)` → null (skip member expressions for now)
   * `foo.bar(...)` → null
   */
  private getCallExpressionName(node: ts.CallExpression): string | null {
    if (ts.isIdentifier(node.expression)) {
      return node.expression.text;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Complexity
  // -------------------------------------------------------------------------

  /**
   * Calculate cyclomatic complexity by counting branch points.
   * Base complexity is 1.
   */
  private calculateComplexity(node: ts.Node): number {
    let count = 1; // base complexity

    const visit = (child: ts.Node): void => {
      if (BRANCH_KINDS.has(child.kind)) {
        count++;
      }
      // Count logical AND/OR operators
      if (
        ts.isBinaryExpression(child) &&
        (child.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          child.operatorToken.kind === ts.SyntaxKind.BarBarToken)
      ) {
        count++;
      }
      ts.forEachChild(child, visit);
    };

    ts.forEachChild(node, visit);
    return count;
  }

  // -------------------------------------------------------------------------
  // Modifier Helpers
  // -------------------------------------------------------------------------

  private hasExportModifier(node: ts.Node): boolean {
    // Check for export keyword in modifiers
    if (ts.canHaveModifiers(node)) {
      const modifiers = ts.getModifiers(node);
      if (modifiers) {
        return modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      }
    }

    // Check if the parent is an export declaration
    if (node.parent && ts.isExportAssignment(node.parent)) {
      return true;
    }

    return false;
  }

  private isHookName(name: string): boolean {
    return name.startsWith('use') && name.length > 3 && name[3] === name[3]!.toUpperCase();
  }

  // -------------------------------------------------------------------------
  // Name Lookups
  // -------------------------------------------------------------------------

  /**
   * Build a name → id lookup for all nodes of a given type in the project.
   */
  private buildNameLookup(
    projectId: string,
    nodeType: 'function' | 'component' | 'type',
  ): Map<string, string> {
    const lookup = new Map<string, string>();
    const nodes = this.graph.getNodesByProject(projectId);

    for (const node of nodes) {
      if (node.type === nodeType) {
        const named = node as FunctionNode | ComponentNode | TypeDefinitionNode;
        lookup.set(named.name, named.id);
      }
    }

    return lookup;
  }

  // -------------------------------------------------------------------------
  // Edge Creation
  // -------------------------------------------------------------------------

  private addEdgeIfMissing(
    sourceId: string,
    targetId: string,
    edgeType: GraphEdge['type'],
    projectId: string,
    timestamp: number,
  ): void {
    const edgeId = `edge:${sourceId}:${targetId}:${edgeType}`;
    if (this.graph.getEdge(edgeId)) return;

    const edge: GraphEdge = {
      id: edgeId,
      sourceId,
      targetId,
      type: edgeType,
      projectId,
      weight: 1,
      metadata: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.graph.addEdge(edge);
  }

  // -------------------------------------------------------------------------
  // ID Helpers (match Layer 1 patterns)
  // -------------------------------------------------------------------------

  private functionId(projectId: string, relPath: string, name: string, lineStart: number): string {
    const normalizedPath = relPath.split('\\').join('/');
    return `fn:${projectId}:${normalizedPath}:${name}:${lineStart}`;
  }

  private classId(projectId: string, relPath: string, name: string): string {
    const normalizedPath = relPath.split('\\').join('/');
    return `class:${projectId}:${normalizedPath}:${name}`;
  }

  private componentId(projectId: string, relPath: string, name: string): string {
    const normalizedPath = relPath.split('\\').join('/');
    return `component:${projectId}:${normalizedPath}:${name}`;
  }

  private typeId(projectId: string, relPath: string, name: string): string {
    const normalizedPath = relPath.split('\\').join('/');
    return `type:${projectId}:${normalizedPath}:${name}`;
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  private getScriptKind(filePath: string): ts.ScriptKind {
    const ext = extname(filePath).toLowerCase();
    switch (ext) {
      case '.tsx':
        return ts.ScriptKind.TSX;
      case '.ts':
        return ts.ScriptKind.TS;
      case '.jsx':
        return ts.ScriptKind.JSX;
      case '.js':
        return ts.ScriptKind.JS;
      default:
        return ts.ScriptKind.TS;
    }
  }

  private resolveAbsPath(rootDir: string, relPath: string): string {
    return resolve(rootDir, relPath);
  }
}
