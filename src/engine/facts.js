import ts from 'typescript';

export class FactExtractor {
  constructor(parser) {
    this.parser = parser;
    this.factsCache = new Map();
  }

  getFacts(filePath) {
    if (this.factsCache.has(filePath)) {
      return this.factsCache.get(filePath);
    }

    const sourceFile = this.parser.getSourceFile(filePath);
    if (!sourceFile) return null;

    const facts = {
      filePath,
      hasInjectEndpoints: false,
      endpoints: [], // { name, type: 'query'|'mutation', providesTags, invalidatesTags, node }
      hookCalls: [], // { name, argsCount, node }
      radixTriggers: [], // { tag, hasAsChild, asChildValue, childrenCount, node }
      directJsxElements: [], // { tag, node }
      isRouteFile: filePath.includes('/routes/') || filePath.includes('\\routes\\'),
    };

    const visit = (node) => {
      // 1. Check hook calls: useX(...)
      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression)) {
          const name = node.expression.text;
          if (/^use[A-Z0-9]/.test(name)) {
            facts.hookCalls.push({
              name,
              argsCount: node.arguments.length,
              node,
            });
          }
        } else if (ts.isPropertyAccessExpression(node.expression)) {
          const propName = node.expression.name.text;
          if (propName === 'injectEndpoints') {
            facts.hasInjectEndpoints = true;
          }
        }
      }

      // 2. Check JSX Elements and Radix Triggers
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const tagName = opening.tagName.getText(sourceFile);
        facts.directJsxElements.push({ tag: tagName, node });

        if (/Trigger$/.test(tagName)) {
          let hasAsChild = false;
          let asChildValue = true;

          for (const attr of opening.attributes.properties) {
            if (ts.isJsxAttribute(attr) && attr.name.text === 'asChild') {
              hasAsChild = true;
              if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
                if (attr.initializer.expression.kind === ts.SyntaxKind.FalseKeyword) {
                  asChildValue = false;
                }
              }
            }
          }

          const childrenCount = ts.isJsxElement(node)
            ? node.children.filter((c) => !ts.isJsxText(c) || c.text.trim().length > 0).length
            : 0;

          facts.radixTriggers.push({
            tag: tagName,
            hasAsChild,
            asChildValue,
            childrenCount,
            node,
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    this.factsCache.set(filePath, facts);
    return facts;
  }
}
