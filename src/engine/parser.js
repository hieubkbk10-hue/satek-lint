import fs from 'fs';
import path from 'path';
import ts from 'typescript';

export class AstParser {
  constructor(context = null) {
    this.context = context;
    this.cache = new Map(); // normalized absolute path -> { sourceFile, content }
  }

  getScriptKind(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.tsx':
        return ts.ScriptKind.TSX;
      case '.ts':
      case '.mts':
      case '.cts':
        return ts.ScriptKind.TS;
      case '.jsx':
        return ts.ScriptKind.JSX;
      case '.js':
      case '.mjs':
      case '.cjs':
        return ts.ScriptKind.JS;
      default:
        return ts.ScriptKind.Unknown;
    }
  }

  parse(filePath) {
    const normalized = path.normalize(filePath);
    if (this.cache.has(normalized)) {
      return this.cache.get(normalized);
    }

    try {
      const content = fs.readFileSync(normalized, 'utf8');
      const scriptKind = this.getScriptKind(normalized);
      const sourceFile = ts.createSourceFile(
        normalized,
        content,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
      );

      if (sourceFile.parseDiagnostics && sourceFile.parseDiagnostics.length > 0 && this.context) {
        for (const diag of sourceFile.parseDiagnostics) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(diag.start || 0);
          this.context.addDiagnostic({
            type: 'syntax-warning',
            file: normalized,
            line: line + 1,
            column: character + 1,
            message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
          });
        }
      }

      const entry = { sourceFile, content };
      this.cache.set(normalized, entry);
      return entry;
    } catch (err) {
      if (this.context) {
        this.context.addDiagnostic({
          type: 'parse-error',
          file: normalized,
          line: 1,
          column: 1,
          message: `Không thể đọc hoặc parse tệp tin: ${err.message}`,
        });
      }
      return null;
    }
  }

  getSourceFile(filePath) {
    const entry = this.parse(filePath);
    return entry ? entry.sourceFile : null;
  }

  getContent(filePath) {
    const entry = this.parse(filePath);
    return entry ? entry.content : null;
  }

  getNodeLocation(node, sourceFile) {
    if (!node || !sourceFile) {
      return { line: 1, column: 1 };
    }
    const start = node.getStart ? node.getStart(sourceFile) : (node.pos || 0);
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
    return { line: line + 1, column: character + 1 };
  }
}
