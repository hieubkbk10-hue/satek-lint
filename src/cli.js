/**
 * ============================================================================
 * UNIVERSAL FRONTEND LINTER CLI CONTROLLER
 * ============================================================================
 */

import fs from 'fs';
import { renderRuleCatalog, renderScanResults } from './engine/reporter.js';
import { runLintEngine } from './engine/linter.js';

export function runCli(args = process.argv.slice(2)) {
  // 1. Kiểm tra lệnh in danh mục rules
  const isListRules =
    args.includes('--list-rules') ||
    args.includes('-l') ||
    args.includes('--rules') ||
    args.includes('-r') ||
    args.includes('rules') ||
    args.includes('list-rules');

  const formatArg = args.find((a) => a.startsWith('--format='));
  const format = formatArg ? formatArg.split('=')[1] : 'text';

  if (isListRules) {
    const exitCode = renderRuleCatalog(format);
    process.exit(exitCode);
  }

  // 2. Help banner
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🛡️  SATEK FRONTEND ARCHITECTURE & DESIGN TOKEN LINTER (34+ RULES)

Sử dụng:
  satek-lint [options] [path]
  fe-lint [options] [path]

Các tuỳ chọn:
  --rules, -l, -r          In toàn bộ danh mục quy tắc ra màn hình
  --path=<folder|file>     Quét một thư mục hoặc tệp tin cụ thể (vd: --path=src/routes)
  --preset=<name>          Chọn bộ rule: all | ci | strict | migration | architecture | tokens | router | universal
  --ci, --strict           Chế độ chặn CI: Chỉ quét các lỗi kiến trúc bắt buộc (CRITICAL & MAJOR)
  --report=<file.json>     Xuất báo cáo kết quả quét ra file JSON
  --format=text|json       Định dạng xuất kết quả (text hoặc json)
  --verbose, -v, --all     Hiển thị chi tiết tất cả các file (kể cả file không có lỗi)
  --help, -h               Hiển thị hướng dẫn này
`);
    process.exit(0);
  }

  // 3. Parse options quét
  let targetPath = null;
  const pathArg = args.find((a) => a.startsWith('--path=') || a.startsWith('-p='));
  if (pathArg) {
    targetPath = pathArg.split('=')[1];
  } else {
    const pIdx = args.indexOf('-p');
    if (pIdx !== -1 && args[pIdx + 1] && !args[pIdx + 1].startsWith('-')) {
      targetPath = args[pIdx + 1];
    } else {
      const positional = args.find((a) => !a.startsWith('-'));
      if (positional && positional !== 'rules' && positional !== 'list-rules') {
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

  // 4. Thực thi Linter Engine
  const { results, summary, projectInfo } = runLintEngine({
    path: targetPath,
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

  const isVerbose = args.includes('--verbose') || args.includes('-v') || args.includes('--all');
  const exitCode = renderScanResults(results, summary, projectInfo, format, isVerbose);
  process.exit(exitCode);
}
