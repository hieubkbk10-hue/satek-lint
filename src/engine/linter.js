/**
 * ============================================================================
 * UNIVERSAL LINTER CORE ENGINE (34 RULES)
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { RULES, RULE_SEVERITY, RULE_CATEGORY } from '../rules/catalog.js';
import { detectProject } from './detector.js';

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'routeTree.gen.ts',
  'calendar.css',
  'index.css',
];

const SEMANTIC_TOKENS = [
  'rounded-card',
  'rounded-tile',
  'rounded-field',
  'rounded-pill',
  'text-primary',
  'bg-primary',
  'bg-bg-card',
  'bg-bg-app',
  'bg-bg-main',
  'border-border-1',
  'border-border-input',
  'text-primary-navy',
  'text-text-secondary',
  'text-text-muted',
  'page-title',
  'page-subtitle',
  'page-eyebrow',
  'section-title',
  'section-subtitle',
  'table-header-cell',
  'stat-number',
  'stat-label',
  'stat-subtext',
];

export function collectFiles(customPath = null, targetDir = process.cwd()) {
  const files = [];

  function scan(currentPath) {
    if (!fs.existsSync(currentPath)) return;
    const stat = fs.statSync(currentPath);

    if (stat.isDirectory()) {
      const baseName = path.basename(currentPath);
      if (DEFAULT_IGNORE_PATTERNS.includes(baseName)) return;

      const items = fs.readdirSync(currentPath);
      for (const item of items) {
        scan(path.join(currentPath, item));
      }
    } else if (
      (currentPath.endsWith('.tsx') ||
        currentPath.endsWith('.ts') ||
        currentPath.endsWith('.jsx') ||
        currentPath.endsWith('.js')) &&
      !DEFAULT_IGNORE_PATTERNS.some((ign) => currentPath.includes(ign))
    ) {
      files.push(currentPath);
    }
  }

  if (customPath) {
    let resolved = null;
    if (fs.existsSync(customPath)) {
      resolved = path.resolve(customPath);
    } else {
      const candidateInTarget = path.resolve(targetDir, customPath);
      if (fs.existsSync(candidateInTarget)) {
        resolved = candidateInTarget;
      }
    }

    if (resolved) {
      scan(resolved);
      return files;
    }

    // Fuzzy search: tìm file có tên hoặc đuôi đường dẫn khớp với customPath trong targetDir
    const normalizedCustom = customPath.replace(/\\/g, '/');
    function fuzzySearch(currentPath) {
      if (!fs.existsSync(currentPath)) return;
      const stat = fs.statSync(currentPath);

      if (stat.isDirectory()) {
        const baseName = path.basename(currentPath);
        if (DEFAULT_IGNORE_PATTERNS.includes(baseName)) return;

        const items = fs.readdirSync(currentPath);
        for (const item of items) {
          fuzzySearch(path.join(currentPath, item));
        }
      } else if (
        (currentPath.endsWith('.tsx') ||
          currentPath.endsWith('.ts') ||
          currentPath.endsWith('.jsx') ||
          currentPath.endsWith('.js')) &&
        !DEFAULT_IGNORE_PATTERNS.some((ign) => currentPath.includes(ign))
      ) {
        const rel = path.relative(targetDir, currentPath).replace(/\\/g, '/');
        if (
          rel === normalizedCustom ||
          rel.endsWith(`/${normalizedCustom}`) ||
          path.basename(currentPath) === normalizedCustom ||
          path.basename(currentPath, path.extname(currentPath)) === normalizedCustom
        ) {
          files.push(currentPath);
        }
      }
    }
    fuzzySearch(targetDir);
    return files;
  }

  scan(targetDir);
  return files;
}

export function lintFile(filePath, targetDir, activeRules = RULES) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = path.relative(targetDir, filePath).replace(/\\/g, '/');

  const violations = [];
  let compliantCount = 0;

  const isBaseApiFile =
    relativePath.endsWith('baseApi.ts') ||
    relativePath.endsWith('baseApi.js') ||
    relativePath.endsWith('baseApi.tsx') ||
    relativePath.includes('api/baseApi');

  const isThemeOrConfigFile =
    relativePath.includes('tailwind.config') ||
    relativePath.includes('/theme/') ||
    relativePath.includes('/tokens/') ||
    relativePath.endsWith('theme.ts') ||
    relativePath.endsWith('tokens.ts') ||
    relativePath.endsWith('constants/colors.ts');

  const isMockFile =
    relativePath.startsWith('mocks/') ||
    relativePath.startsWith('src/mocks/') ||
    relativePath.includes('/mocks/') ||
    relativePath.endsWith('.mock.ts') ||
    relativePath.endsWith('.mock.tsx');

  const isBrandOrLogoOrMockFile =
    isMockFile ||
    isThemeOrConfigFile ||
    relativePath.toLowerCase().includes('brand') ||
    relativePath.toLowerCase().includes('payment') ||
    relativePath.toLowerCase().includes('logo') ||
    relativePath.toLowerCase().includes('vietqr') ||
    relativePath.toLowerCase().includes('qr');

  // ==========================================================================
  // 1. ROUTER ARCHITECTURE (src/routes/**)
  // ==========================================================================
  const isRouteFile =
    (relativePath.startsWith('routes/') || relativePath.startsWith('src/routes/')) &&
    (relativePath.endsWith('.lazy.tsx') || relativePath.endsWith('.tsx') || relativePath.endsWith('.jsx'));

  if (isRouteFile) {
    const fileName = path.basename(relativePath);
    const isLayoutOrRoot =
      fileName.startsWith('__root') ||
      fileName.startsWith('_') ||
      fileName === 'route.tsx' ||
      fileName === 'layout.tsx';

    // RULE-ROUTE-001: Thick Route
    if (activeRules.some((r) => r.code === 'RULE-ROUTE-001')) {
      const hasDirectLayoutJsx =
        /<(div|section|form|table|main|article|aside|header|footer|ul|ol|button|input|svg)\b[^>]*>/i.test(content) ||
        (content.includes('return (') && lines.length > 25);

      if (!isLayoutOrRoot && hasDirectLayoutJsx) {
        violations.push({
          line: 1,
          ruleCode: 'RULE-ROUTE-001',
          ruleName: 'Thick Route Component Detected',
          category: RULE_CATEGORY.ROUTER_ARCHITECTURE,
          severity: RULE_SEVERITY.CRITICAL,
          matchedText: `${lines.length} lines with inline JSX layout`,
          codeSnippet: `Route file chứa JSX giao diện trực tiếp (${lines.length} dòng) thay vì delegate sang Page component.`,
          fix: 'Chuyển toàn bộ JSX sang src/components/{module}/pages/{Module}Page.tsx và render 1 dòng tại route file.',
        });
      }
    }

    // RULE-ROUTE-002: Direct state/hooks in routes (strip comments first)
    if (activeRules.some((r) => r.code === 'RULE-ROUTE-002')) {
      const codeWithoutComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      if (
        !isLayoutOrRoot &&
        (codeWithoutComments.includes('useState(') ||
          codeWithoutComments.includes('useEffect(') ||
          codeWithoutComments.includes('useQuery(') ||
          codeWithoutComments.includes('useMutation('))
      ) {
        violations.push({
          line: 1,
          ruleCode: 'RULE-ROUTE-002',
          ruleName: 'Route File Direct Hooks / State / Mutation Call',
          category: RULE_CATEGORY.ROUTER_ARCHITECTURE,
          severity: RULE_SEVERITY.CRITICAL,
          matchedText: 'useState/useEffect/useQuery/useMutation inside route',
          codeSnippet: 'Route file trực tiếp quản lý state hoặc gọi API/query/mutation hook.',
          fix: 'Chuyển logic state và API call vào Page Orchestrator Component.',
        });
      }
    }

    // RULE-ROUTE-003: Missing createFileRoute / createLazyFileRoute
    if (activeRules.some((r) => r.code === 'RULE-ROUTE-003')) {
      if (!isLayoutOrRoot && !content.includes('createFileRoute') && !content.includes('createLazyFileRoute')) {
        violations.push({
          line: 1,
          ruleCode: 'RULE-ROUTE-003',
          ruleName: 'Missing createFileRoute / createLazyFileRoute',
          category: RULE_CATEGORY.ROUTER_ARCHITECTURE,
          severity: RULE_SEVERITY.CRITICAL,
          matchedText: fileName,
          codeSnippet: `Route file không khai báo bằng createFileRoute hoặc createLazyFileRoute.`,
          fix: 'Khởi tạo route bằng createFileRoute(\'...\') hoặc createLazyFileRoute(\'...\').',
        });
      }
    }

    // RULE-ROUTE-006: Dead route file (Missing Route export)
    if (activeRules.some((r) => r.code === 'RULE-ROUTE-006')) {
      if (!content.includes('export const Route') && !content.includes('export const route')) {
        violations.push({
          line: 1,
          ruleCode: 'RULE-ROUTE-006',
          ruleName: 'Dead Route File (Missing Route Export)',
          category: RULE_CATEGORY.ROUTER_ARCHITECTURE,
          severity: RULE_SEVERITY.MAJOR,
          matchedText: fileName,
          codeSnippet: `File route thiếu khai báo export const Route = ...`,
          fix: 'Thêm export const Route = createFileRoute(...) hoặc createLazyFileRoute(...).',
        });
      }
    }
  }

  // 2. Kiểm tra Dynamic Param naming ($domainId -> $id)
  if (activeRules.some((r) => r.code === 'RULE-PARAM-001')) {
    if (relativePath.includes('$') && !relativePath.includes('$id.')) {
      const matchParam = relativePath.match(/\$[a-zA-Z0-9_]+/);
      if (matchParam && matchParam[0] !== '$id') {
        violations.push({
          line: 1,
          ruleCode: 'RULE-PARAM-001',
          ruleName: 'Fragmented Dynamic Param Name',
          category: RULE_CATEGORY.NAMING_CONVENTION,
          severity: RULE_SEVERITY.MAJOR,
          matchedText: matchParam[0],
          codeSnippet: relativePath,
          fix: 'Đổi tên thành $id.tsx hoặc $id.lazy.tsx',
        });
      }
    }
  }

  // ==========================================================================
  // 3. RTK QUERY TAGS (src/store/api/*.ts) - BRACE BALANCED PARSER
  // ==========================================================================
  const isApiFile =
    (relativePath.includes('store/api/') || relativePath.includes('api/')) &&
    !relativePath.endsWith('baseApi.ts') &&
    !relativePath.endsWith('index.ts');

  if (isApiFile || content.includes('builder.mutation') || content.includes('builder.query')) {
    const checkMutation = activeRules.some((r) => r.code === 'RULE-RTK-001');
    const checkQuery = activeRules.some((r) => r.code === 'RULE-RTK-002');

    if (checkMutation || checkQuery) {
      const triggerRegex = /(\w+)\s*:\s*builder\.(mutation|query)(?:<[\s\S]*?>)?\s*\(/g;
      let match;
      while ((match = triggerRegex.exec(content)) !== null) {
        const endpointName = match[1];
        const type = match[2];
        const startIndex = match.index + match[0].length;

        const braceIndex = content.indexOf('{', startIndex);
        if (braceIndex !== -1 && braceIndex < startIndex + 60) {
          let depth = 1;
          let endIndex = -1;
          for (let i = braceIndex + 1; i < content.length; i++) {
            const char = content[i];
            if (char === '{') {
              depth++;
            } else if (char === '}') {
              depth--;
              if (depth === 0) {
                endIndex = i;
                break;
              }
            }
          }

          if (endIndex !== -1) {
            const block = content.substring(braceIndex, endIndex + 1);
            const line = content.substring(0, match.index).split('\n').length;

            if (type === 'mutation' && checkMutation) {
              const hasInvalidates = block.includes('invalidatesTags');
              const hasLogicComment = block.includes('LOGIC:') || block.includes('-- LOGIC:');
              if (!hasInvalidates && !hasLogicComment) {
                violations.push({
                  line,
                  ruleCode: 'RULE-RTK-001',
                  ruleName: 'Missing invalidatesTags in RTK Query Mutation',
                  category: RULE_CATEGORY.RTK_QUERY,
                  severity: RULE_SEVERITY.CRITICAL,
                  matchedText: `${endpointName}: builder.mutation`,
                  codeSnippet: `${endpointName}: builder.mutation(...) thiếu cấu hình invalidatesTags`,
                  fix: `Thêm invalidatesTags: ['TagName'] (hoặc invalidatesTags: []) vào endpoint ${endpointName}.`,
                });
              }
            } else if (type === 'query' && checkQuery) {
              if (!block.includes('providesTags')) {
                violations.push({
                  line,
                  ruleCode: 'RULE-RTK-002',
                  ruleName: 'Missing providesTags in RTK Query Query',
                  category: RULE_CATEGORY.RTK_QUERY,
                  severity: RULE_SEVERITY.MAJOR,
                  matchedText: `${endpointName}: builder.query`,
                  codeSnippet: `${endpointName}: builder.query(...) thiếu cấu hình providesTags`,
                  fix: `Thêm providesTags: ['TagName'] vào endpoint ${endpointName}.`,
                });
              }
            }
          }
        }
      }
    }
  }

  // ==========================================================================
  // 4. RADIX TRIGGER asChild, NESTED INTERACTIVE & TABLE CELLS
  // ==========================================================================
  // RULE-RADIX-001: Radix Trigger wrapping interactive element
  if (activeRules.some((r) => r.code === 'RULE-RADIX-001')) {
    const triggerRegex = /<((?:Dialog|Popover|Tooltip|DropdownMenu|AlertDialog|HoverCard)Trigger)\b([^>]*)>([\s\S]{0,100}?)<(button|Button|a|Link)\b/gi;
    let match;
    while ((match = triggerRegex.exec(content)) !== null) {
      const triggerTag = match[1];
      const triggerAttrs = match[2];
      const childTag = match[4];
      if (!triggerAttrs.includes('asChild')) {
        const line = content.substring(0, match.index).split('\n').length;
        violations.push({
          line,
          ruleCode: 'RULE-RADIX-001',
          ruleName: 'Radix Trigger Wrapping Interactive Element Must Use asChild',
          category: RULE_CATEGORY.REACT_PATTERNS,
          severity: RULE_SEVERITY.CRITICAL,
          matchedText: `<${triggerTag}> wrapping <${childTag}>`,
          codeSnippet: `<${triggerTag}> bọc phần tử tương tác <${childTag}> nhưng thiếu thuộc tính asChild.`,
          fix: `Thêm asChild: <${triggerTag} asChild><${childTag}>...</${childTag}></${triggerTag}>.`,
        });
      }
    }
  }

  // RULE-HTML-001: Nested interactive element in JSX
  if (activeRules.some((r) => r.code === 'RULE-HTML-001')) {
    const nestedPattern = /<(button|a)\b[^>]*>(?:(?!<\/\1>)[\s\S]){0,250}?<(?!\/)(button|a)\b[^>]*>/gi;
    let match;
    while ((match = nestedPattern.exec(content)) !== null) {
      const parentTag = match[1].toLowerCase();
      const childTag = match[2].toLowerCase();
      const line = content.substring(0, match.index).split('\n').length;
      violations.push({
        line,
        ruleCode: 'RULE-HTML-001',
        ruleName: 'Nested Interactive Element in JSX',
        category: RULE_CATEGORY.HTML_STANDARDS,
        severity: RULE_SEVERITY.CRITICAL,
        matchedText: `<${parentTag}> contains nested <${childTag}>`,
        codeSnippet: `Thẻ tương tác <${childTag}> bị lồng bên trong thẻ tương tác <${parentTag}>.`,
        fix: 'Tách biệt 2 thẻ tương tác hoặc chuyển thẻ con thành <span> kèm onClick.',
      });
    }
  }

  // RULE-HTML-002: Invalid nested table cell
  if (activeRules.some((r) => r.code === 'RULE-HTML-002')) {
    const tableCellPattern = /<(th|td)\b[^>]*>(?:(?!<\/\1>)[\s\S]){0,250}?<(?!\/)(th|td)\b[^>]*>/gi;
    let match;
    while ((match = tableCellPattern.exec(content)) !== null) {
      const parentTag = match[1].toLowerCase();
      const childTag = match[2].toLowerCase();
      const line = content.substring(0, match.index).split('\n').length;
      violations.push({
        line,
        ruleCode: 'RULE-HTML-002',
        ruleName: 'Invalid Nested Table Cell',
        category: RULE_CATEGORY.HTML_STANDARDS,
        severity: RULE_SEVERITY.CRITICAL,
        matchedText: `<${parentTag}> contains nested <${childTag}>`,
        codeSnippet: `Thẻ <${childTag}> bị lồng bên trong thẻ ô bảng <${parentTag}>.`,
        fix: 'Đặt các thẻ <th> và <td> cùng cấp bên trong thẻ <tr>.',
      });
    }
  }

  // RULE-COMPONENT-001: Nested component definition in parent function
  if (activeRules.some((r) => r.code === 'RULE-COMPONENT-001')) {
    const nestedCompRegex =
      /(?:function\s+([A-Z][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{|(?:const|let|var)\s+([A-Z][a-zA-Z0-9_]*)\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>)/g;
    let match;
    while ((match = nestedCompRegex.exec(content)) !== null) {
      const compName = match[1] || match[2];
      if (!compName || compName.startsWith('use') || compName === compName.toUpperCase()) continue;
      const beforeContent = content.substring(0, match.index);
      if (
        /(?:function\s+[A-Z][a-zA-Z0-9_]*\s*\(|export\s+(?:default\s+)?(?:function|const)\s+[A-Z][a-zA-Z0-9_]*|const\s+[A-Z][a-zA-Z0-9_]*\s*=\s*(?:React\.)?(?:memo\(|forwardRef\()?\(?)/.test(
          beforeContent
        )
      ) {
        let openBraces = 0;
        for (let i = 0; i < beforeContent.length; i++) {
          if (beforeContent[i] === '{') openBraces++;
          else if (beforeContent[i] === '}') openBraces--;
        }
        if (openBraces > 0) {
          const afterContent = content.substring(match.index, match.index + 500);
          if (
            afterContent.includes('return (') ||
            afterContent.includes('return <') ||
            /=>\s*\(\s*</.test(afterContent) ||
            /=>\s*<[a-zA-Z]/.test(afterContent)
          ) {
            const line = content.substring(0, match.index).split('\n').length;
            violations.push({
              line,
              ruleCode: 'RULE-COMPONENT-001',
              ruleName: 'Nested Component Definition in Parent Function',
              category: RULE_CATEGORY.REACT_PATTERNS,
              severity: RULE_SEVERITY.MINOR,
              matchedText: `${match[0].trim()} inside parent component`,
              codeSnippet: `Component con ${compName} được định nghĩa bên trong thân component cha.`,
              fix: `Đưa component ${compName} ra ngoài phạm vi component cha để tránh re-declare mỗi lần render.`,
            });
          }
        }
      }
    }
  }

  // ==========================================================================
  // 5. LAYER BOUNDARIES & MOCK IMPORTS
  // ==========================================================================
  const isStore = relativePath.startsWith('store/') || relativePath.startsWith('src/store/');
  const isTypes = relativePath.startsWith('types/') || relativePath.startsWith('src/types/');
  const isUtils = relativePath.startsWith('utils/') || relativePath.startsWith('src/utils/');
  const isCommon = relativePath.startsWith('components/common/') || relativePath.startsWith('src/components/common/');

  const isProductionUiOrStoreOrRoute =
    (relativePath.startsWith('components/') ||
      relativePath.startsWith('src/components/') ||
      relativePath.startsWith('routes/') ||
      relativePath.startsWith('src/routes/') ||
      relativePath.startsWith('store/') ||
      relativePath.startsWith('src/store/')) &&
    !relativePath.endsWith('.test.ts') &&
    !relativePath.endsWith('.test.tsx') &&
    !relativePath.endsWith('.spec.ts') &&
    !relativePath.endsWith('.spec.tsx') &&
    !relativePath.includes('/mocks/');

  const isLocaleOrMockFile =
    relativePath.includes('locales/') ||
    relativePath.includes('mocks/') ||
    relativePath.includes('constants/') ||
    relativePath.includes('.test.') ||
    relativePath.includes('.spec.');

  // ==========================================================================
  // 6. LINE-BY-LINE TOKEN & REGEX SCANNING
  // ==========================================================================
  lines.forEach((lineText, lineIdx) => {
    const trimmed = lineText.trim();

    // RULE-SUPPRESS-001: Suppression comment check before skipping comment lines
    if (activeRules.some((r) => r.code === 'RULE-SUPPRESS-001')) {
      if (/(?:@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable)/.test(trimmed)) {
        if (!trimmed.includes('-- LOGIC:')) {
          violations.push({
            line: lineIdx + 1,
            ruleCode: 'RULE-SUPPRESS-001',
            ruleName: 'Suppression Comments Without Justification',
            category: RULE_CATEGORY.CLEAN_CODE,
            severity: RULE_SEVERITY.MINOR,
            matchedText: trimmed,
            codeSnippet: trimmed,
            fix: 'Thêm lý do giải thích rõ ràng sau comment: // eslint-disable-next-line -- LOGIC: lý do tại đây.',
          });
        }
      }
    }

    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('{/*') ||
      trimmed.endsWith('*/}')
    ) {
      return;
    }

    // Loại bỏ trailing comment // hoặc {/* ... */} để không match nhầm comment giải thích
    let cleanLine = lineText;
    const commentIdx = cleanLine.indexOf('//');
    if (commentIdx !== -1) {
      cleanLine = cleanLine.substring(0, commentIdx);
    }
    const jsxCommentIdx = cleanLine.indexOf('{/*');
    if (jsxCommentIdx !== -1) {
      cleanLine = cleanLine.substring(0, jsxCommentIdx);
    }

    // Đếm số lượng vị trí dùng Token chuẩn
    SEMANTIC_TOKENS.forEach((token) => {
      if (cleanLine.includes(token)) compliantCount++;
    });

    // RULE-I18N-001: Hardcoded Vietnamese text in JSX, Props, and Expressions
    if (activeRules.some((r) => r.code === 'RULE-I18N-001') && !isLocaleOrMockFile) {
      const jsxTextMatch = cleanLine.match(/>([^<>{}]*[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][^<>{}]*)</);
      const propMatch = cleanLine.match(/(?:\b(?:placeholder|title|aria-label|alt|label|description|buttonText|helperText|emptyText|text|header|heading)\s*=\s*(?:["']([^"']*[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][^"']*)["']|\{\s*["'`]([^"'`]*[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][^"'`]*)["`]\s*\}))/);
      const ternaryMatch = cleanLine.match(/(?:\?|:)\s*['"`]([^'"`]*[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][^'"`]*)['"`]/);
      const match = jsxTextMatch || propMatch || ternaryMatch;
      if (match) {
        const textFound = (match[1] || match[2] || match[0]).trim();
        violations.push({
          line: lineIdx + 1,
          ruleCode: 'RULE-I18N-001',
          ruleName: 'Hardcoded Vietnamese UI Text in JSX',
          category: RULE_CATEGORY.CLEAN_CODE,
          severity: RULE_SEVERITY.MINOR,
          matchedText: textFound,
          codeSnippet: trimmed,
          fix: 'Bọc chuỗi hiển thị bằng hàm dịch trans("...") hoặc khai báo trong src/locales/.',
        });
      }
    }

    // RULE-CUSTOM-001: Excessive arbitrary utility classes on a single line
    if (activeRules.some((r) => r.code === 'RULE-CUSTOM-001')) {
      const classMatches = cleanLine.match(/className=["'`]([^"'`]+)["'`]/);
      if (classMatches) {
        const classStr = classMatches[1];
        const utilityTokens = classStr.match(/(?:^|\s)(?:[a-zA-Z0-9_-]+:)*(?:w|h|min-w|max-w|min-h|max-h|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|top|bottom|left|right|inset|gap|grid-cols|grid-rows|col-span|row-span|tracking|leading|text|bg|border|rounded|shadow)-\[[^\]]+\]/g) || [];
        if (utilityTokens.length >= 4) {
          violations.push({
            line: lineIdx + 1,
            ruleCode: 'RULE-CUSTOM-001',
            ruleName: 'Excessive Arbitrary Tailwind Classes',
            category: RULE_CATEGORY.THEME_SSOT,
            severity: RULE_SEVERITY.INFO,
            matchedText: utilityTokens.map((t) => t.trim()).join(' '),
            codeSnippet: trimmed,
            fix: 'Rút gọn hoặc trích xuất component/utility class thay vì dùng quá nhiều arbitrary values.',
          });
        }
      }
    }

    // Layer boundary check (RULE-IMPORT-003)
    if (activeRules.some((r) => r.code === 'RULE-IMPORT-003')) {
      if (isStore && /from\s+['"](?:@\/components|@\/routes|\.\.?\/.*components|\.\.?\/.*routes)/.test(cleanLine)) {
        violations.push({
          line: lineIdx + 1,
          ruleCode: 'RULE-IMPORT-003',
          ruleName: 'Upward Layer Architectural Import Violation',
          category: RULE_CATEGORY.LAYER_BOUNDARIES,
          severity: RULE_SEVERITY.CRITICAL,
          matchedText: trimmed,
          codeSnippet: `Layer store/ không được import từ components/ hoặc routes/: ${trimmed}`,
          fix: 'Xóa dependency từ store/ sang UI components.',
        });
      }

      if (isTypes && /from\s+['"](?:@\/components|@\/routes|@\/store|\.\.?\/.*components)/.test(cleanLine)) {
        violations.push({
          line: lineIdx + 1,
          ruleCode: 'RULE-IMPORT-003',
          ruleName: 'Upward Layer Architectural Import Violation',
          category: RULE_CATEGORY.LAYER_BOUNDARIES,
          severity: RULE_SEVERITY.CRITICAL,
          matchedText: trimmed,
          codeSnippet: `Layer types/ không được import từ UI components: ${trimmed}`,
          fix: 'Chuyển định nghĩa type vào types/ và để components import types/.',
        });
      }

      if (isUtils && /from\s+['"](?:@\/components|@\/routes|@\/store)/.test(cleanLine)) {
        violations.push({
          line: lineIdx + 1,
          ruleCode: 'RULE-IMPORT-003',
          ruleName: 'Upward Layer Architectural Import Violation',
          category: RULE_CATEGORY.LAYER_BOUNDARIES,
          severity: RULE_SEVERITY.CRITICAL,
          matchedText: trimmed,
          codeSnippet: `Layer utils/ không được import từ store/ hoặc components/: ${trimmed}`,
          fix: 'Giữ utils/ thuần túy không phụ thuộc state hay UI.',
        });
      }

      if (isCommon && /from\s+['"]@\/components\/(?!common\b)[a-zA-Z0-9_-]+/.test(cleanLine)) {
        violations.push({
          line: lineIdx + 1,
          ruleCode: 'RULE-IMPORT-003',
          ruleName: 'Upward Layer Architectural Import Violation',
          category: RULE_CATEGORY.LAYER_BOUNDARIES,
          severity: RULE_SEVERITY.CRITICAL,
          matchedText: trimmed,
          codeSnippet: `components/common/ không được import từ domain features: ${trimmed}`,
          fix: 'Tách logic dùng chung ra khỏi domain feature hoặc truyền qua props/children.',
        });
      }
    }

    // Mock imports check in production UI & Store (RULE-MOCK-002)
    if (activeRules.some((r) => r.code === 'RULE-MOCK-002') && isProductionUiOrStoreOrRoute) {
      if (/from\s+['"](?:@\/mocks(?:\/.*)?|\.\.?\/.*mocks(?:\/.*)?)['"]/.test(cleanLine)) {
        violations.push({
          line: lineIdx + 1,
          ruleCode: 'RULE-MOCK-002',
          ruleName: 'Production Code Importing From Mock Modules',
          category: RULE_CATEGORY.CLEAN_CODE,
          severity: RULE_SEVERITY.CRITICAL,
          matchedText: trimmed,
          codeSnippet: trimmed,
          fix: 'Thay thế dữ liệu mock bằng RTK Query hooks hoặc API service thực tế.',
        });
      }
    }

    // RULE-ROUTE-005: Prefer <Link> for static onClick navigation
    if (activeRules.some((r) => r.code === 'RULE-ROUTE-005')) {
      if (
        /(?:onClick|onSelect)\s*=\s*\{(?:\([^)]*\)\s*=>\s*)?(?:router\.navigate|navigate)\s*\(\s*\{\s*to:\s*['"][^'"]+['"]/.test(
          cleanLine
        )
      ) {
        violations.push({
          line: lineIdx + 1,
          ruleCode: 'RULE-ROUTE-005',
          ruleName: 'Prefer <Link> for Static Navigation',
          category: RULE_CATEGORY.ROUTER_ARCHITECTURE,
          severity: RULE_SEVERITY.INFO,
          matchedText: trimmed,
          codeSnippet: trimmed,
          fix: 'Thay thế button onClick={navigate} bằng component <Link to="...">...</Link>.',
        });
      }
    }

    // RULE-UI-001: Forbidden display: contents on Table & Complex Grid Elements
    if (activeRules.some((r) => r.code === 'RULE-UI-001')) {
      const hasDisplayContents =
        /display:\s*['"]?contents['"]?/.test(cleanLine) ||
        /\bclassName\s*=\s*['"][^'"]*\bcontents\b[^'"]*['"]/.test(cleanLine) ||
        /\bcn\s*\([^)]*\bcontents\b[^)]*\)/.test(cleanLine);

      if (hasDisplayContents) {
        // Chỉ bắt khi áp dụng trên thẻ table, component table hoặc trong file Table/Grid
        const isTableElement = /<(?:table|thead|tbody|tfoot|tr|th|td|caption|colgroup|Table|TableHeader|TableBody|TableRow|TableCell|TableHead|Tr|Th|Td)\b/i.test(
          cleanLine
        );
        const isTableFile = /table|grid/i.test(relativePath);

        if (isTableElement || isTableFile) {
          violations.push({
            line: lineIdx + 1,
            ruleCode: 'RULE-UI-001',
            ruleName: 'Forbidden display: contents on Table & Complex Grid Elements',
            category: RULE_CATEGORY.HTML_STANDARDS,
            severity: RULE_SEVERITY.MAJOR,
            matchedText: 'display: contents',
            codeSnippet: trimmed,
            fix: 'Sử dụng React Fragment (<>...</>) hoặc các thẻ bảng chuẩn (tr, td, th) thay vì ép display: contents lên phần tử bảng.',
          });
        }
      }
    }

    // Quét rules có regex
    activeRules.forEach((rule) => {
      if (rule.code === 'RULE-MOCK-002' || rule.code === 'RULE-ROUTE-005' || rule.code === 'RULE-UI-001') {
        return;
      }

      if (rule.code === 'RULE-API-001' && isBaseApiFile) {
        return;
      }

      if (
        (rule.code === 'RULE-COLOR-001' || rule.code === 'RULE-COLOR-002') &&
        (isBrandOrLogoOrMockFile || cleanLine.includes('BRAND_COLOR') || cleanLine.includes('brandColor'))
      ) {
        return;
      }

      if (rule.code === 'RULE-TYPE-002' && relativePath.startsWith('types/')) {
        return;
      }

      if (rule.code === 'RULE-BARREL-002' && !isRouteFile) {
        return;
      }

      if (rule.code === 'RULE-CONSOLE-001' && (relativePath.includes('logger') || relativePath.includes('test'))) {
        return;
      }

      if (
        rule.code === 'RULE-RADIUS-001' &&
        (lineText.includes('CUSTOM_RADIUS') ||
          lineText.includes('custom_radius') ||
          lineText.includes('-- LOGIC:') ||
          cleanLine.includes('CUSTOM_RADIUS'))
      ) {
        return;
      }

      if (rule.matchRegex) {
        const matches = [...cleanLine.matchAll(rule.matchRegex)];
        if (matches.length > 0) {
          matches.forEach((m) => {
            const rawMatch = m[0] || '';
            let cleanedText = rawMatch.trim().replace(/^['"`]+|['"`]+$/g, '');
            if (rule.code === 'RULE-IMPORT-001') {
              cleanedText = cleanedText.replace(/^from\s+['"]?/, '').replace(/['"]+$/, '');
            }
            violations.push({
              line: lineIdx + 1,
              ruleCode: rule.code,
              ruleName: rule.name,
              category: rule.category,
              severity: rule.severity,
              matchedText: cleanedText,
              codeSnippet: trimmed,
              fix: rule.fix,
            });
          });
        }
      }
    });
  });

  return {
    filePath,
    relativePath,
    violations,
    compliantCount,
  };
}

/**
 * Kiểm tra xem một thư mục có chứa mã nguồn (.tsx/.ts) thật hay không
 */
function hasSourceCode(dir) {
  if (!fs.existsSync(dir)) return false;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (hasSourceCode(full)) return true;
    } else if (item.endsWith('.tsx') || item.endsWith('.ts')) {
      if (item !== 'index.ts' && item !== 'index.tsx') return true;
    }
  }
  return false;
}

/**
 * Quét các cấu trúc thư mục toàn dự án (Feature index.ts barrel, type file naming, legacy dead folders)
 */
export function lintProjectStructure(targetDir, activeRules = RULES) {
  const structureResults = [];

  const componentsDir = path.join(targetDir, 'components');
  if (fs.existsSync(componentsDir) && fs.statSync(componentsDir).isDirectory()) {
    const features = fs.readdirSync(componentsDir);
    features.forEach((feature) => {
      const featPath = path.join(componentsDir, feature);
      if (!fs.statSync(featPath).isDirectory() || feature === 'common' || feature === 'ui') return;

      const subItems = fs.readdirSync(featPath);

      // RULE-BARREL-001: Missing Feature Barrel Entrypoint (Chỉ áp dụng nếu folder có file mã nguồn thực sự)
      if (activeRules.some((r) => r.code === 'RULE-BARREL-001')) {
        const hasIndex = fs.existsSync(path.join(featPath, 'index.ts')) || fs.existsSync(path.join(featPath, 'index.tsx'));
        if (!hasIndex && hasSourceCode(featPath)) {
          structureResults.push({
            filePath: path.join(featPath, 'index.ts'),
            relativePath: `components/${feature}/index.ts`,
            compliantCount: 0,
            violations: [
              {
                line: 1,
                ruleCode: 'RULE-BARREL-001',
                ruleName: 'Missing Feature Barrel Entrypoint',
                category: RULE_CATEGORY.BARREL_EXPORTS,
                severity: RULE_SEVERITY.CRITICAL,
                matchedText: `components/${feature}/index.ts`,
                codeSnippet: `Feature module components/${feature} thiếu file entrypoint index.ts.`,
                fix: `Tạo file components/${feature}/index.ts và export các thư mục con.`,
              },
            ],
          });
        }
      }

      // RULE-FOLDER-003: Legacy or Dead Feature Folder Detected (chỉ cấm components/ và forms/)
      if (activeRules.some((r) => r.code === 'RULE-FOLDER-003')) {
        const hasModernHierarchy = subItems.some((i) => ['pages', 'shared', 'tabs', 'steps', 'modals'].includes(i));
        if (hasModernHierarchy) {
          ['components', 'forms'].forEach((legacyFolder) => {
            const legacyPath = path.join(featPath, legacyFolder);
            if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isDirectory()) {
              const filesInLegacy = fs.readdirSync(legacyPath);
              const isEmpty = filesInLegacy.length === 0;
              structureResults.push({
                filePath: legacyPath,
                relativePath: `components/${feature}/${legacyFolder}`,
                compliantCount: 0,
                violations: [
                  {
                    line: 1,
                    ruleCode: 'RULE-FOLDER-003',
                    ruleName: 'Legacy or Dead Feature Folder Detected',
                    category: RULE_CATEGORY.FOLDER_COLOCATION,
                    severity: RULE_SEVERITY.MAJOR,
                    matchedText: `components/${feature}/${legacyFolder}`,
                    codeSnippet: isEmpty
                      ? `Thư mục phẳng cũ components/${feature}/${legacyFolder} (thư mục rỗng - cần xoá).`
                      : `Thư mục phẳng cũ components/${feature}/${legacyFolder} vẫn tồn tại sau khi đã có cấu trúc pages/tabs/steps/modals.`,
                    fix: isEmpty
                      ? `Xoá bỏ thư mục rỗng ${legacyFolder}/.`
                      : `Di chuyển toàn bộ component sang tabs/, steps/, modals/ hoặc pages/ và xóa bỏ thư mục ${legacyFolder}/.`,
                  },
                ],
              });
            }
          });
        }
      }

      // RULE-FOLDER-002: Misplaced Single-use Component in shared/
      if (activeRules.some((r) => r.code === 'RULE-FOLDER-002')) {
        const sharedDir = path.join(featPath, 'shared');
        if (fs.existsSync(sharedDir) && fs.statSync(sharedDir).isDirectory()) {
          const sharedFiles = fs.readdirSync(sharedDir);
          sharedFiles.forEach((file) => {
            if (!file.endsWith('.tsx') && !file.endsWith('.jsx')) return;
            const baseName = file.replace(/\.(tsx|jsx)$/, '');
            const isStandardSharedName =
              /(?:Header|Tabs|Table|Layout|Wrapper|Summary|Modal|Dialog|Card|Cards|Stats|Bar|List|Item|Grid|Badge|Filter|Pagination|View|Section|Breadcrumb|Breadcrumbs|Stepper|Timeline|Nav|Navbar|Toolbar|Panel|Actions|Action|Skeleton|Empty|Status|Banner|Alert|Drawer)$/.test(
                baseName
              ) || baseName.startsWith(feature.charAt(0).toUpperCase() + feature.slice(1));

            if (!isStandardSharedName) {
              const fullPath = path.join(sharedDir, file);
              structureResults.push({
                filePath: fullPath,
                relativePath: `components/${feature}/shared/${file}`,
                compliantCount: 0,
                violations: [
                  {
                    line: 1,
                    ruleCode: 'RULE-FOLDER-002',
                    ruleName: 'Misplaced Single-use Component in shared/',
                    category: RULE_CATEGORY.FOLDER_COLOCATION,
                    severity: RULE_SEVERITY.MAJOR,
                    matchedText: `components/${feature}/shared/${file}`,
                    codeSnippet: `Component ${file} trong shared/ nên là component dùng chung hoặc đặt tên chuẩn shared layout (*Header, *Tabs, *Table, *Modal...).`,
                    fix: `Chuyển component về đúng tabs/{tab}/ hoặc đổi tên theo chuẩn shared component.`,
                  },
                ],
              });
            }
          });
        }
      }
    });
  }

  // RULE-TYPE-003: Invalid Type File Naming in src/types/
  if (activeRules.some((r) => r.code === 'RULE-TYPE-003')) {
    const typesDir = path.join(targetDir, 'types');
    if (fs.existsSync(typesDir) && fs.statSync(typesDir).isDirectory()) {
      const typeFiles = fs.readdirSync(typesDir);
      typeFiles.forEach((file) => {
        if (file === 'index.ts' || file === 'index.d.ts') return;
        const isValid = /^[a-z][a-zA-Z0-9_]*\.types\.ts$/.test(file);
        if (!isValid) {
          const fullPath = path.join(typesDir, file);
          structureResults.push({
            filePath: fullPath,
            relativePath: `types/${file}`,
            compliantCount: 0,
            violations: [
              {
                line: 1,
                ruleCode: 'RULE-TYPE-003',
                ruleName: 'Invalid Type File Naming in src/types/',
                category: RULE_CATEGORY.TYPE_SAFETY,
                severity: RULE_SEVERITY.MAJOR,
                matchedText: file,
                codeSnippet: `File types/${file} không tuân theo quy chuẩn đặt tên *.types.ts.`,
                fix: `Đổi tên file thành ${file.replace(/\.ts$/, '')}.types.ts và dùng chữ cái thường đầu dòng.`,
              },
            ],
          });
        }
      });
    }
  }

  return structureResults;
}

export function runLintEngine(options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();

  let detectDir = cwd;
  if (options.path) {
    const resolvedPath = path.isAbsolute(options.path)
      ? path.normalize(options.path)
      : path.resolve(cwd, options.path);

    if (fs.existsSync(resolvedPath)) {
      detectDir = fs.statSync(resolvedPath).isDirectory()
        ? resolvedPath
        : path.dirname(resolvedPath);
    } else {
      detectDir = path.dirname(resolvedPath);
    }
  }

  const projectInfo = detectProject(detectDir);

  let activeRules = RULES;

  // 1. Lọc theo Rule cụ thể (options.rule)
  if (options.rule) {
    const cleanRule = options.rule.replace(/^--?/, '').trim().toLowerCase();
    activeRules = RULES.filter(
      (r) =>
        r.code.toLowerCase() === cleanRule ||
        r.code.toLowerCase().includes(cleanRule) ||
        r.name.toLowerCase().includes(cleanRule)
    );
  }
  // 2. Lọc theo Nhóm Rule (options.group hoặc options.preset)
  else if (options.group || (options.preset && options.preset !== 'all')) {
    const targetGroup = (options.group || options.preset).toLowerCase();

    if (targetGroup === 'i18n') {
      activeRules = RULES.filter((r) => r.code === 'RULE-I18N-001');
    } else if (targetGroup === 'radius') {
      activeRules = RULES.filter((r) => r.code === 'RULE-RADIUS-001');
    } else if (targetGroup === 'mock' || targetGroup === 'mocks') {
      activeRules = RULES.filter(
        (r) =>
          r.code.startsWith('RULE-MOCK') ||
          r.code.startsWith('RULE-DEAD') ||
          r.code.startsWith('RULE-CONSOLE')
      );
    } else if (targetGroup === 'color' || targetGroup === 'colors') {
      activeRules = RULES.filter((r) => r.category === RULE_CATEGORY.COLOR_TOKENS);
    } else if (targetGroup === 'tokens') {
      activeRules = RULES.filter(
        (r) =>
          r.category === RULE_CATEGORY.COLOR_TOKENS ||
          r.category === RULE_CATEGORY.BORDER_RADIUS ||
          r.category === RULE_CATEGORY.THEME_SSOT
      );
    } else if (targetGroup === 'rtk') {
      activeRules = RULES.filter(
        (r) => r.category === RULE_CATEGORY.RTK_QUERY || r.code.startsWith('RULE-RTK')
      );
    } else if (targetGroup === 'router') {
      activeRules = RULES.filter(
        (r) =>
          r.category === RULE_CATEGORY.ROUTER_ARCHITECTURE ||
          r.code.startsWith('RULE-ROUTE') ||
          r.code.startsWith('RULE-PARAM')
      );
    } else if (targetGroup === 'arch' || targetGroup === 'architecture') {
      activeRules = RULES.filter(
        (r) =>
          r.category === RULE_CATEGORY.ROUTER_ARCHITECTURE ||
          r.category === RULE_CATEGORY.BARREL_EXPORTS ||
          r.category === RULE_CATEGORY.LAYER_BOUNDARIES ||
          r.category === RULE_CATEGORY.RTK_QUERY ||
          r.category === RULE_CATEGORY.FOLDER_COLOCATION
      );
    } else if (targetGroup === 'types') {
      activeRules = RULES.filter(
        (r) => r.category === RULE_CATEGORY.TYPE_SAFETY || r.code.startsWith('RULE-TYPE')
      );
    } else if (targetGroup === 'react') {
      activeRules = RULES.filter(
        (r) =>
          r.category === RULE_CATEGORY.REACT_PATTERNS ||
          r.category === RULE_CATEGORY.HTML_STANDARDS
      );
    } else if (targetGroup === 'strict' || targetGroup === 'ci') {
      activeRules = RULES.filter(
        (r) => r.severity === RULE_SEVERITY.CRITICAL || r.severity === RULE_SEVERITY.MAJOR
      );
    } else if (targetGroup === 'migration' || targetGroup === 'warn') {
      activeRules = RULES.filter(
        (r) => r.severity === RULE_SEVERITY.MINOR || r.severity === RULE_SEVERITY.INFO
      );
    } else if (targetGroup === 'universal') {
      activeRules = RULES.filter((r) => r.preset === 'universal' || r.preset === 'ci');
    } else {
      activeRules = RULES.filter((r) => r.preset === targetGroup);
    }
  }

  const files = collectFiles(options.path, projectInfo.srcDir);
  const fileResults = files.map((f) => lintFile(f, projectInfo.srcDir, activeRules));

  // Chạy project-wide structural audit nếu không chỉ định quét 1 file đơn lẻ
  let projectResults = [];
  if (!options.path || (fs.existsSync(options.path) && fs.statSync(options.path).isDirectory())) {
    projectResults = lintProjectStructure(projectInfo.srcDir, activeRules);
  }

  const results = [...fileResults, ...projectResults];

  let totalCompliant = 0;
  let totalViolations = 0;
  let filesWithViolations = 0;

  results.forEach((r) => {
    totalCompliant += r.compliantCount;
    totalViolations += r.violations.length;
    if (r.violations.length > 0) filesWithViolations++;
  });

  const totalFiles = files.length + projectResults.length;
  const cleanFiles = totalFiles - filesWithViolations;
  const complianceRate = totalFiles > 0 ? ((cleanFiles / totalFiles) * 100).toFixed(1) : 100;

  return {
    projectInfo,
    results,
    summary: {
      totalFiles,
      cleanFiles,
      filesWithViolations,
      totalCompliant,
      totalViolations,
      complianceRate,
    },
  };
}


