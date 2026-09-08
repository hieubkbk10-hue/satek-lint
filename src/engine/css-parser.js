import fs from 'fs';
import path from 'path';
import postcss from 'postcss';

export class CssParser {
  constructor(context = null) {
    this.context = context;
    this.cache = new Map(); // normalizedPath -> { root, content, variables, zIndexRules }
  }

  parse(filePath) {
    const normalized = path.normalize(filePath);
    if (this.cache.has(normalized)) {
      return this.cache.get(normalized);
    }

    if (!fs.existsSync(normalized)) {
      return null;
    }

    try {
      const content = fs.readFileSync(normalized, 'utf8');
      const root = postcss.parse(content, { from: normalized });
      const variables = new Map();
      const zIndexRules = [];

      root.walkDecls((decl) => {
        if (decl.prop.startsWith('--')) {
          variables.set(decl.prop, decl.value.trim());
        }
        if (decl.prop === 'z-index') {
          zIndexRules.push({
            selector: decl.parent ? decl.parent.selector : '',
            value: decl.value.trim(),
            line: decl.source && decl.source.start ? decl.source.start.line : 1,
          });
        }
      });

      const entry = { root, content, variables, zIndexRules };
      this.cache.set(normalized, entry);
      return entry;
    } catch (err) {
      if (this.context) {
        this.context.addDiagnostic({
          type: 'css-parse-warning',
          file: normalized,
          line: 1,
          column: 1,
          message: `Không thể phân tích tệp CSS: ${err.message}`,
        });
      }
      return null;
    }
  }
}
