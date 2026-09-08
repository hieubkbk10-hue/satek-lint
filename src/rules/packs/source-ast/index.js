import path from 'path';
import ts from 'typescript';
import { PRIORITIES } from '../../../engine/findings.js';

export function runSourceAstPack(context, filePath) {
  const normPath = path.normalize(filePath).replace(/\\/g, '/');
  const sourceFile = context.parser.getSourceFile(filePath);
  const content = context.parser.getContent(filePath);
  if (!sourceFile || !content) return;

  const fileName = path.basename(filePath);
  const isRouteFile = normPath.includes('/routes/') || normPath.includes('/src/routes/');
  const isTypesFolder = normPath.includes('/src/types/');
  const isLocalesFolder = normPath.includes('/src/locales/');
  const isMockFile = normPath.includes('/mocks/') || fileName.includes('mock') || fileName.includes('Mock');
  const isBrandOrLogo = fileName.includes('Brand') || fileName.includes('Logo') || fileName.includes('VietQR');

  // Helper for adding finding
  function report(ruleCode, node, message, suggestion, evidence = '', priority = PRIORITIES.MEDIUM, subcheck = '', requirementIds = []) {
    const loc = context.parser.getNodeLocation(node, sourceFile);
    context.addFinding({
      ruleCode,
      subcheck,
      requirementIds,
      priority,
      confidence: 'proven',
      location: { path: filePath, line: loc.line, column: loc.column },
      message,
      suggestion,
      evidence: evidence || (node ? node.getText(sourceFile).slice(0, 100) : ''),
    });
  }

  // --- RULE-IMPORT-004: Cấm import relative >= 2 cấp (../../) ---
  context.recordRequirement('ARCH.IMPORT.UPWARD');
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) {
      if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const spec = stmt.moduleSpecifier.text;
        if (/^\.\.\/\.\.\//.test(spec)) {
          report(
            'RULE-IMPORT-004',
            stmt,
            `Cấm import/export relative đi lên từ 2 cấp trở lên ("${spec}").`,
            'Sử dụng alias path chuẩn (ví dụ: "@/components/...") hoặc cấu trúc lại tầng module.',
            spec,
            PRIORITIES.HIGH,
            'upward-relative-import',
            ['ARCH.IMPORT.UPWARD']
          );
        }

        // RULE-MOCK-002: Production Code Importing From Mock Modules (Tagged as RECOMMEND for WIP/waiting backend API)
        if (!isMockFile && (spec.includes('@/mocks') || spec.includes('/mocks/') || spec.startsWith('../mocks'))) {
          const isApiSlice = normPath.includes('/store/api/');
          if (isApiSlice) {
            report(
              'RULE-MOCK-002',
              stmt,
              `Endpoint API slice "${fileName}" đang tạm thời sử dụng dữ liệu mock từ "${spec}". (Nợ kỹ thuật: Chờ API backend thật).`,
              'Chuyển đổi queryFn bọc mock thành query: (params) => ({ url: "...", params }) khi backend deploy API.',
              spec,
              PRIORITIES.RECOMMEND,
              'api-slice-mock-adapter'
            );
          } else {
            report(
              'RULE-MOCK-002',
              stmt,
              `Mã nguồn UI/State "${fileName}" đang tạm thời sử dụng dữ liệu mock từ "${spec}".`,
              'Khuyến nghị: Thay thế bằng RTK Query hooks hoặc API service thực tế khi backend hoàn tất API.',
              spec,
              PRIORITIES.RECOMMEND,
              'production-mock-import'
            );
          }
        }
      }
    }
  }

  // --- RULE-TYPE-003: Invalid type file naming in src/types/ ---
  if (isTypesFolder && (fileName.endsWith('.ts') || fileName.endsWith('.tsx'))) {
    if (fileName !== 'index.ts' && fileName !== 'index.tsx' && !fileName.endsWith('.d.ts')) {
      const isValidExt = fileName.endsWith('.types.ts') || fileName.endsWith('.dto.ts');
      const isFirstLetterLower = /^[a-z]/.test(fileName);

      if (!isValidExt) {
        const baseName = fileName.replace(/\.(types|dto)?\.(ts|tsx)$/, '').replace(/\.(ts|tsx)$/, '');
        report(
          'RULE-TYPE-003',
          sourceFile,
          `Tệp định nghĩa kiểu trong src/types/ phải có đuôi ".types.ts" hoặc ".dto.ts" (tên hiện tại: "${fileName}").`,
          `Đổi tên tệp thành "${baseName}.types.ts" hoặc "${baseName}.dto.ts".`,
          fileName,
          PRIORITIES.MEDIUM,
          'type-file-naming',
          ['CODE.REPO.TS_STRICT']
        );
      } else if (!isFirstLetterLower) {
        const lowerName = fileName[0].toLowerCase() + fileName.slice(1);
        report(
          'RULE-TYPE-003',
          sourceFile,
          `Tệp định nghĩa kiểu "${fileName}" phải bắt đầu bằng chữ cái thường (camelCase).`,
          `Đổi tên tệp thành chữ thường đầu dòng: "${lowerName}".`,
          fileName,
          PRIORITIES.MEDIUM,
          'type-file-naming',
          ['CODE.REPO.TS_STRICT']
        );
      }
    }
  }

  // --- RULE-ROUTE-THIN, RULE-ROUTE-003, RULE-ROUTE-006 ---
  if (isRouteFile) {
    const isLayoutOrRoot = fileName.startsWith('__root') || fileName === 'layout.tsx' || fileName.startsWith('_');
    if (!isLayoutOrRoot) {
      // RULE-ROUTE-003: Check createFileRoute or createLazyFileRoute
      if (!content.includes('createFileRoute') && !content.includes('createLazyFileRoute')) {
        report(
          'RULE-ROUTE-003',
          sourceFile,
          `Tệp route "${fileName}" không khởi tạo bằng createFileRoute hoặc createLazyFileRoute.`,
          'Khởi tạo route thông qua createFileRoute(...) hoặc createLazyFileRoute(...).',
          fileName,
          PRIORITIES.HIGH,
          'missing-create-file-route'
        );
      }

      // RULE-ROUTE-006: Missing Route export
      if (!content.includes('export const Route')) {
        report(
          'RULE-ROUTE-006',
          sourceFile,
          `Tệp route "${fileName}" không export biến "Route". TanStack Router yêu cầu export const Route = ...`,
          'Thêm export const Route = createFileRoute(...)/createLazyFileRoute(...).',
          fileName,
          PRIORITIES.MEDIUM,
          'missing-route-export'
        );
      }

      // Check for direct hooks
      const facts = context.facts ? context.facts.getFacts(filePath) : null;
      if (facts) {
        for (const hook of facts.hookCalls) {
          if (['useState', 'useEffect', 'useQuery', 'useMutation'].includes(hook.name) || /^use[A-Z0-9].*Query$/.test(hook.name)) {
            report(
              'RULE-ROUTE-THIN',
              hook.node,
              `Route file trực tiếp gọi hook state hoặc API (${hook.name}) thay vì delegate sang Page Component.`,
              'Di chuyển logic gọi hook và quản lý state vào Page component tương ứng.',
              hook.name,
              PRIORITIES.HIGH,
              'direct-hook-in-route'
            );
          }
        }
      }
    }
  }

  // AST Traversal for node-level checks
  const visit = (node) => {
    // 1. RULE-TYPE-001: Explicit any
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      report(
        'RULE-TYPE-001',
        node,
        'Tuyệt đối không sử dụng kiểu dữ liệu "any".',
        'Thay thế bằng kiểu tường minh hoặc "unknown" có kèm type narrowing.',
        node.getText(sourceFile),
        PRIORITIES.HIGH,
        'explicit-any'
      );
    }

    // 2. RULE-REACT-001: Avoid React.FC / React.ReactNode
    if (ts.isPropertyAccessExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'React') {
        const name = node.name.text;
        if (name === 'FC' || name === 'ReactNode' || name === 'ReactElement') {
          report(
            'RULE-REACT-001',
            node,
            `Tránh sử dụng namespace "React.${name}". Hãy import trực tiếp { ${name} } từ 'react'.`,
            `Import trực tiếp { ${name} } từ 'react'.`,
            `React.${name}`,
            PRIORITIES.LOW,
            'react-namespace'
          );
        }
      }
    }

    // 3. RULE-CLEAN-EXPRESSION: Static boolean in JSX: {false && <X />}, {true || <X />}
    if (ts.isJsxExpression(node) && node.expression) {
      const expr = node.expression;
      if (ts.isBinaryExpression(expr)) {
        if (expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && expr.left.kind === ts.SyntaxKind.FalseKeyword) {
          report(
            'RULE-CLEAN-EXPRESSION',
            node,
            'Phát hiện biểu thức boolean tĩnh {false && <...>} trong JSX.',
            'Xóa khối mã hoặc thay bằng điều kiện động có ý nghĩa.',
            expr.getText(sourceFile),
            PRIORITIES.MEDIUM,
            'static-boolean-jsx'
          );
        } else if (expr.operatorToken.kind === ts.SyntaxKind.BarBarToken && expr.left.kind === ts.SyntaxKind.TrueKeyword) {
          report(
            'RULE-CLEAN-EXPRESSION',
            node,
            'Phát hiện biểu thức boolean tĩnh {true || <...>} trong JSX.',
            'Xóa khối mã hoặc kiểm tra lại logic điều kiện.',
            expr.getText(sourceFile),
            PRIORITIES.MEDIUM,
            'static-boolean-jsx'
          );
        }
      }
    }

    // 4. RULE-RADIX-001: Radix Trigger wrapping interactive element must use asChild
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tagName = opening.tagName.getText(sourceFile);
      if (/Trigger$/.test(tagName) && (tagName.startsWith('Dialog') || tagName.startsWith('Popover') || tagName.startsWith('Dropdown') || tagName.startsWith('Tooltip') || tagName.startsWith('Select'))) {
        let hasAsChild = false;
        let asChildFalse = false;
        for (const attr of opening.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.name.text === 'asChild') {
            hasAsChild = true;
            if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
              if (attr.initializer.expression.kind === ts.SyntaxKind.FalseKeyword) {
                asChildFalse = true;
              }
            }
          }
        }

        // Only report if it wraps an interactive child element (button, a, input, select, textarea, or button/link components)
        const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea']);
        const hasInteractiveChild = ts.isJsxElement(node) && node.children.some((c) => {
          let childTag = '';
          if (ts.isJsxElement(c)) {
            childTag = c.openingElement.tagName.getText(sourceFile);
          } else if (ts.isJsxSelfClosingElement(c)) {
            childTag = c.tagName.getText(sourceFile);
          }
          if (!childTag) return false;
          if (INTERACTIVE_TAGS.has(childTag.toLowerCase())) return true;
          if (/Button$|Link$|Trigger$/i.test(childTag) && !/Icon$/i.test(childTag)) return true;
          return false;
        });

        if (hasInteractiveChild && (!hasAsChild || asChildFalse)) {
          report(
            'RULE-RADIX-001',
            opening,
            `Radix Trigger ("<${tagName}>") phải khai báo thuộc tính "asChild" khi bọc phần tử tương tác.`,
            `Thêm thuộc tính asChild vào <${tagName}>.`,
            `<${tagName}>`,
            PRIORITIES.MEDIUM,
            'radix-missing-aschild'
          );
        }
      }

      // RULE-HTML-NESTING: Invalid HTML Nesting in JSX (button inside button, a inside a)
      if (ts.isJsxElement(node)) {
        const parentTag = tagName.toLowerCase();
        if (parentTag === 'button' || parentTag === 'a') {
          for (const child of node.children) {
            if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
              const childOpening = ts.isJsxElement(child) ? child.openingElement : child;
              const childTag = childOpening.tagName.getText(sourceFile).toLowerCase();
              if (childTag === 'button' || childTag === 'a') {
                report(
                  'RULE-HTML-NESTING',
                  child,
                  `Cấm lồng phần tử tương tác <${childTag}> bên trong <${parentTag}> trong JSX.`,
                  `Tách các phần tử tương tác ra riêng biệt hoặc dùng component không lồng nhau.`,
                  `<${parentTag}><${childTag}>`,
                  PRIORITIES.HIGH,
                  'nested-interactive'
                );
              }
            }
          }
        }
      }
    }

    // 5. RULE-COMPONENT-001: Nested component declaration
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const functionReturnsJsx = (fnNode) => {
        let hasJsx = false;
        const walk = (n) => {
          if (hasJsx) return;
          if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
            hasJsx = true;
            return;
          }
          if (n !== fnNode && (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n))) {
            return;
          }
          ts.forEachChild(n, walk);
        };
        walk(fnNode);
        return hasJsx;
      };

      let fnName = '';
      if (ts.isFunctionDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        fnName = node.name.text;
      } else if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
        fnName = node.parent.name.text;
      }

      if (fnName && /^[A-Z]/.test(fnName) && functionReturnsJsx(node)) {
        // Look for an enclosing component function above this declaration
        let ancestor = ts.isVariableDeclaration(node.parent) ? node.parent.parent : node.parent;
        let enclosingCompName = null;
        while (ancestor) {
          if (ts.isFunctionDeclaration(ancestor) || ts.isArrowFunction(ancestor) || ts.isFunctionExpression(ancestor)) {
            let encName = '';
            if (ts.isFunctionDeclaration(ancestor) && ancestor.name && ts.isIdentifier(ancestor.name)) {
              encName = ancestor.name.text;
            } else if ((ts.isArrowFunction(ancestor) || ts.isFunctionExpression(ancestor)) && ancestor.parent && ts.isVariableDeclaration(ancestor.parent) && ts.isIdentifier(ancestor.parent.name)) {
              encName = ancestor.parent.name.text;
            }
            if (encName && /^[A-Z]/.test(encName)) {
              enclosingCompName = encName;
              break;
            }
          }
          ancestor = ancestor.parent;
        }

        if (enclosingCompName) {
          report(
            'RULE-COMPONENT-001',
            node,
            `Khai báo component lồng nhau ("${fnName}") bên trong component cha "${enclosingCompName}". Mỗi lần cha re-render sẽ tái tạo component con.`,
            `Tách "${fnName}" ra ngoài thành component độc lập cùng file hoặc chuyển sang file riêng.`,
            fnName,
            PRIORITIES.MEDIUM,
            'nested-component'
          );
        }
      }
    }

    // 6. RULE-STATE-001: Boolean state naming (useState with boolean initial value)
    if (ts.isVariableDeclaration(node) && node.name) {
      let varName = null;
      if (ts.isIdentifier(node.name)) {
        varName = node.name.text;
      } else if (ts.isArrayBindingPattern(node.name) && node.name.elements.length > 0) {
        const firstEl = node.name.elements[0];
        if (firstEl && ts.isBindingElement(firstEl) && ts.isIdentifier(firstEl.name)) {
          varName = firstEl.name.text;
        }
      }

      if (varName && node.initializer && ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression)) {
        if (node.initializer.expression.text === 'useState' && node.initializer.arguments.length > 0) {
          const firstArg = node.initializer.arguments[0];
          if (firstArg.kind === ts.SyntaxKind.TrueKeyword || firstArg.kind === ts.SyntaxKind.FalseKeyword) {
            if (/^(?:show|open|visible|loading|expanded)[A-Z]/.test(varName) || varName === 'show' || varName === 'open' || varName === 'loading' || varName === 'visible') {
              report(
                'RULE-STATE-001',
                node,
                `State boolean "${varName}" nên đặt theo chuẩn "is[Feature][State]" (ví dụ: isModalOpen, isFilterVisible).`,
                `Đổi tên state thành is... hoặc has...`,
                varName,
                PRIORITIES.LOW,
                'boolean-state-naming'
              );
            }
          }
        }
      }
    }

    // 7. RULE-STORAGE-001: Raw String Keys in Auth Storage
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const caller = node.expression.expression.getText(sourceFile);
      const method = node.expression.name.text;
      if ((caller === 'localStorage' || caller === 'sessionStorage') && (method === 'getItem' || method === 'setItem' || method === 'removeItem')) {
        if (node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
          const key = node.arguments[0].text;
          if (['access_token', 'refresh_token', 'token', 'user', 'auth'].includes(key.toLowerCase())) {
            report(
              'RULE-STORAGE-001',
              node,
              `Cấm truyền chuỗi thô "${key}" vào ${caller}. Bắt buộc phải sử dụng hằng số AUTH_STORAGE_KEYS.`,
              `Dùng AUTH_STORAGE_KEYS.${key.toUpperCase()}`,
              `${caller}.${method}("${key}")`,
              PRIORITIES.HIGH,
              'raw-storage-key'
            );
          }
        }
      }
    }

    // 8. RULE-CONSOLE-001: console.log
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression)) {
        if (ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'console') {
          if (node.expression.name.text === 'log') {
            report(
              'RULE-CONSOLE-001',
              node,
              'Không để sót lệnh console.log trong mã nguồn production.',
              'Xóa bỏ console.log hoặc chuyển sang logger chuyên dụng nếu thực sự cần thiết.',
              'console.log(...)',
              PRIORITIES.LOW,
              'production-console'
            );
          }
        }
      }

      // 9. RULE-EFFECT-GUARD: Missing state guard in useEffect
      if (ts.isIdentifier(node.expression) && node.expression.text === 'useEffect') {
        if (node.arguments.length > 0) {
          // 1. Skip if dependency array is empty [] (mount-only effect cannot loop)
          let isEmptyDeps = false;
          if (node.arguments.length > 1) {
            const deps = node.arguments[1];
            if (ts.isArrayLiteralExpression(deps) && deps.elements.length === 0) {
              isEmptyDeps = true;
            }
          }

          const effectFn = node.arguments[0];
          if (!isEmptyDeps && (ts.isArrowFunction(effectFn) || ts.isFunctionExpression(effectFn)) && ts.isBlock(effectFn.body)) {
            // 2. Check if effect contains early-return guard (e.g. if (!isOpen || !account) return;)
            const hasEarlyReturn = effectFn.body.statements.some((st) => {
              if (ts.isIfStatement(st)) {
                if (ts.isReturnStatement(st.thenStatement)) return true;
                if (ts.isBlock(st.thenStatement) && st.thenStatement.statements.some((bts) => ts.isReturnStatement(bts))) return true;
              }
              return false;
            });

            if (!hasEarlyReturn) {
              for (const s of effectFn.body.statements) {
                if (ts.isExpressionStatement(s) && ts.isCallExpression(s.expression)) {
                  const callName = s.expression.expression.getText(sourceFile);
                  if (/^set[A-Z]/.test(callName)) {
                    // Check if setter uses functional update with comparison bailout (prev === next ? prev : next)
                    let isGuardedUpdate = false;
                    if (s.expression.arguments.length > 0) {
                      const arg0 = s.expression.arguments[0];
                      if (ts.isArrowFunction(arg0) || ts.isFunctionExpression(arg0)) {
                        const updaterText = arg0.getText(sourceFile);
                        if (updaterText.includes('===') && updaterText.includes('?')) {
                          isGuardedUpdate = true;
                        }
                      }
                    }

                    if (!isGuardedUpdate) {
                      report(
                        'RULE-EFFECT-GUARD',
                        s.expression,
                        `Lệnh "${callName}" gọi trực tiếp trong useEffect mà không có guard điều kiện (if) hoặc early return. Có nguy cơ kích hoạt lượt render thừa.`,
                        'Bọc lệnh setState trong khối điều kiện kiểm tra (if (data && data !== localState)) hoặc sử dụng early return.',
                        s.expression.getText(sourceFile),
                        PRIORITIES.MEDIUM,
                        'missing-effect-guard'
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // 10. RULE-ROUTE-005: Prefer <Link> for Static Navigation
    if (ts.isJsxAttribute(node) && node.name.text === 'onClick' && node.initializer) {
      const attrText = node.initializer.getText(sourceFile);
      if (/\b(?:navigate|router\.navigate)\s*\(\s*['"{]/.test(attrText)) {
        report(
          'RULE-ROUTE-005',
          node,
          'Khuyến nghị sử dụng component <Link to="..."> thay vì gọi router.navigate() trong onClick tĩnh.',
          'Thay thế button onClick={navigate} bằng <Link to="...">...</Link>.',
          attrText.slice(0, 50),
          PRIORITIES.INFO,
          'prefer-link-navigation'
        );
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  // --- String & Token Regex-based Checks ---

  // RULE-THEME-001: Legacy UI design token constant object
  const themeObjRegex = /\b(?:export\s+)?const\s+(?:ADMIN_UI_TOKENS|UI_TOKENS|DESIGN_TOKENS|THEME_TOKENS|APP_COLORS)\b/g;
  let themeMatch;
  while ((themeMatch = themeObjRegex.exec(content)) !== null) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(themeMatch.index);
    context.addFinding({
      ruleCode: 'RULE-THEME-001',
      subcheck: 'legacy-token-object',
      requirementIds: [],
      priority: PRIORITIES.MEDIUM,
      confidence: 'proven',
      location: { path: filePath, line: line + 1, column: character + 1 },
      message: `Cấm tạo hằng số object lưu design tokens (${themeMatch[0]}). Phải sử dụng CSS @theme và Tailwind semantic tokens.`,
      suggestion: 'Chuyển toàn bộ design tokens vào src/index.css (@theme).',
      evidence: themeMatch[0],
    });
  }

  // RULE-UI-001: Forbidden display: contents on Table elements
  if (/<(?:table|thead|tbody|tr|th|td)\b[^>]*className=["'"][^"']*\bcontents\b[^"']*["']/i.test(content)) {
    report(
      'RULE-UI-001',
      sourceFile,
      'Cấm sử dụng display: contents (hoặc class contents) trực tiếp trên các thẻ Bảng HTML do phá vỡ cấu trúc accessibility.',
      'Sử dụng React Fragment (<>...</>) hoặc các thẻ bảng chuẩn (tr, td, th).',
      'class contents on table element',
      PRIORITIES.MEDIUM,
      'table-display-contents'
    );
  }

  // RULE-COLOR-001: Arbitrary color in className: text-[#...], bg-[#...]
  const arbitraryColorRegex = /\b(text|bg|border|ring|fill|stroke|from|to|via|outline|shadow|decoration|accent|divide|placeholder)-\[(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\)|var\(--[^)]+\))\]/g;
  let colorMatch;
  while ((colorMatch = arbitraryColorRegex.exec(content)) !== null) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(colorMatch.index);
    context.addFinding({
      ruleCode: 'RULE-COLOR-001',
      subcheck: 'arbitrary-color-classname',
      requirementIds: [],
      priority: PRIORITIES.HIGH,
      confidence: 'proven',
      location: { path: filePath, line: line + 1, column: character + 1 },
      message: `Tuyệt đối không dùng arbitrary color "${colorMatch[0]}" trong className.`,
      suggestion: 'Thay thế bằng Tailwind semantic token từ @theme: text-primary, bg-bg-card, border-border-1...',
      evidence: colorMatch[0],
    });
  }

  // RULE-COLOR-002: Raw hex in inline style / SVG
  if (!isBrandOrLogo && (filePath.endsWith('.tsx') || filePath.endsWith('.jsx'))) {
    const hexStyleRegex = /(?:style=\{\{[^}]*|fill=["']|stroke=["'])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
    let hexMatch;
    while ((hexMatch = hexStyleRegex.exec(content)) !== null) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(hexMatch.index);
      context.addFinding({
        ruleCode: 'RULE-COLOR-002',
        subcheck: 'raw-hex-style',
        requirementIds: [],
        priority: PRIORITIES.MEDIUM,
        confidence: 'proven',
        location: { path: filePath, line: line + 1, column: character + 1 },
        message: `Không viết cứng mã màu hex "${hexMatch[0]}" trong inline style hoặc SVG.`,
        suggestion: 'Dùng CSS variables hoặc Tailwind theme tokens: currentColor, var(--color-primary)...',
        evidence: hexMatch[0],
      });
    }
  }

  // RULE-RADIUS-001: Arbitrary radius (Only active when --all is specified)
  if (context.includeAll && !normPath.includes('index.css') && (filePath.endsWith('.tsx') || filePath.endsWith('.jsx'))) {
    const radiusRegex = /\b(?:[a-zA-Z0-9_-]+:)*rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|ee|es))?-(?:2xl|3xl|xl|lg|md|sm|xs|\[(?!(?:inherit)\])[^\]]+\])/g;
    let radiusMatch;
    while ((radiusMatch = radiusRegex.exec(content)) !== null) {
      if (content.includes('-- CUSTOM_RADIUS')) continue;
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(radiusMatch.index);
      const dirMatch = radiusMatch[0].match(/\b(?:[a-zA-Z0-9_-]+:)*(rounded-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|ee|es))/);
      let suggestion = 'Thay bằng 4 semantic tokens: rounded-card, rounded-field, rounded-tile, rounded-pill (hoặc rounded-full/rounded-none).';
      if (dirMatch) {
        const dir = dirMatch[1];
        suggestion = `Nếu là bo góc 1 chiều (${dir}-*), hãy dùng biến thể 1 chiều tương ứng (${dir}-card, ${dir}-tile...) hoặc ${dir}-[inherit] để tránh làm méo cạnh tiếp giáp.`;
      }
      context.addFinding({
        ruleCode: 'RULE-RADIUS-001',
        subcheck: 'hardcoded-arbitrary-radius',
        requirementIds: [],
        priority: PRIORITIES.LOW,
        confidence: 'proven',
        location: { path: filePath, line: line + 1, column: character + 1 },
        message: `Không dùng class bo góc arbitrary "${radiusMatch[0]}".`,
        suggestion,
        evidence: radiusMatch[0],
      });
    }
  }

  // RULE-ZINDEX-001: Non-standard arbitrary z-index token
  const zindexRegex = /\bz-\[(?!(?:1000|1050|1060|10000|10050)\])[^\]]+\]/g;
  let zindexMatch;
  while ((zindexMatch = zindexRegex.exec(content)) !== null) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(zindexMatch.index);
    context.addFinding({
      ruleCode: 'RULE-ZINDEX-001',
      subcheck: 'non-standard-zindex',
      requirementIds: [],
      priority: PRIORITIES.MEDIUM,
      confidence: 'proven',
      location: { path: filePath, line: line + 1, column: character + 1 },
      message: `Không dùng arbitrary z-index "${zindexMatch[0]}". Cần tuân thủ thang chuẩn: z-[1000] (dropdown/popover), z-[1050] (header/viewer backdrop), z-[1060] (viewer content), z-[10000] (modal/dialog).`,
      suggestion: 'Thay bằng z-[1000], z-[1050], z-[1060], hoặc z-[10000].',
      evidence: zindexMatch[0],
    });
  }

  // RULE-CUSTOM-001: Excessive arbitrary classes on a single line
  const classMatches = content.match(/className=["'`]([^"'`]+)["'`]/g);
  if (classMatches) {
    for (const cStr of classMatches) {
      const utilityTokens = cStr.match(/(?:^|\s)(?:[a-zA-Z0-9_-]+:)*(?:w|h|min-w|max-w|min-h|max-h|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|top|bottom|left|right|inset|gap|grid-cols|grid-rows|col-span|row-span|tracking|leading|text|bg|border|rounded|shadow)-\[[^\]]+\]/g) || [];
      if (utilityTokens.length >= 4) {
        report(
          'RULE-CUSTOM-001',
          sourceFile,
          `Phần tử có quá nhiều arbitrary utilities dạng [...] (${utilityTokens.length} classes).`,
          'Trích xuất thành class utility hoặc component chuẩn.',
          utilityTokens.slice(0, 4).join(' '),
          PRIORITIES.INFO,
          'excessive-arbitrary-classes'
        );
        break;
      }
    }
  }

  // RULE-SUPPRESS-001: Suppression comment check
  const suppressRegex = /(?:@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable)(?!.*-- LOGIC:)/g;
  let supMatch;
  while ((supMatch = suppressRegex.exec(content)) !== null) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(supMatch.index);
    context.addFinding({
      ruleCode: 'RULE-SUPPRESS-001',
      subcheck: 'suppression-without-logic',
      requirementIds: [],
      priority: PRIORITIES.LOW,
      confidence: 'proven',
      location: { path: filePath, line: line + 1, column: character + 1 },
      message: 'Comment vô hiệu hóa linter (@ts-ignore, eslint-disable) bắt buộc phải có giải thích lý do sau "-- LOGIC:".',
      suggestion: 'Thêm "-- LOGIC: <lý do>" sau comment bỏ qua.',
      evidence: supMatch[0],
    });
  }

  // RULE-I18N-001: Hardcoded Vietnamese text in JSX and trans('Tiếng Việt') (Only active when --all is specified)
  // Scope: Components using i18n (import useTranslation, call trans) or within routes/auth/cart
  const hasI18nUsage = content.includes('useTranslation') || content.includes('trans(') || normPath.includes('/auth') || normPath.includes('/cart');
  if (context.includeAll && !isLocalesFolder && !isMockFile && (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) && hasI18nUsage) {
    const vnCharClass = '[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]';
    const vnRegex = new RegExp(`>([^<>{}]*${vnCharClass}[^<>{}]*)<`, 'g');
    let vnMatch;
    while ((vnMatch = vnRegex.exec(content)) !== null) {
      const text = vnMatch[1].trim();
      if (text.length > 2 && !text.startsWith('//') && !text.startsWith('/*')) {
        context.recordRequirement('I18N.KEYS.USAGE');
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(vnMatch.index);
        context.addFinding({
          ruleCode: 'RULE-I18N-001',
          subcheck: 'hardcoded-vietnamese-jsx',
          requirementIds: ['I18N.KEYS.USAGE'],
          priority: PRIORITIES.LOW,
          confidence: 'proven',
          location: { path: filePath, line: line + 1, column: character + 1 },
          message: `Không viết cứng chuỗi tiếng Việt "${text.slice(0, 30)}..." trong JSX.`,
          suggestion: "Dùng English-as-Identifier với hàm trans: trans('English text').",
          evidence: text.slice(0, 50),
        });
      }
    }

    // Subcheck 2: Vietnamese string used as key in trans('Tiếng Việt') or t('Tiếng Việt') per i18n.md §1.1
    const transVnRegex = new RegExp(`\\b(?:trans|t)\\(\\s*['"\`]([^'"\`]*${vnCharClass}[^'"\`]*)['"\`]`, 'g');
    let transMatch;
    while ((transMatch = transVnRegex.exec(content)) !== null) {
      const transKey = transMatch[1].trim();
      context.recordRequirement('I18N.KEYS.USAGE');
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(transMatch.index);
      context.addFinding({
        ruleCode: 'RULE-I18N-001',
        subcheck: 'vietnamese-as-translation-key',
        requirementIds: ['I18N.KEYS.USAGE'],
        priority: PRIORITIES.MEDIUM,
        confidence: 'proven',
        location: { path: filePath, line: line + 1, column: character + 1 },
        message: `Tuyệt đối cấm dùng chuỗi tiếng Việt "${transKey.slice(0, 30)}" làm key trong trans(). Bắt buộc dùng English-as-Identifier.`,
        suggestion: `Đổi key sang tiếng Anh (ví dụ: trans('English text')). Bản dịch tiếng Việt đặt trong src/locales/vi/.`,
        evidence: transMatch[0],
      });
    }
  }

  // RULE-LOADING-001: isFetching vs isLoading for Table
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    // Only flag if the component directly calls a query hook or has isFetching in scope.
    // Pure presentation tables (receiving isLoading as prop) should not be flagged.
    const hasQueryHook = /use[A-Z0-9].*Query\(/.test(content);
    const hasFetchingInScope = /\bisFetching\b/.test(content);
    if (hasQueryHook || hasFetchingInScope) {
      const tableLoadingRegex = /<(?:Table|DataTable)\b[^>]*\bloading\s*=\s*\{\s*isLoading\s*\}/g;
      let tlMatch;
      while ((tlMatch = tableLoadingRegex.exec(content)) !== null) {
        context.recordRequirement('API.LOADING.FETCHING');
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(tlMatch.index);
        context.addFinding({
          ruleCode: 'RULE-LOADING-001',
          subcheck: 'loading-prop-is-loading-only',
          requirementIds: ['API.LOADING.FETCHING'],
          priority: PRIORITIES.MEDIUM,
          confidence: 'proven',
          location: { path: filePath, line: line + 1, column: character + 1 },
          message: 'Table truyền prop loading={isLoading}. Nên dùng loading={isFetching || isLoading} để hiển thị trạng thái khi chuyển trang/lọc.',
          suggestion: 'Khai báo thêm isFetching từ hook (const { isLoading, isFetching } = use...Query(...)) và truyền loading={isFetching || isLoading} vào Table.',
          evidence: tlMatch[0],
        });
      }
    }
  }

  // RULE-NULL-001: Null / Undefined Guards on deep payload access
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    const unsafeDataPayloadRegex = /\b(?:data|response)\.data\.(?:map|filter|forEach|find|length|reduce)\b/g;
    let unsafeMatch;
    while ((unsafeMatch = unsafeDataPayloadRegex.exec(content)) !== null) {
      context.recordRequirement('API.NULL.GUARD');
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(unsafeMatch.index);
      context.addFinding({
        ruleCode: 'RULE-NULL-001',
        subcheck: 'missing-optional-chaining',
        requirementIds: ['API.NULL.GUARD'],
        priority: PRIORITIES.LOW,
        confidence: 'proven',
        location: { path: filePath, line: line + 1, column: character + 1 },
        message: `Truy xuất mảng API "${unsafeMatch[0]}" thiếu optional chaining (?.). Khi backend trả về null/undefined có thể gây sập giao diện.`,
        suggestion: `Sử dụng optional chaining và fallback: data?.data?.${unsafeMatch[0].split('.').pop()} hoặc (data?.data ?? []).`,
        evidence: unsafeMatch[0],
      });
    }
  }

  // RULE-COMMENT-001: Comment referencing rule numbers or section numbers
  context.recordRequirement('CODE.STANDARDS.DRIFT');
  const commentRegex = /\/\/\s*(?:mục|quy tắc|rule|quy định|điều)\s*[\d.]+/gi;
  let commentMatch;
  while ((commentMatch = commentRegex.exec(content)) !== null) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(commentMatch.index);
    context.addFinding({
      ruleCode: 'RULE-COMMENT-001',
      subcheck: 'comment-rule-number',
      requirementIds: [],
      priority: PRIORITIES.INFO,
      confidence: 'proven',
      location: { path: filePath, line: line + 1, column: character + 1 },
      message: `Tránh viết comment dẫn số quy tắc hoặc số mục ("${commentMatch[0]}"). Hãy giải thích lý do nghiệp vụ trực tiếp.`,
      suggestion: 'Giải thích lý do hoặc dùng prefix quy ước như // QUYỀN:, // LOGIC:, // UI:.',
      evidence: commentMatch[0],
    });
  }

  // ==========================================================================
  // FORM & VALIDATION RULES (form_and_validation_rules.md & form_and_validation_guide.md)
  // ==========================================================================

  // RULE-FORM-001: Anti-Form State Fragmentation / Formik + Yup Mandate
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    const isFormModal = /(?:Modal|Form|Create|Edit|Adjust)[A-Za-z0-9]*\.(?:tsx|jsx)$/.test(fileName);
    const isExcluded = fileName.includes('Table') || fileName.includes('Detail') || fileName.includes('List');
    if (isFormModal && !isExcluded && !content.includes('useFormik')) {
      const stateMatches = [...content.matchAll(/\bconst\s+\[\s*([a-zA-Z0-9_-]+)\s*,\s*set[a-zA-Z0-9_-]+\s*\]\s*=\s*useState/g)];
      const fieldStates = stateMatches
        .map((m) => m[1])
        .filter((s) => !/^(?:isOpen|isLoading|isSubmitting|isPending|isSuccess|show|open|visible|activeTab|step|error)$/i.test(s));

      if (fieldStates.length >= 3) {
        context.recordRequirement('FORM.FORMIK.YUP');
        context.addFinding({
          ruleCode: 'RULE-FORM-001',
          subcheck: 'fragmented-form-state',
          requirementIds: ['FORM.FORMIK.YUP'],
          priority: PRIORITIES.RECOMMEND,
          confidence: 'heuristic',
          location: { path: filePath, line: 1, column: 1 },
          message: `Biểu mẫu "${fileName}" có ${fieldStates.length} state trường nhập liệu rời rạc (${fieldStates.slice(0, 4).join(', ')}...). Theo form_and_validation_rules.md §1.1, form nghiệp vụ bắt buộc sử dụng Formik (useFormik) kết hợp Yup Validation Schema.`,
          suggestion: 'Chuyển đổi sang useFormik({ initialValues, validationSchema, enableReinitialize: true, onSubmit }). Xem mẫu chuẩn tại form_and_validation_guide.md §1.',
          evidence: fieldStates.slice(0, 4).join(', '),
        });
      }
    }
  }

  // RULE-FORM-002: Pure Yup Schema Mandate (No trans in Schema Factory or Chains)
  if (content.includes('Yup') || content.includes('yup')) {
    // Check trans(...) inside Yup validator methods
    const yupTransRegex = /(?:\bYup\.[a-zA-Z]+\(|\.(?:required|matches|min|max|email|test)\()\s*(?:trans|t)\(/g;
    let ytMatch;
    while ((ytMatch = yupTransRegex.exec(content)) !== null) {
      context.recordRequirement('FORM.PURE.SCHEMA');
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(ytMatch.index);
      context.addFinding({
        ruleCode: 'RULE-FORM-002',
        subcheck: 'trans-in-yup-schema',
        requirementIds: ['FORM.PURE.SCHEMA'],
        priority: PRIORITIES.RECOMMEND,
        confidence: 'proven',
        location: { path: filePath, line: line + 1, column: character + 1 },
        message: 'Yup Validation Schema vi phạm Pure Schema Mandate (chứa lời gọi hàm dịch trans() trong schema chain). Schema ở Module Scope bắt buộc phải độc lập và chỉ chứa Raw English Keys.',
        suggestion: "Bỏ trans() trong schema: dùng Yup.string().required('Name is required') và bọc {trans(formik.errors.name)} tại JSX để hỗ trợ chuyển ngữ Real-time (form_and_validation_rules.md §2.1).",
        evidence: ytMatch[0],
      });
    }

    // Check schema factory accepting trans parameter: createXSchema = (trans) =>
    const schemaFactoryTransRegex = /(?:const|function)\s+(?:create[A-Za-z0-9]*Schema)\s*=\s*\([^)]*\btrans\b/g;
    let sfMatch;
    while ((sfMatch = schemaFactoryTransRegex.exec(content)) !== null) {
      context.recordRequirement('FORM.PURE.SCHEMA');
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(sfMatch.index);
      context.addFinding({
        ruleCode: 'RULE-FORM-002',
        subcheck: 'trans-arg-in-schema-factory',
        requirementIds: ['FORM.PURE.SCHEMA'],
        priority: PRIORITIES.RECOMMEND,
        confidence: 'proven',
        location: { path: filePath, line: line + 1, column: character + 1 },
        message: 'Schema Factory nhận tham số hàm dịch trans. Tuyệt đối cấm truyền trans vào schema factory (form_and_validation_rules.md §2.1).',
        suggestion: 'Xóa tham số trans khỏi schema factory và chỉ định nghĩa raw English translation keys.',
        evidence: sfMatch[0],
      });
    }
  }

  // RULE-FORM-003: Anti-Race Condition on Custom Inputs (setFieldTouched with shouldValidate = false)
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    const setFieldTouchedRegex = /\.setFieldTouched\(\s*(['"][^'"]+['"])\s*,\s*true\s*(?:,\s*true\s*)?\)/g;
    let sftMatch;
    while ((sftMatch = setFieldTouchedRegex.exec(content)) !== null) {
      context.recordRequirement('FORM.RACE.CONDITION');
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(sftMatch.index);
      const fieldName = sftMatch[1];
      context.addFinding({
        ruleCode: 'RULE-FORM-003',
        subcheck: 'setFieldTouched-race-condition',
        requirementIds: ['FORM.RACE.CONDITION'],
        priority: PRIORITIES.RECOMMEND,
        confidence: 'proven',
        location: { path: filePath, line: line + 1, column: character + 1 },
        message: `Gọi setFieldTouched(${fieldName}, true) với shouldValidate = true trên Custom Input. Nguy cơ Race Condition khiến Formik validate trên state cũ rỗng (form_and_validation_rules.md §3.1).`,
        suggestion: `Truyền đối số thứ ba là false: formik.setFieldTouched(${fieldName}, true, false) và để setFieldValue chịu trách nhiệm validate giá trị mới.`,
        evidence: sftMatch[0],
      });
    }
  }
}
