/**
 * ============================================================================
 * UNIVERSAL FRONTEND REPORTER ENGINE (OPTIMIZED FOR AI AGENTS & DEVELOPERS)
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

  console.log(`\n${COLORS.bright}${COLORS.bgBlue} UNIVERSAL REACT & FRONTEND ARCHITECTURE RULE CATALOG ${COLORS.reset}`);
  if (filter) {
    console.log(`${COLORS.dim}Tìm thấy ${targetRules.length} quy tắc khớp với từ khóa "${filter}":\n${COLORS.reset}`);
  } else {
    console.log(`${COLORS.dim}Tổng cộng ${RULES.length} quy tắc tiêu chuẩn đang được kích hoạt và kiểm soát tự động:\n${COLORS.reset}`);
  }

  targetRules.forEach((rule) => {
    const sevColor =
      rule.severity === RULE_SEVERITY.CRITICAL
        ? COLORS.red
        : rule.severity === RULE_SEVERITY.MAJOR
        ? COLORS.yellow
        : COLORS.cyan;

    const presetTag = `${COLORS.dim}[Preset: ${rule.preset || 'universal'}]${COLORS.reset}`;
    const scopeText = rule.scope || (Array.isArray(rule.appliesTo) ? rule.appliesTo.join(', ') : 'Toàn bộ dự án');

    console.log(`${COLORS.bright}[${rule.code}]${COLORS.reset} ${COLORS.white}${rule.name}${COLORS.reset} ${presetTag}`);
    console.log(`   Danh mục  : ${COLORS.cyan}${rule.category}${COLORS.reset}`);
    console.log(`   Phạm vi   : ${COLORS.magenta}${scopeText}${COLORS.reset}`);
    console.log(`   Mức độ    : ${sevColor}${rule.severity}${COLORS.reset}`);
    console.log(`   Mô tả     : ${COLORS.dim}${rule.description}${COLORS.reset}`);
    console.log(`   Cách Fix  : ${COLORS.green}${rule.fix}${COLORS.reset}\n`);
  });

  return 0;
}

export function renderScanResults(
  results,
  summary,
  projectInfo = {},
  format = 'text',
  isVerbose = false,
  emptyDirectories = [],
  deletedDirectories = []
) {
  if (format === 'json') {
    console.log(
      JSON.stringify(
        {
          projectInfo,
          summary,
          emptyDirectories,
          deletedDirectories,
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
    if (deletedDirectories && deletedDirectories.length > 0) {
      console.log(`🧹 ${COLORS.green}${COLORS.bright}ĐÃ TỰ ĐỘNG DỌN DẸP ${deletedDirectories.length} THƯ MỤC RỖNG / SAI KIẾN TRÚC:${COLORS.reset}`);
      deletedDirectories.forEach((d) => console.log(`   ✔ Đã xóa: ${COLORS.dim}${d}${COLORS.reset}`));
      console.log('');
    } else if (emptyDirectories && emptyDirectories.length > 0) {
      console.log(`📁 ${COLORS.yellow}${COLORS.bright}PHÁT HIỆN ${emptyDirectories.length} THƯ MỤC RỖNG / SKELETON CŨ TRONG DỰ ÁN:${COLORS.reset}`);
      emptyDirectories.forEach((d) => console.log(`   ℹ ${COLORS.dim}${d}${COLORS.reset}`));
      const cleanCmd = projectInfo.projectRoot && projectInfo.projectRoot !== process.cwd()
        ? `satek-lint --path="${projectInfo.projectRoot}" --clean-empty`
        : `satek-lint --clean-empty`;
      console.log(`\n   👉 ${COLORS.bright}${COLORS.white}COPY & PASTE LỆNH DƯỚI ĐÂY ĐỂ XÓA TỰ ĐỘNG:${COLORS.reset}`);
      console.log(`      ${COLORS.green}${COLORS.bright}${cleanCmd}${COLORS.reset}\n`);
    } else {
      console.log(`${COLORS.green}✔ Không tìm thấy tệp tin nào để quét.${COLORS.reset}\n`);
    }
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
        const codeBadge =
          v.severity === 'CRITICAL'
            ? `${COLORS.red}[${v.ruleCode}]${COLORS.reset}`
            : v.severity === 'MAJOR'
            ? `${COLORS.yellow}[${v.ruleCode}]${COLORS.reset}`
            : `${COLORS.cyan}[${v.ruleCode}]${COLORS.reset}`;

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
  const fileErrorCounts = [];

  results.forEach((fileRes) => {
    if (fileRes.violations.length > 0) {
      fileErrorCounts.push({
        path: fileRes.relativePath,
        count: fileRes.violations.length,
      });
    }
    fileRes.violations.forEach((v) => {
      ruleCounts[v.ruleCode] = (ruleCounts[v.ruleCode] || 0) + 1;
      ruleNames[v.ruleCode] = v.ruleName;
    });
  });

  const topViolations = Object.entries(ruleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topFiles = fileErrorCounts
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (deletedDirectories && deletedDirectories.length > 0) {
    console.log(`\n🧹 ${COLORS.green}${COLORS.bright}ĐÃ TỰ ĐỘNG DỌN DẸP ${deletedDirectories.length} THƯ MỤC RỖNG / SAI KIẾN TRÚC:${COLORS.reset}`);
    deletedDirectories.forEach((d) => console.log(`   ✔ Đã xóa: ${COLORS.dim}${d}${COLORS.reset}`));
    console.log('');
  } else if (emptyDirectories && emptyDirectories.length > 0) {
    console.log(`\n📁 ${COLORS.yellow}${COLORS.bright}PHÁT HIỆN ${emptyDirectories.length} THƯ MỤC RỖNG / SKELETON CŨ TRONG DỰ ÁN:${COLORS.reset}`);
    emptyDirectories.forEach((d) => console.log(`   ℹ ${COLORS.dim}${d}${COLORS.reset}`));
    const cleanCmd = projectInfo.projectRoot && projectInfo.projectRoot !== process.cwd()
      ? `satek-lint --path="${projectInfo.projectRoot}" --clean-empty`
      : `satek-lint --clean-empty`;
    console.log(`\n   👉 ${COLORS.bright}${COLORS.white}COPY & PASTE LỆNH DƯỚI ĐÂY ĐỂ XÓA TỰ ĐỘNG:${COLORS.reset}`);
    console.log(`      ${COLORS.green}${COLORS.bright}${cleanCmd}${COLORS.reset}\n`);
  }

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
      console.log(`   ${i + 1}. [${code}] ${ruleNames[code]}: ${COLORS.red}${count} lỗi${COLORS.reset}  👉  ${COLORS.dim}satek-lint --rule=${code}${COLORS.reset}`);
    });
  }

  if (topFiles.length > 0) {
    console.log(`\n🎯 Top 5 tệp tin cần ưu tiên xử lý:`);
    topFiles.forEach((f, i) => {
      console.log(`   ${i + 1}. ${COLORS.yellow}${f.path}${COLORS.reset} (${COLORS.red}${f.count} lỗi${COLORS.reset})  👉  ${COLORS.dim}satek-lint --path=${f.path}${COLORS.reset}`);
    });
  }

  console.log(`\n💡 LỆNH GỢI Ý ĐỂ AI AGENT / DEV QUÉT THEO NHÓM ĐỂ SỬA DẦN:`);
  console.log(`   • Quét riêng Tiếng Việt:   ${COLORS.cyan}satek-lint --group=i18n${COLORS.reset}   (hoặc: ${COLORS.cyan}satek-lint --i18n${COLORS.reset})`);
  console.log(`   • Quét riêng Bo góc:       ${COLORS.cyan}satek-lint --group=radius${COLORS.reset} (hoặc: ${COLORS.cyan}satek-lint --radius${COLORS.reset})`);
  console.log(`   • Quét riêng Kiến trúc/RTK: ${COLORS.cyan}satek-lint --group=arch${COLORS.reset}   (hoặc: ${COLORS.cyan}satek-lint --arch${COLORS.reset})`);
  console.log(`   • Quét riêng Mock Data:    ${COLORS.cyan}satek-lint --group=mock${COLORS.reset}   (hoặc: ${COLORS.cyan}satek-lint --mock${COLORS.reset})`);
  console.log(`   • Quét riêng Màu sắc SSOT:  ${COLORS.cyan}satek-lint --group=color${COLORS.reset}  (hoặc: ${COLORS.cyan}satek-lint --color${COLORS.reset})`);
  if (emptyDirectories && emptyDirectories.length > 0) {
    const cleanCmd = projectInfo.projectRoot && projectInfo.projectRoot !== process.cwd()
      ? `satek-lint --path="${projectInfo.projectRoot}" --clean-empty`
      : `satek-lint --clean-empty`;
    console.log(`   • Dọn ${emptyDirectories.length} thư mục rỗng:   ${COLORS.green}${COLORS.bright}${cleanCmd}${COLORS.reset}`);
  }
  console.log(`   • Quét riêng 1 rule bất kỳ: ${COLORS.cyan}satek-lint --rule=RULE-RTK-001${COLORS.reset}`);
  console.log(`   • Mở Dashboard tương tác:   ${COLORS.cyan}satek-lint --tui${COLORS.reset}`);
  console.log(`========================================================================================\n`);

  return summary.totalViolations === 0 ? 0 : 1;
}
