import path from 'path';
import ts from 'typescript';

export class FileNode {
  constructor(filePath) {
    this.filePath = path.normalize(filePath);
    this.imports = [];
    this.exports = [];
    this.reExports = [];
    this.consumers = new Set();
    this.featureName = null;
  }
}

export class ImportGraph {
  constructor(projectRoot = process.cwd(), resolver = null) {
    this.projectRoot = path.normalize(projectRoot);
    this.resolver = resolver;
    this.nodes = new Map(); // normalizedPath -> FileNode
  }

  getNode(filePath) {
    const normalized = path.normalize(filePath);
    if (!this.nodes.has(normalized)) {
      this.nodes.set(normalized, new FileNode(normalized));
    }
    return this.nodes.get(normalized);
  }

  detectFeature(filePath) {
    const rel = path.relative(this.projectRoot, filePath).replace(/\\/g, '/');
    const match = rel.match(/^src\/components\/([^/]+)/);
    return match ? match[1] : null;
  }

  addFile(filePath, sourceFile) {
    const normalized = path.normalize(filePath);
    const node = this.getNode(normalized);
    node.featureName = this.detectFeature(normalized);

    if (!sourceFile || !sourceFile.statements) return node;

    for (const stmt of sourceFile.statements) {
      // 1. Import declarations: import ... from '...'
      if (ts.isImportDeclaration(stmt)) {
        if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
          const specifier = stmt.moduleSpecifier.text;
          const isTypeOnly = Boolean(stmt.importClause && stmt.importClause.isTypeOnly);
          const importedSymbols = [];

          if (stmt.importClause) {
            if (stmt.importClause.name) {
              importedSymbols.push({ name: stmt.importClause.name.text, isDefault: true });
            }
            if (stmt.importClause.namedBindings) {
              if (ts.isNamedImports(stmt.importClause.namedBindings)) {
                for (const el of stmt.importClause.namedBindings.elements) {
                  importedSymbols.push({
                    name: el.name.text,
                    propertyName: el.propertyName ? el.propertyName.text : el.name.text,
                    isTypeOnly: isTypeOnly || Boolean(el.isTypeOnly),
                  });
                }
              } else if (ts.isNamespaceImport(stmt.importClause.namedBindings)) {
                importedSymbols.push({
                  name: stmt.importClause.namedBindings.name.text,
                  isNamespace: true,
                });
              }
            }
          }

          const resolution = this.resolver
            ? this.resolver.resolve(normalized, specifier)
            : { resolvedPath: null, isExternal: false };

          node.imports.push({
            specifier,
            resolvedPath: resolution.resolvedPath,
            isExternal: resolution.isExternal,
            isTypeOnly,
            importedSymbols,
            node: stmt,
          });

          if (resolution.resolvedPath) {
            const targetNode = this.getNode(resolution.resolvedPath);
            targetNode.consumers.add(normalized);
          }
        }
      }

      // 2. Export declarations: export { X } from '...', export * from '...'
      if (ts.isExportDeclaration(stmt)) {
        const isTypeOnly = Boolean(stmt.isTypeOnly);
        if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
          const specifier = stmt.moduleSpecifier.text;
          const isStar = !stmt.exportClause;
          const exportedSymbols = [];

          if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
            for (const el of stmt.exportClause.elements) {
              exportedSymbols.push({
                name: el.name.text,
                propertyName: el.propertyName ? el.propertyName.text : el.name.text,
                isTypeOnly: isTypeOnly || Boolean(el.isTypeOnly),
              });
            }
          }

          const resolution = this.resolver
            ? this.resolver.resolve(normalized, specifier)
            : { resolvedPath: null, isExternal: false };

          node.reExports.push({
            specifier,
            resolvedPath: resolution.resolvedPath,
            isExternal: resolution.isExternal,
            isStar,
            isTypeOnly,
            exportedSymbols,
            node: stmt,
          });

          if (resolution.resolvedPath) {
            const targetNode = this.getNode(resolution.resolvedPath);
            targetNode.consumers.add(normalized);
          }
        } else if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
          // Local named export: export { a, b }
          for (const el of stmt.exportClause.elements) {
            node.exports.push({
              name: el.name.text,
              isDefault: el.name.text === 'default',
              isTypeOnly: isTypeOnly || Boolean(el.isTypeOnly),
              node: el,
            });
          }
        }
      }

      // 3. Export assignments: export default X
      if (ts.isExportAssignment(stmt)) {
        node.exports.push({
          name: 'default',
          isDefault: true,
          isTypeOnly: false,
          node: stmt,
        });
      }

      // 4. Modifiers export: export const X = ..., export function X() ...
      const modifiers = ts.getModifiers(stmt) || [];
      const isExported = modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const isDefault = modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

      if (isExported) {
        if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) {
          if (stmt.name && ts.isIdentifier(stmt.name)) {
            node.exports.push({
              name: stmt.name.text,
              isDefault,
              isTypeOnly: ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt),
              node: stmt,
            });
          }
        } else if (ts.isVariableStatement(stmt)) {
          for (const decl of stmt.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)) {
              node.exports.push({
                name: decl.name.text,
                isDefault: false,
                isTypeOnly: false,
                node: decl,
              });
            }
          }
        }
      }
    }

    return node;
  }

  resolveSymbolSource(startFilePath, symbolName, visited = new Set()) {
    const normalized = path.normalize(startFilePath);
    if (visited.has(normalized)) return null;
    visited.add(normalized);

    const node = this.nodes.get(normalized);
    if (!node) return null;

    // Check direct exports
    const direct = node.exports.find((e) => e.name === symbolName);
    if (direct) return { file: normalized, exportInfo: direct };

    // Check re-exports
    for (const re of node.reExports) {
      if (!re.resolvedPath) continue;

      if (re.isStar) {
        const found = this.resolveSymbolSource(re.resolvedPath, symbolName, visited);
        if (found) return found;
      } else {
        const matched = re.exportedSymbols.find((s) => s.name === symbolName);
        if (matched) {
          const found = this.resolveSymbolSource(re.resolvedPath, matched.propertyName || symbolName, visited);
          if (found) return found;
        }
      }
    }

    return null;
  }

  getDirectExternalConsumers(filePath) {
    const node = this.nodes.get(path.normalize(filePath));
    if (!node) return [];
    const direct = [];
    for (const consumerPath of node.consumers) {
      const consumerNode = this.nodes.get(consumerPath);
      if (consumerNode && consumerNode.featureName !== node.featureName) {
        direct.push(consumerPath);
      }
    }
    return direct;
  }
}
