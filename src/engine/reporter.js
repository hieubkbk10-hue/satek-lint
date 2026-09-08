/**
 * ============================================================================
 * UNIVERSAL FRONTEND REPORTER ENGINE (V3 ADVISORY FORMAT)
 * ============================================================================
 */

import { RULES, RULE_PRIORITY } from '../rules/catalog.js';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
};

export function renderRuleCatalog(format = 'text', filter = null) {
  let targetRules = RULES;
  if (filter) {
    const cleanFilter = filter.replace(/^--?/, '').trim().toLowerCase();
    targetRules = RULES.filter(
      (r) =>
        r.code.toLowerCase() === cleanFilter ||
        r.code.toLowerCase().includes(cleanFilter) ||
        r.name.toLowerCase().includes(cleanFilter) ||
        (r.category && r.category.toLowerCase().includes(cleanFilter))
    );
  }

  if (format === 'json') {
    console.log(JSON.stringify({ totalRules: targetRules.length, rules: targetRules }, null, 2));
    return targetRules.length > 0 ? 0 : 1;
  }

  if (targetRules.length === 0) {
    console.log(`\n${COLORS.red}✖ Không tìm thấy quy tắc nào khớp với từ khóa: "${filter}"${COLORS.reset}`);
    console.log(`${COLORS.dim}💡 Gợi ý: Dùng satek-lint --rules để xem toàn bộ danh mục quy tắc.${COLORS.reset}\n`);
    return 1;
  }

  console.log(`\n${COLORS.bright}${COLORS.bgBlue} UNIVERSAL REACT & FRONTEND ARCHITECTURE RULE CATALOG (V3) ${COLORS.reset}`);
  if (filter) {
    console.log(`${COLORS.dim}Tìm thấy ${targetRules.length} quy tắc khớp với từ khóa "${filter}":\n${COLORS.reset}`);
  } else {
    console.log(`${COLORS.dim}Tổng cộng ${RULES.length} quy tắc tiêu chuẩn đang được kích hoạt và kiểm soát tự động:\n${COLORS.reset}`);
  }

  targetRules.forEach((rule) => {
    const sevColor =
      rule.severity === RULE_PRIORITY.HIGH || rule.severity === 'CRITICAL'
        ? COLORS.red
        : rule.severity === RULE_PRIORITY.MEDIUM || rule.severity === 'MAJOR'
        ? COLORS.yellow
        : rule.severity === 'RECOMMEND'
        ? COLORS.bright + COLORS.cyan
        : COLORS.cyan;

    const scopeText = rule.scope || (Array.isArray(rule.appliesTo) ? rule.appliesTo.join(', ') : 'Toàn bộ dự án');

    console.log(`${COLORS.bright}[${rule.code}]${COLORS.reset} ${COLORS.white}${rule.name}${COLORS.reset}`);
    console.log(`   Danh mục  : ${COLORS.cyan}${rule.category}${COLORS.reset}`);
    console.log(`   Phạm vi   : ${COLORS.magenta}${scopeText}${COLORS.reset}`);
    console.log(`   Độ ưu tiên: ${sevColor}${rule.severity || rule.priority || 'MEDIUM'}${COLORS.reset}`);
    console.log(`   Mô tả     : ${COLORS.dim}${rule.description}${COLORS.reset}`);
    console.log(`   Cách Fix  : ${COLORS.green}${rule.fix}${COLORS.reset}\n`);
  });

  return 0;
}

export function renderScanResults({
  results = [],
  summary = {},
  projectInfo = {},
  format = 'text',
  isVerbose = false,
  findings = [],
  coverage = [],
  manualChecks = [],
  diagnostics = [],
  timings = {},
}) {
  if (format === 'json') {
    const hasFatalParseError = diagnostics && diagnostics.some((d) => d.type === 'parse-error');
    console.log(
      JSON.stringify(
        {
          schemaVersion: 3,
          status: hasFatalParseError ? 'partial' : 'complete',
          project: projectInfo,
          summary,
          findings,
          coverage,
          manualChecks,
          diagnostics,
          timings,
          results,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
    return 0;
  }

  // 1. In chi tiết các tệp tin và vi phạm trước
  results.forEach((fileRes) => {
    if (fileRes.violations.length === 0 && !isVerbose) return;

    if (fileRes.violations.length === 0) {
      console.log(`${COLORS.green}✔ ${fileRes.relativePath}${COLORS.reset} ${COLORS.dim}(Chuẩn kiến trúc)${COLORS.reset}`);
      return;
    }

    console.log(`${COLORS.bright}${COLORS.yellow}⚠ ${fileRes.relativePath}${COLORS.reset} ${COLORS.dim}(${fileRes.violations.length} cảnh báo)${COLORS.reset}`);
    fileRes.violations.forEach((v) => {
      const priColor =
        v.priority === 'HIGH'
          ? COLORS.red
          : v.priority === 'MEDIUM'
          ? COLORS.yellow
          : v.priority === 'RECOMMEND'
          ? COLORS.bright + COLORS.cyan
          : v.priority === 'LOW'
          ? COLORS.cyan
          : COLORS.dim;
      console.log(`   Line ${v.line}:${v.column || 1} [${priColor}${v.priority || 'MEDIUM'}${COLORS.reset}] [${COLORS.bright}${v.ruleCode}${COLORS.reset}]: ${v.codeSnippet}`);
      if (v.fix) {
        console.log(`     👉 ${COLORS.green}${v.fix}${COLORS.reset}`);
      }
    });
    console.log('');
  });

  // 2. In BẢNG TỔNG KẾT KIỂM TOÁN Ở DƯỚI CÙNG (thuận tiện cho dev xem ngay tại terminal prompt)
  const cleanFilesCount = summary.cleanFiles ?? Math.max(0, summary.totalFiles - summary.filesWithViolations);

  console.log(`========================================================================================`);
  console.log(`🛡️  SATEK LINTER V3 — AST ADVISORY AUDIT REPORT`);
  console.log(`========================================================================================`);
  console.log(`- Tệp tin đã quét        : ${summary.totalFiles} files (${COLORS.red}${summary.filesWithViolations} files có cảnh báo${COLORS.reset}, ${COLORS.green}${cleanFilesCount} files chuẩn${COLORS.reset})`);
  console.log(`- Tổng số vị trí cảnh báo: ${summary.totalViolations > 0 ? COLORS.yellow + COLORS.bright : COLORS.green}${summary.totalViolations}${COLORS.reset}`);
  if (summary.byPriority) {
    console.log(`  • HIGH      : ${COLORS.red}${summary.byPriority.HIGH || 0}${COLORS.reset}`);
    console.log(`  • MEDIUM    : ${COLORS.yellow}${summary.byPriority.MEDIUM || 0}${COLORS.reset}`);
    console.log(`  • RECOMMEND : ${COLORS.bright}${COLORS.cyan}${summary.byPriority.RECOMMEND || 0}${COLORS.reset}`);
    console.log(`  • LOW       : ${COLORS.cyan}${summary.byPriority.LOW || 0}${COLORS.reset}`);
    console.log(`  • INFO      : ${COLORS.dim}${summary.byPriority.INFO || 0}${COLORS.reset}`);
  }
  console.log(`- TỈ LỆ TUÂN THỦ CHUẨN   : ${COLORS.bright}${summary.totalViolations === 0 ? COLORS.green : COLORS.yellow}${summary.complianceRate}%${COLORS.reset}`);
  if (timings && timings.totalMs) {
    console.log(`- Thời gian thực thi     : ${timings.totalMs}ms (Parse: ${timings.astMs || 0}ms, Graph: ${timings.graphMs || 0}ms, Rules: ${(timings.queryMs || 0) + (timings.listMs || 0)}ms)`);
  }
  console.log(`========================================================================================\n`);

  return 0; // Luôn trả 0 vì finding chỉ là advisory
}
