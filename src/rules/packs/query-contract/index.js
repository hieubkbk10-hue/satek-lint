import path from 'path';
import ts from 'typescript';
import { PRIORITIES } from '../../../engine/findings.js';

const VALID_SEARCH_OPS = new Set(['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'notin', 'between']);

export function runQueryContractPack(context, filePath) {
  const normPath = path.normalize(filePath).replace(/\\/g, '/');
  const sourceFile = context.parser.getSourceFile(filePath);
  const content = context.parser.getContent(filePath);
  if (!sourceFile || !content) return;

  const fileName = path.basename(filePath);
  const isStoreApi = normPath.includes('/src/store/api/') || normPath.includes('/store/api/');
  const isAuthApi = fileName.includes('auth') || fileName.includes('Auth');

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

  // --- RULE-API-001: Direct raw fetch / axios outside baseApi ---
  if (!normPath.includes('/baseApi') && !normPath.includes('/node_modules/')) {
    context.recordRequirement('API.BASE.INJECT');
    if (/\b(?:axios\.(?:get|post|put|delete|patch)|window\.fetch|fetch\()\b/.test(content)) {
      report(
        'RULE-API-001',
        sourceFile,
        'Cấm gọi trực tiếp axios hoặc fetch bên ngoài baseApi. Toàn bộ API phải sử dụng RTK Query slice injectEndpoints.',
        'Sử dụng baseApi.injectEndpoints để định nghĩa endpoint và dùng hooks sinh tự động.',
        'axios/fetch',
        PRIORITIES.HIGH,
        'direct-fetch-axios',
        ['API.BASE.INJECT']
      );
    }
  }

  // --- RTK Query Slice Checks (in store/api) ---
  if (isStoreApi && !normPath.includes('baseApi')) {
    context.recordRequirement('API.RTK.TAG_INTEGRITY');

    // Parse endpoints from AST
    const visit = (node) => {
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
        const endpointName = node.name.text;

        if (ts.isCallExpression(node.initializer) && ts.isPropertyAccessExpression(node.initializer.expression)) {
          const builderCall = node.initializer.expression.name.text; // 'query' or 'mutation'

          if (builderCall === 'mutation' && node.initializer.arguments.length > 0) {
            const configObj = node.initializer.arguments[0];
            if (ts.isObjectLiteralExpression(configObj)) {
              const hasInvalidates = configObj.properties.some(
                (p) => p.name && p.name.getText(sourceFile) === 'invalidatesTags'
              );
              const hasOnQueryStarted = configObj.properties.some(
                (p) => p.name && p.name.getText(sourceFile) === 'onQueryStarted'
              );
              const nodeText = configObj.getText(sourceFile);

              if (!hasInvalidates && !hasOnQueryStarted && !nodeText.includes('-- LOGIC:') && !isAuthApi) {
                // Ignore upload, check, test endpoints
                if (!/^(?:upload|check|test|validate|verify|sync)/i.test(endpointName)) {
                  report(
                    'RULE-RTK-001',
                    node,
                    `Mutation "${endpointName}" thay đổi tài nguyên nhưng thiếu cấu hình invalidatesTags để làm mới cache.`,
                    'Thêm invalidatesTags: [{ type: "Entity", id: "LIST" }] vào endpoint mutation.',
                    `${endpointName}: builder.mutation`,
                    PRIORITIES.HIGH,
                    'missing-invalidates-tags',
                    ['API.RTK.TAG_INTEGRITY']
                  );
                }
              }
            }
          }

          if (builderCall === 'query' && node.initializer.arguments.length > 0) {
            const configObj = node.initializer.arguments[0];
            if (ts.isObjectLiteralExpression(configObj)) {
              const hasProvides = configObj.properties.some(
                (p) => p.name && p.name.getText(sourceFile) === 'providesTags'
              );
              if (!hasProvides && !isAuthApi && !/^(?:check|verify|lookup|health)/i.test(endpointName)) {
                report(
                  'RULE-RTK-002',
                  node,
                  `Query endpoint "${endpointName}" thiếu cấu hình providesTags để liên kết cache với các mutations.`,
                  'Thêm providesTags: [{ type: "Entity", id: "LIST" }] vào endpoint query.',
                  `${endpointName}: builder.query`,
                  PRIORITIES.MEDIUM,
                  'missing-provides-tags',
                  ['API.RTK.TAG_INTEGRITY']
                );
              }

              // Endpoint query callback checks
              const queryProp = configObj.properties.find(
                (p) => p.name && p.name.getText(sourceFile) === 'query'
              );
              if (queryProp && ts.isPropertyAssignment(queryProp)) {
                const queryText = queryProp.initializer.getText(sourceFile);

                // RULE-QUERY-001: Check raw ...params pass-through
                if (/\bparams\s*:\s*(?:params|\.\.\.params)\b/.test(queryText) && !queryText.includes('page:') && !queryText.includes('filter')) {
                  context.recordRequirement('API.QUERY.ISOLATE');
                  report(
                    'RULE-QUERY-001',
                    queryProp,
                    `Endpoint "${endpointName}" truyền trực tiếp raw params vào request. Cần cô lập và làm sạch các trường status/search/UI-only.`,
                    'Map params tường minh: params: { page: params.page, limit: params.limit, ... }',
                    queryText.slice(0, 60),
                    PRIORITIES.HIGH,
                    'raw-params-pass-through',
                    ['API.QUERY.ISOLATE']
                  );
                }

                // RULE-QUERY-004: Prohibit sending status: 'all' to backend
                const receivesParamStatus = /\bparams(?:\?\.|\.)status\b/.test(queryText) || /(?:const|let|var)\s*\{[^}]*\bstatus\b[^}]*\}\s*=\s*params/.test(queryText) || /\(\s*\{[^}]*\bstatus\b[^}]*\}\s*\)/.test(queryText);
                const hasStatusAllFilter = /status\s*!==\s*['"]all['"]/.test(queryText) || /status\s*&&\s*status\s*!==/.test(queryText) || /status\s*===\s*['"]all['"]\s*\?\s*(?:undefined|null)/.test(queryText);

                if (receivesParamStatus && !hasStatusAllFilter) {
                  context.recordRequirement('API.QUERY.STATUS_ALL');
                  report(
                    'RULE-QUERY-004',
                    queryProp,
                    `Endpoint "${endpointName}" truyền tham số status từ params mà chưa loại trừ giá trị 'all'. Backend sẽ lọc bản ghi có status="all" và trả về mảng rỗng.`,
                    'Thêm điều kiện loại trừ: if (status && status !== "all") { queryParams.status = status; }',
                    queryText.slice(0, 60),
                    PRIORITIES.HIGH,
                    'status-all-not-filtered',
                    ['API.QUERY.STATUS_ALL']
                  );
                }

                // RULE-QUERY-002: Record<string, any> or unconstrained any query params
                if (queryText.includes('Record<string, any>') || queryText.includes(': any')) {
                  context.recordRequirement('API.QUERY.SERIALIZABLE');
                  report(
                    'RULE-QUERY-002',
                    queryProp,
                    `Endpoint "${endpointName}" sử dụng kiểu tham số không ràng buộc (Record<string, any> hoặc any).`,
                    'Định nghĩa interface/type DTO rõ ràng cho tham số query (kế thừa RequestCriteria).',
                    'Record<string, any>',
                    PRIORITIES.MEDIUM,
                    'untyped-query-params',
                    ['API.QUERY.SERIALIZABLE']
                  );
                }

                // RULE-QUERY-003: Pagination default values fallback (list endpoints only)
                const isDetailOrLookup = /(?:Detail|ById|Info|Summary|Stats)$/i.test(endpointName);
                if (!isDetailOrLookup && /^(?:get|fetch|list)[A-Z]/.test(endpointName) && (queryText.includes('page') || queryText.includes('limit') || /List/i.test(endpointName))) {
                  const hasPageDefault = /page:\s*params\??\.page\s*(?:\?\?|\|\|)\s*1/.test(queryText) || /page:\s*1\b/.test(queryText);
                  const hasLimitDefault = /limit:\s*params\??\.limit\s*(?:\?\?|\|\|)\s*(?:DEFAULT_LIMIT|\d+|LIMIT)/.test(queryText) || /DEFAULT_LIMIT/.test(queryText);
                  if (!hasPageDefault || !hasLimitDefault) {
                    context.recordRequirement('API.QUERY.PAGINATION');
                    report(
                      'RULE-QUERY-003',
                      queryProp,
                      `Endpoint danh sách "${endpointName}" thiếu giá trị phân trang mặc định (page ?? 1, limit ?? DEFAULT_LIMIT).`,
                      'Gán mặc định: page: params?.page ?? 1, limit: params?.limit ?? DEFAULT_LIMIT.',
                      queryText.slice(0, 60),
                      PRIORITIES.MEDIUM,
                      'missing-pagination-defaults',
                      ['API.QUERY.PAGINATION']
                    );
                  }
                }

                // RULE-QUERY-005: search without .trim()
                if (!isDetailOrLookup && queryText.includes('search') && !queryText.includes('.trim()') && !queryText.includes('searchFields')) {
                  context.recordRequirement('API.SEARCH.TRIM');
                  report(
                    'RULE-QUERY-005',
                    queryProp,
                    `Endpoint "${endpointName}" truyền tham số search nhưng chưa gọi .trim() để loại bỏ khoảng trắng thừa.`,
                    'Bọc tìm kiếm: const trimmed = search?.trim(); if (trimmed) queryParams.search = trimmed;',
                    'search without .trim()',
                    PRIORITIES.LOW,
                    'untrimmed-search-param',
                    ['API.SEARCH.TRIM']
                  );
                }
              }
            }
          }
        }

        // RULE-RTK-003: String(id) in cache tag & RULE-RTK-TAG-NAMING
        if (node.name.text === 'providesTags' || node.name.text === 'invalidatesTags') {
          const text = node.initializer.getText(sourceFile);

          // RULE-RTK-003: String(id) only checked inside providesTags/invalidatesTags
          if (/\bid\s*:\s*String\(/.test(text) || /String\(\s*[^)]*id\b/.test(text)) {
            report(
              'RULE-RTK-003',
              node,
              'Không ép kiểu tag ID bằng String(id). Giữ nguyên ID tự nhiên (string hoặc number) từ backend.',
              'Dùng trực tiếp { type: "Entity", id: arg.id } hoặc id: result?.id.',
              text.slice(0, 60),
              PRIORITIES.HIGH,
              'string-id-tag',
              ['API.RTK.TAG_INTEGRITY']
            );
          }

          const tagMatches = text.match(/type:\s*['"]([^'"]+)['"]/g);
          if (tagMatches) {
            for (const tm of tagMatches) {
              const tag = tm.split(/['"]/)[1];
              if (tag && !/^[A-Z][a-zA-Z0-9]*$/.test(tag)) {
                report(
                  'RULE-RTK-TAG-NAMING',
                  node,
                  `Tên tag "${tag}" không tuân thủ chuẩn PascalCase trong RTK Query cache tags.`,
                  'Đổi tên tag thành PascalCase (ví dụ: Domain, Order, Product).',
                  tag,
                  PRIORITIES.MEDIUM,
                  'tag-naming-pascal'
                );
              }
            }
          }
        }

        // RULE-RESPONSE-001: transformResponse
        if (node.name.text === 'transformResponse') {
          context.recordRequirement('API.RESPONSE.TRANSFORM');
          const bodyText = node.initializer.getText(sourceFile);
          if (/response\s*=>\s*response\?\.data/i.test(bodyText) || /res\s*=>\s*res\?\.data/i.test(bodyText)) {
            report(
              'RULE-RESPONSE-001',
              node,
              'Khuyến nghị bỏ transformResponse unwrap 1-1 đơn giản (chỉ lấy response?.data). Hãy để hook giữ envelope chuẩn.',
              'Xóa transformResponse unwrap đơn thuần nếu không có chuyển đổi cấu trúc phức tạp.',
              bodyText.slice(0, 80),
              PRIORITIES.LOW,
              'trivial-transform-response',
              ['API.RESPONSE.TRANSFORM']
            );
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  // --- Component / Hook Checks (API & Query Usage) ---
  // RULE-MEMO-001: useMemo(() => data?.data ?? [], [data])
  context.recordRequirement('API.MEMO.READONLY');
  const memoPropertyRegex = /useMemo\s*\(\s*\(\s*\)\s*=>\s*(?:\w+Data|data|response)\?\.(?:data|meta\?\.pagination)(?:\s*\?\?\s*(?:\[\]|\{\}))?\s*,\s*\[[^\]]*\]\s*\)/g;
  let memoMatch;
  while ((memoMatch = memoPropertyRegex.exec(content)) !== null) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(memoMatch.index);
    context.addFinding({
      ruleCode: 'RULE-MEMO-001',
      subcheck: 'useless-property-memo',
      requirementIds: ['API.MEMO.READONLY'],
      priority: PRIORITIES.LOW,
      confidence: 'proven',
      location: { path: filePath, line: line + 1, column: character + 1 },
      message: 'Cấm sử dụng useMemo chỉ để đọc thuộc tính thuần túy từ query data (property read). Phép tính rẻ không cần memoization.',
      suggestion: 'Gán biến trực tiếp: const items = data?.data ?? [];',
      evidence: memoMatch[0],
    });
  }

  // RULE-QUERY-006: searchFields 10 operators check
  context.recordRequirement('QUERY.GRAMMAR.OPERATORS');
  const searchFieldsRegex = /searchFields\s*[:=]\s*['"`]([^'"`]+)['"`]/g;
  let sfMatch;
  while ((sfMatch = searchFieldsRegex.exec(content)) !== null) {
    const rawFields = sfMatch[1];
    const pairs = rawFields.split(';');
    for (const pair of pairs) {
      if (!pair.trim()) continue;
      const parts = pair.split(':');
      if (parts.length >= 2) {
        const op = parts[1].trim().toLowerCase();
        if (!VALID_SEARCH_OPS.has(op)) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(sfMatch.index);
          context.addFinding({
            ruleCode: 'RULE-QUERY-006',
            subcheck: 'invalid-searchfields-operator',
            requirementIds: ['QUERY.GRAMMAR.OPERATORS'],
            priority: PRIORITIES.HIGH,
            confidence: 'proven',
            location: { path: filePath, line: line + 1, column: character + 1 },
            message: `Toán tử tìm kiếm "${op}" trong searchFields không hợp lệ. Chỉ chấp nhận 10 toán tử chuẩn: =, !=, >, >=, <, <=, like, in, notin, between.`,
            suggestion: 'Thay toán tử bằng một trong 10 toán tử chuẩn của hệ thống (=, !=, >, >=, <, <=, like, in, notin, between).',
            evidence: pair,
          });
        }
      }
    }
  }

  // --- RULE-QUERY-007: Date/Null/Relation query syntax standards ---
  const searchDateRegex = /searchDate\s*[:=]\s*['"`]([^'"`]+)['"`]/g;
  let sdMatch;
  while ((sdMatch = searchDateRegex.exec(content)) !== null) {
    const val = sdMatch[1];
    const normalizedVal = val.replace(/\$\{[^}]+\}/g, '2026-01-01');
    if (!/^(?:\d{4}-\d{2}-\d{2}|,\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2})(?:\|[a-zA-Z0-9_]+)?$/.test(normalizedVal)) {
      context.recordRequirement('QUERY.GRAMMAR.DATE_NULL_RELATION');
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(sdMatch.index);
      context.addFinding({
        ruleCode: 'RULE-QUERY-007',
        subcheck: 'invalid-search-date-syntax',
        requirementIds: ['QUERY.GRAMMAR.DATE_NULL_RELATION'],
        priority: PRIORITIES.MEDIUM,
        confidence: 'proven',
        location: { path: filePath, line: line + 1, column: character + 1 },
        message: `Cú pháp searchDate "${val}" không hợp lệ. Chuẩn: YYYY-MM-DD, hoặc start,end, hoặc start,end|field.`,
        suggestion: 'Sửa lại định dạng ngày theo chuẩn query_guides.md §2.6.',
        evidence: sdMatch[0],
      });
    }
  }

  const searchNullRegex = /searchNull\s*[:=]\s*['"`]([^'"`]+)['"`]/g;
  let snMatch;
  while ((snMatch = searchNullRegex.exec(content)) !== null) {
    const val = snMatch[1];
    const parts = val.split(';');
    for (const p of parts) {
      if (!p.trim()) continue;
      if (!/^[a-zA-Z0-9_]+(?::not)?$/.test(p.trim())) {
        context.recordRequirement('QUERY.GRAMMAR.DATE_NULL_RELATION');
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(snMatch.index);
        context.addFinding({
          ruleCode: 'RULE-QUERY-007',
          subcheck: 'invalid-search-null-syntax',
          requirementIds: ['QUERY.GRAMMAR.DATE_NULL_RELATION'],
          priority: PRIORITIES.MEDIUM,
          confidence: 'proven',
          location: { path: filePath, line: line + 1, column: character + 1 },
          message: `Cú pháp searchNull "${p.trim()}" không hợp lệ. Chuẩn: field hoặc field:not.`,
          suggestion: 'Sửa lại cú pháp theo chuẩn query_guides.md §2.7: searchNull=field hoặc searchNull=field:not.',
          evidence: snMatch[0],
        });
      }
    }
  }

  const searchHasRegex = /searchHas\s*[:=]\s*['"`]([^'"`]+)['"`]/g;
  let shMatch;
  while ((shMatch = searchHasRegex.exec(content)) !== null) {
    const val = shMatch[1];
    const parts = val.split(';');
    for (const p of parts) {
      if (!p.trim()) continue;
      if (!/^[a-zA-Z0-9_]+(?::not)?$/.test(p.trim())) {
        context.recordRequirement('QUERY.GRAMMAR.DATE_NULL_RELATION');
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(shMatch.index);
        context.addFinding({
          ruleCode: 'RULE-QUERY-007',
          subcheck: 'invalid-search-has-syntax',
          requirementIds: ['QUERY.GRAMMAR.DATE_NULL_RELATION'],
          priority: PRIORITIES.MEDIUM,
          confidence: 'proven',
          location: { path: filePath, line: line + 1, column: character + 1 },
          message: `Cú pháp searchHas "${p.trim()}" không hợp lệ. Chuẩn: relation hoặc relation:not.`,
          suggestion: 'Sửa lại cú pháp theo chuẩn query_guides.md §2.8: searchHas=relation hoặc searchHas=relation:not.',
          evidence: shMatch[0],
        });
      }
    }
  }

  // --- RULE-QUERY-008: Delimiter standard (include uses comma, filter uses semicolon) ---
  const isQueryContext = isStoreApi || content.includes('params') || content.includes('searchParams') || content.includes('buildQueryParams') || content.includes('endpoint');
  if (isQueryContext) {
    const includeDelimiterRegex = /\binclude\s*[:=]\s*['"`]([^'"`]+)['"`]/g;
    let incMatch;
    while ((incMatch = includeDelimiterRegex.exec(content)) !== null) {
      const val = incMatch[1];
      if (val.includes(';') && !val.includes('(')) {
        context.recordRequirement('QUERY.GRAMMAR.DELIMITERS');
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(incMatch.index);
        context.addFinding({
          ruleCode: 'RULE-QUERY-008',
          subcheck: 'invalid-include-delimiter',
          requirementIds: ['QUERY.GRAMMAR.DELIMITERS'],
          priority: PRIORITIES.MEDIUM,
          confidence: 'proven',
          location: { path: filePath, line: line + 1, column: character + 1 },
          message: `Tham số include ("${val}") dùng dấu chấm phẩy (;). Chuẩn quy định dùng dấu phẩy (,).`,
          suggestion: 'Đổi dấu chấm phẩy thành dấu phẩy (vd: include="relation1,relation2").',
          evidence: incMatch[0],
        });
      }
    }

    const filterDelimiterRegex = /\bfilter\s*[:=]\s*['"`]([^'"`]+)['"`]/g;
    let fltMatch;
    while ((fltMatch = filterDelimiterRegex.exec(content)) !== null) {
      const val = fltMatch[1];
      // Skip CSS filters (blur, drop-shadow, brightness, url, etc.)
      if (val.includes('(') || val.includes(')') || /blur|drop-shadow|grayscale|invert|opacity|sepia/i.test(val)) {
        continue;
      }
      if (val.includes(',') && !val.includes(';')) {
        context.recordRequirement('QUERY.GRAMMAR.DELIMITERS');
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(fltMatch.index);
        context.addFinding({
          ruleCode: 'RULE-QUERY-008',
          subcheck: 'invalid-filter-delimiter',
          requirementIds: ['QUERY.GRAMMAR.DELIMITERS'],
          priority: PRIORITIES.MEDIUM,
          confidence: 'proven',
          location: { path: filePath, line: line + 1, column: character + 1 },
          message: `Tham số filter ("${val}") dùng dấu phẩy (,). Chuẩn sparse fieldsets quy định dùng dấu chấm phẩy (;).`,
          suggestion: 'Đổi dấu phẩy thành dấu chấm phẩy (vd: filter="id;name;email").',
          evidence: fltMatch[0],
        });
      }
    }
  }

  // --- RULE-QUERY-009: Multi-condition search missing searchJoin=and ---
  const multiSearchRegex = /search\s*[:=]\s*['"`]([^'"`]*;[^'"`]*)['"`]/g;
  let msMatch;
  while ((msMatch = multiSearchRegex.exec(content)) !== null) {
    if (!content.includes('searchJoin')) {
      context.recordRequirement('QUERY.GRAMMAR.ADVANCED');
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(msMatch.index);
      context.addFinding({
        ruleCode: 'RULE-QUERY-009',
        subcheck: 'missing-search-join-and',
        requirementIds: ['QUERY.GRAMMAR.ADVANCED'],
        priority: PRIORITIES.INFO,
        confidence: 'proven',
        location: { path: filePath, line: line + 1, column: character + 1 },
        message: `Tham số search có nhiều điều kiện ("${msMatch[1]}"). Backend mặc định dùng OR; nếu muốn AND cần bổ sung searchJoin="and".`,
        suggestion: 'Thêm searchJoin: "and" nếu muốn kết quả tìm kiếm thỏa mãn đồng thời tất cả các điều kiện.',
        evidence: msMatch[0],
      });
    }
  }
}
