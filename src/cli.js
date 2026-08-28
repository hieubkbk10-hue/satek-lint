/**
 * ============================================================================
 * UNIVERSAL FRONTEND LINTER CLI CONTROLLER
 * ============================================================================
 */

import fs from 'fs';
import { renderRuleCatalog, renderScanResults } from './engine/reporter.js';
import { runLintEngine } from './engine/linter.js';
import { startInteractiveDashboard } from './engine/tui.js';

export async function runCli(args = process.argv.slice(2)) {
  const formatArg = args.find((a) => a.startsWith('--format='));
  const format = formatArg ? formatArg.split('=')[1] : 'text';

  // 1. Kiểm tra lệnh IN DANH MỤC RULES (--rules, -l, --list-rules)
  const isCatalogInspection =
    args.includes('--list-rules') ||
    args.includes('-l') ||
    args.includes('--rules') ||
    args.includes('rules') ||
    args.includes('list-rules') ||
    args.some((a) => a.startsWith('--rules=') || a.startsWith('--list-rules='));

  if (isCatalogInspection) {
    let catalogFilter = null;
    const rulesArg = args.find((a) => a.startsWith('--rules=') || a.startsWith('--list-rules='));
    if (rulesArg) {
      catalogFilter = rulesArg.split('=')[1];
    } else {
      const idx = args.findIndex((a) => a === '--rules' || a === '-l' || a === '--list-rules' || a === 'rules');
      if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('-')) {
        catalogFilter = args[idx + 1];
      }
    }
    const exitCode = renderRuleCatalog(format, catalogFilter);
    process.exit(exitCode);
  }

  // 2. Help banner (Hướng dẫn toàn diện cho Developer & AI Agents)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🛡️  SATEK FRONTEND ARCHITECTURE & DESIGN TOKEN LINTER (34+ RULES)

Sử dụng:
  satek-lint [options] [path]
  fe-lint [options] [path]

🎯 Quét theo Quy tắc (Rule) & Nhóm Quy tắc (Group):
  --rule=<MÃ_RULE>         Chỉ quét 1 quy tắc cụ thể (vd: --rule=RULE-RADIUS-001 hoặc --rule=RULE-RTK-001)
  --group=<NHÓM>           Chỉ quét 1 nhóm quy tắc (vd: --group=i18n, --group=radius, --group=arch)
  --i18n                   Phím tắt quét riêng lỗi hardcoded Tiếng Việt (RULE-I18N-001)
  --radius                 Phím tắt quét riêng lỗi bo góc arbitrary/legacy (RULE-RADIUS-001)
  --mock, --mocks          Phím tắt quét riêng lỗi mock data & fallback số liệu giả
  --color, --colors        Phím tắt quét riêng lỗi mã màu arbitrary hex [#...] & inline hex
  --arch, --architecture   Phím tắt quét riêng lỗi kiến trúc RTK Query, Route, Barrel, Folder
  --rtk                    Phím tắt quét riêng lỗi RTK Query mutation thiếu tags
  --router                 Phím tắt quét riêng lỗi Thin Route & Dynamic Param
  --types                  Phím tắt quét riêng lỗi TypeScript strict typing & naming

📁 Phạm vi quét (Scope & Path):
  --path=<folder|file>     Quét một thư mục hoặc tệp tin cụ thể (vd: --path=src/components/cart)
  -p <folder|file>         Dạng viết tắt của --path (vd: satek-lint -p components/cart)

⚙️ Cấu hình & Định dạng xuất (CI / CD / AI Agents):
  --preset=<name>          Chọn bộ rule: all | ci | strict | migration | architecture | tokens | router | universal
  --ci, --strict           Chế độ chặn CI: Chỉ quét các lỗi kiến trúc bắt buộc (CRITICAL & MAJOR)
  --format=text|json       Định dạng xuất kết quả (text cho terminal, json cho AI Agent/CI automation)
  --report=<file.json>     Xuất báo cáo kết quả quét ra file JSON
  --verbose, -v, --all     Hiển thị chi tiết tất cả các file (kể cả file đạt chuẩn không có lỗi)

🎮 Giao diện tương tác:
  --tui, -i                Mở Dashboard tương tác Master-Detail chia đôi màn hình
  --rules, -l [từ_khóa]    In danh mục toàn bộ quy tắc ra màn hình (hoặc tra cứu theo mã)
  --help, -h               Hiển thị hướng dẫn này
`);
    process.exit(0);
  }

  // 3. Parse Rule Filter (--rule=<CODE>, --rule <CODE>, RULE-..., --RULE-...)
  let targetRule = null;
  const ruleArg = args.find((a) => a.startsWith('--rule=') || a.startsWith('-r='));
  if (ruleArg) {
    targetRule = ruleArg.split('=')[1];
  } else {
    const rIdx = args.findIndex((a) => a === '--rule' || a === '-r');
    if (rIdx !== -1 && args[rIdx + 1] && !args[rIdx + 1].startsWith('-')) {
      targetRule = args[rIdx + 1];
    } else {
      const directRule = args.find((a) => /^(?:--?)?RULE-[A-Z]+-\d+/i.test(a));
      if (directRule) {
        targetRule = directRule.replace(/^--?/, '');
      }
    }
  }

  // 4. Parse Group Filter (--group=<NAME>, --i18n, --radius, --mock, --arch, --color, --rtk, --types...)
  let targetGroup = null;
  const groupArg = args.find((a) => a.startsWith('--group=') || a.startsWith('-g='));
  if (groupArg) {
    targetGroup = groupArg.split('=')[1];
  } else if (args.includes('--i18n')) {
    targetGroup = 'i18n';
  } else if (args.includes('--radius')) {
    targetGroup = 'radius';
  } else if (args.includes('--mock') || args.includes('--mocks')) {
    targetGroup = 'mock';
  } else if (args.includes('--color') || args.includes('--colors')) {
    targetGroup = 'color';
  } else if (args.includes('--arch') || args.includes('--architecture')) {
    targetGroup = 'arch';
  } else if (args.includes('--rtk')) {
    targetGroup = 'rtk';
  } else if (args.includes('--router')) {
    targetGroup = 'router';
  } else if (args.includes('--tokens')) {
    targetGroup = 'tokens';
  } else if (args.includes('--types')) {
    targetGroup = 'types';
  } else if (args.includes('--react')) {
    targetGroup = 'react';
  }

  // 5. Parse options quét đường dẫn
  let targetPath = null;
  const pathArg = args.find((a) => a.startsWith('--path=') || a.startsWith('-p='));
  if (pathArg) {
    targetPath = pathArg.split('=')[1];
  } else {
    const pIdx = args.indexOf('-p');
    if (pIdx !== -1 && args[pIdx + 1] && !args[pIdx + 1].startsWith('-')) {
      targetPath = args[pIdx + 1];
    } else {
      const positional = args.find(
        (a) => !a.startsWith('-') && a !== 'rules' && a !== 'list-rules' && a !== targetRule
      );
      if (positional) {
        targetPath = positional;
      }
    }
  }

  const presetArg = args.find((a) => a.startsWith('--preset='));
  let preset = presetArg ? presetArg.split('=')[1] : 'all';
  if (args.includes('--strict') || args.includes('--ci')) {
    preset = 'ci';
  }

  const reportArg = args.find((a) => a.startsWith('--report='));
  const reportFile = reportArg ? reportArg.split('=')[1] : null;

  // 6. Thực thi Linter Engine
  const { results, summary, projectInfo } = runLintEngine({
    path: targetPath,
    rule: targetRule,
    group: targetGroup,
    preset,
    cwd: process.cwd(),
  });

  if (reportFile) {
    fs.writeFileSync(
      reportFile,
      JSON.stringify(
        { projectInfo, results, summary, timestamp: new Date().toISOString() },
        null,
        2
      ),
      'utf-8'
    );
    if (format !== 'json') {
      console.log(`✔ Báo cáo JSON đã được lưu tại: ${reportFile}`);
    }
  }

  // 7. Quyết định chế độ hiển thị: Mặc định in toàn bộ luồng kết quả (thân thiện 100% cho AI Agents & CI/CD)
  const isExplicitTui = args.includes('-i') || args.includes('--interactive') || args.includes('--tui');
  const shouldRunTui = isExplicitTui && format !== 'json' && summary.totalViolations > 0;

  if (shouldRunTui) {
    const exitCode = await startInteractiveDashboard(results, summary, projectInfo);
    process.exit(exitCode);
  } else {
    const isVerbose = args.includes('--verbose') || args.includes('-v') || args.includes('--all');
    const exitCode = renderScanResults(results, summary, projectInfo, format, isVerbose);
    process.exit(exitCode);
  }
}
