import path from 'path';
import ts from 'typescript';
import { PRIORITIES } from '../../../engine/findings.js';

export function runListPagePack(context, filePath) {
  const normPath = path.normalize(filePath).replace(/\\/g, '/');
  const fileName = path.basename(filePath);

  // Identify ListPage files: *ListPage.tsx or files containing Table + query hook
  const isListPageCandidate = fileName.endsWith('ListPage.tsx') || (fileName.endsWith('Page.tsx') && normPath.includes('/pages/'));
  if (!isListPageCandidate) return;

  const sourceFile = context.parser.getSourceFile(filePath);
  const content = context.parser.getContent(filePath);
  if (!sourceFile || !content) return;

  // Check if this page uses Table or query list hook
  const hasQueryHook = /use[A-Z0-9].*Query\(/.test(content);
  const hasTableOrList = content.includes('Table') || content.includes('DataTable') || content.includes('pagination');
  if (!hasQueryHook || !hasTableOrList) return;

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

  // Record requirements in coverage
  context.recordRequirement('LIST.FILTER.STATE');
  context.recordRequirement('LIST.FILTER.UPDATE');
  context.recordRequirement('LIST.SEARCH.DEBOUNCE');
  context.recordRequirement('LIST.PAGINATION.CONSTANTS');
  context.recordRequirement('LIST.PAGINATION.MEMO');
  context.recordRequirement('LIST.METADATA.DECLARATION');

  // RULE-LIST-004: Check inline magic limit numbers in pagination (e.g. pageSize: 20 or [10, 20, 50])
  const inlineLimitRegex = /\b(?:pageSize|perPage|limit)\s*:\s*(?:10|20|50)\b/g;
  let limitMatch;
  while ((limitMatch = inlineLimitRegex.exec(content)) !== null) {
    if (!content.includes('DEFAULT_LIMIT')) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(limitMatch.index);
      context.addFinding({
        ruleCode: 'RULE-LIST-004',
        subcheck: 'inline-limit-magic-number',
        requirementIds: ['LIST.PAGINATION.CONSTANTS'],
        priority: PRIORITIES.LOW,
        confidence: 'proven',
        location: { path: filePath, line: line + 1, column: character + 1 },
        message: `Phát hiện số trang cứng "${limitMatch[0]}". Phải sử dụng hằng số DEFAULT_LIMIT hoặc LIMIT_OPTIONS từ constants.`,
        suggestion: 'Import và dùng DEFAULT_LIMIT từ @/constants hoặc module constants.',
        evidence: limitMatch[0],
      });
    }
  }

  // Check state declarations inside ListPage
  let useStateCount = 0;
  let firstUseStateNode = null;
  let filtersStateNode = null;
  let searchNode = null;
  let hasFiltersObject = false;
  let hasDebounce = false;

  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const fnName = node.expression.text;
      if (fnName === 'useState') {
        useStateCount++;
        if (!firstUseStateNode) firstUseStateNode = node;
        // Check if argument is object with page/search
        if (node.arguments.length > 0 && ts.isObjectLiteralExpression(node.arguments[0])) {
          const text = node.arguments[0].getText(sourceFile);
          if (text.includes('page') || text.includes('search')) {
            hasFiltersObject = true;
            filtersStateNode = node;
          }
        }
      }
      if (fnName === 'useDebounce') {
        hasDebounce = true;
      }
    }
    if (!searchNode && ts.isIdentifier(node) && node.text.toLowerCase().includes('search')) {
      searchNode = node;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  // RULE-LIST-001: Fragmented filter states (if >= 4 useStates without unified filters object)
  if (useStateCount >= 4 && !hasFiltersObject) {
    report(
      'RULE-LIST-001',
      firstUseStateNode || sourceFile,
      `Trang danh sách "${fileName}" có ${useStateCount} state riêng lẻ. Nên gom các bộ lọc tìm kiếm/phân trang vào 1 object state "filters" duy nhất.`,
      'Gom các bộ lọc thành: const [filters, setFilters] = useState({ page: 1, limit: DEFAULT_LIMIT, search: "", ... });',
      `useState count: ${useStateCount}`,
      PRIORITIES.MEDIUM,
      'fragmented-filter-state',
      ['LIST.FILTER.STATE']
    );
  }

  // RULE-LIST-003: Missing useDebounce for search in list page
  if (content.includes('search') && !hasDebounce && !content.includes('debounce')) {
    report(
      'RULE-LIST-003',
      searchNode || sourceFile,
      `Trang danh sách "${fileName}" có xử lý tìm kiếm nhưng thiếu useDebounce trước khi gửi vào query hook.`,
      'Bọc từ khóa tìm kiếm: const debouncedSearch = useDebounce(filters.search, 300);',
      'missing useDebounce',
      PRIORITIES.MEDIUM,
      'missing-search-debounce',
      ['LIST.SEARCH.DEBOUNCE']
    );
  }

  // RULE-LIST-002: Unified updateFilter handler resetting page: 1
  if (hasFiltersObject) {
    const hasUpdateFilter = /const\s+updateFilter\s*=\s*useCallback/.test(content) || /function\s+updateFilter\b/.test(content);
    const hasAutoResetPage = /page:\s*(?:updates\??\.page\s*\?\?\s*1|1\b)/.test(content);
    if (!hasUpdateFilter || !hasAutoResetPage) {
      report(
        'RULE-LIST-002',
        filtersStateNode || sourceFile,
        `Trang danh sách "${fileName}" chưa sử dụng hàm updateFilter duy nhất có cơ chế tự động reset page: 1 khi đổi tiêu chí lọc.`,
        'Tạo hàm: const updateFilter = useCallback((updates) => setFilters(prev => ({ ...prev, ...updates, page: updates.page ?? 1 })), []);',
        'missing-unified-update-filter',
        PRIORITIES.MEDIUM,
        'missing-unified-update-filter',
        ['LIST.FILTER.UPDATE']
      );
    }
  }

  // RULE-LIST-005: Inline pagination={{ ... }} without useMemo in Table/DataTable
  const inlinePaginationRegex = /<(?:[A-Za-z0-9_]*Table|DataTable)\b[^>]*\bpagination\s*=\s*\{\s*\{/g;
  let ipMatch;
  while ((ipMatch = inlinePaginationRegex.exec(content)) !== null) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(ipMatch.index);
    context.addFinding({
      ruleCode: 'RULE-LIST-005',
      subcheck: 'inline-pagination-object',
      requirementIds: ['LIST.PAGINATION.MEMO'],
      priority: PRIORITIES.MEDIUM,
      confidence: 'proven',
      location: { path: filePath, line: line + 1, column: character + 1 },
      message: 'Cấu hình pagination={{ ... }} đang được khai báo inline trong JSX của Table. Reference object mới sinh ra ở mỗi render làm mất tối ưu hiệu năng.',
      suggestion: 'Gom cấu hình phân trang vào useMemo: const paginationConfig = useMemo(() => ({ ... }), [apiPagination, filters.page, filters.limit, updateFilter]);',
      evidence: ipMatch[0],
    });
  }

  // RULE-LIST-006: Tab metadata declared inside component instead of module scope
  const checkTabMetadataScope = (node) => {
    if (ts.isVariableStatement(node)) {
      let isInsideFunction = false;
      let p = node.parent;
      while (p) {
        if (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p)) {
          isInsideFunction = true;
          break;
        }
        p = p.parent;
      }

      if (isInsideFunction) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const varName = decl.name.text;
            if (/^(?:FILTER_TAB_CONFIG|tabs|filterTabs|statusTabs|tabItems)$/.test(varName) && decl.initializer && ts.isArrayLiteralExpression(decl.initializer)) {
              report(
                'RULE-LIST-006',
                decl,
                `Mảng cấu hình tabs "${varName}" đang được khai báo bên trong component. Bắt buộc tách metadata tĩnh ra ngoài module scope.`,
                'Di chuyển mảng cấu hình tĩnh ra ngoài component function. Chỉ dùng useMemo cho nhãn cần dịch i18n.',
                varName,
                PRIORITIES.MEDIUM,
                'tabs-metadata-inside-component',
                ['LIST.METADATA.DECLARATION']
              );
            }
          }
        }
      }
    }
    ts.forEachChild(node, checkTabMetadataScope);
  };
  checkTabMetadataScope(sourceFile);
}
