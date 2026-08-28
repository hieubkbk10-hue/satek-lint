/**
 * ============================================================================
 * UNIVERSAL FRONTEND REPORTER ENGINE
 * ============================================================================
 */

import { RULES, RULE_SEVERITY } from '../rules/catalog.js';

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
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
};

export function renderRuleCatalog(format = 'text') {
  if (format === 'json') {
    console.log(JSON.stringify({ totalRules: RULES.length, rules: RULES }, null, 2));
    return 0;
  }

  console.log(`\n${COLORS.bright}${COLORS.bgBlue} UNIVERSAL REACT & FRONTEND ARCHITECTURE RULE CATALOG ${COLORS.reset}`);
  console.log(`${COLORS.dim}Tổng cộng ${RULES.length} quy tắc tiêu chuẩn đang được kích hoạt và kiểm soát tự động:\n${COLORS.reset}`);

  RULES.forEach((rule) => {
    const sevColor =
      rule.severity === RULE_SEVERITY.CRITICAL
        ? COLORS.red
        : rule.severity === RULE_SEVERITY.MAJOR
        ? COLORS.yellow
        : COLORS.cyan;

    const presetTag = `${COLORS.dim}[Preset: ${rule.preset || 'universal'}]${COLORS.reset}`;

    console.log(`${COLORS.bright}[${rule.code}]${COLORS.reset} ${COLORS.white}${rule.name}${COLORS.reset} ${presetTag}`);
    console.log(`   Danh mục  : ${COLORS.cyan}${rule.category}${COLORS.reset}`);
    console.log(`   Mức độ    : ${sevColor}${rule.severity}${COLORS.reset}`);
    console.log(`   Mô tả     : ${COLORS.dim}${rule.description}${COLORS.reset}`);
    console.log(`   Cách Fix  : ${COLORS.green}${rule.fix}${COLORS.reset}\n`);
  });

  return 0;
}

export function renderScanResults(results, summary, projectInfo = {}, format = 'text', isVerbose = false) {
  if (format === 'json') {
    console.log(
      JSON.stringify(
        {
          projectInfo,
          summary,
          results,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
    return summary.totalViolations === 0 ? 0 : 1;
  }

  console.log(`\n========================================================================================`);
  console.log(`🛡️  SATEK FRONTEND ARCHITECTURE & DESIGN TOKEN LINT REPORT`);
  console.log(`========================================================================================`);
  if (projectInfo.projectRoot) {
    console.log(`📁 Thư mục dự án : ${COLORS.bright}${projectInfo.projectRoot}${COLORS.reset}`);
    console.log(`📦 Công nghệ     : ${projectInfo.hasReact ? 'React' : 'Generic'} | Tailwind: ${projectInfo.hasTailwind ? 'Có' : 'Không'} | Router: ${projectInfo.hasTanstackRouter ? 'TanStack' : 'Standard'}\n`);
  }

  if (results.length === 0) {
    console.log(`${COLORS.green}✔ Không tìm thấy tệp tin nào để quét.${COLORS.reset}\n`);
    return 0;
  }

  const filesWithIssues = results.filter((r) => r.violations.length > 0);
  const cleanFilesCount = results.length - filesWithIssues.length;

  if (filesWithIssues.length === 0) {
    console.log(`${COLORS.bright}${COLORS.green}✔ HOÀN HẢO! Toàn bộ ${results.length} tệp tin đều đạt 100% chuẩn SSOT & Kiến trúc Satek.${COLORS.reset}\n`);
  } else {
    let globalErrorIndex = 0;
    filesWithIssues.forEach((fileRes) => {
      fileRes.violations.forEach((v) => {
        globalErrorIndex++;
        const codeBadge = `${COLORS.red}[${v.ruleCode}]${COLORS.reset}`;
        console.log(
          `${COLORS.bright}#${globalErrorIndex}${COLORS.reset} ${codeBadge} ${COLORS.yellow}${fileRes.relativePath}:${v.line}${COLORS.reset} - ${COLORS.bright}${v.ruleName}${COLORS.reset}`
        );
        console.log(`   🔴 ${COLORS.dim}Bằng chứng :${COLORS.reset} ${COLORS.white}${v.codeSnippet}${COLORS.reset}`);
        console.log(`   💡 ${COLORS.dim}Cách sửa   :${COLORS.reset} ${COLORS.green}${v.fix}${COLORS.reset}\n`);
      });
    });

    if (cleanFilesCount > 0 && !isVerbose) {
      console.log(`${COLORS.dim}ℹ Đã ẩn ${cleanFilesCount} file hợp lệ không có lỗi (thêm --verbose nếu muốn xem tất cả).${COLORS.reset}\n`);
    }
  }

  // Thống kê phân loại lỗi
  const ruleCounts = {};
  const ruleNames = {};
  results.forEach((fileRes) => {
    fileRes.violations.forEach((v) => {
      ruleCounts[v.ruleCode] = (ruleCounts[v.ruleCode] || 0) + 1;
      ruleNames[v.ruleCode] = v.ruleName;
    });
  });

  const topViolations = Object.entries(ruleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  console.log(`========================================================================================`);
  console.log(`📊 TỔNG KẾT MỨC ĐỘ TUÂN THỦ (AUDIT SUMMARY):`);
  console.log(`========================================================================================`);
  console.log(`- Tệp tin đã quét        : ${summary.totalFiles} files (${COLORS.red}${summary.filesWithViolations} files có lỗi${COLORS.reset}, ${COLORS.green}${cleanFilesCount} files chuẩn${COLORS.reset})`);
  console.log(`- Vị trí dùng token đúng : ${COLORS.green}${summary.totalCompliant}${COLORS.reset} vị trí`);
  console.log(`- Tổng số lỗi cần sửa    : ${summary.totalViolations > 0 ? COLORS.red + COLORS.bright : COLORS.green}${summary.totalViolations}${COLORS.reset} vị trí`);
  console.log(`- TỈ LỆ TUÂN THỦ CHUẨN   : ${COLORS.bright}${summary.totalViolations === 0 ? COLORS.green : COLORS.yellow}${summary.complianceRate}%${COLORS.reset}`);

  if (topViolations.length > 0) {
    console.log(`\n🔥 Top quy tắc vi phạm nhiều nhất:`);
    topViolations.forEach(([code, count], i) => {
      console.log(`   ${i + 1}. [${code}] ${ruleNames[code]}: ${COLORS.red}${count} lỗi${COLORS.reset}`);
    });
  }
  console.log(`========================================================================================\n`);

  return summary.totalViolations === 0 ? 0 : 1;
}
