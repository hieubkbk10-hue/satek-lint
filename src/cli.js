/**
 * ============================================================================
 * UNIVERSAL FRONTEND LINTER CLI CONTROLLER (V3 ADVISORY)
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderRuleCatalog, renderScanResults } from './engine/reporter.js';
import { runLintEngine } from './engine/linter.js';
import { startInteractiveDashboard } from './engine/tui.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runCli(args = process.argv.slice(2)) {
  try {
    // 0. Kiểm tra cờ --ci / --strict đã bị xóa bỏ
    if (args.includes('--ci') || args.includes('--strict')) {
      console.error('\n✖ Lỗi: Cờ --ci và --strict đã bị loại bỏ trong Satek Linter v3.');
      console.error('💡 Satek Linter v3 hoạt động theo mô hình Full Advisory Engine:');
      console.error('   • Quét toàn bộ mã nguồn mà không dừng sớm.');
      console.error('   • Findings là thông tin ngữ cảnh cho AI Agent, không làm fail CI (exit code luôn là 0 khi hoàn thành).\n');
      process.exit(2);
    }

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

    // 2. Kiểm tra lệnh IN MA TRẬN TRUY VẾT YÊU CẦU (--coverage)
    if (args.includes('--coverage')) {
      const reqPath = path.join(__dirname, 'standards/requirements.json');
      if (fs.existsSync(reqPath)) {
        const reqData = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
        if (format === 'json') {
          console.log(JSON.stringify(reqData, null, 2));
        } else {
          console.log('\n📋 SATEK LINTER V3 — STANDARDS TRACEABILITY MATRIX:');
          console.log('========================================================================================');
          reqData.requirements.forEach((r, i) => {
            console.log(`${i + 1}. [${r.id}] [${r.source} §${r.section}] (${r.automation.toUpperCase()})`);
            console.log(`   Yêu cầu : ${r.requirement}`);
            console.log(`   Quy tắc : ${r.ruleCodes.join(', ')}\n`);
          });
          console.log('========================================================================================\n');
        }
        process.exit(0);
      }
    }

    // 2b. Cập nhật snapshot tài liệu chuẩn hóa (--update-standards-snapshot)
    if (args.includes('--update-standards-snapshot')) {
      const crypto = await import('crypto');
      const standardFiles = [
        'rules/rules.md',
        'rules/api.md',
        'rules/list_page_table_rules.md',
        'rules/quy_chuan_code_cong_ty.md',
        'guides/query_guides.md',
        'guides/feature_development_guide.md',
      ];
      const standardsRoot = path.join(process.cwd(), '.agents');
      const hashes = {};
      let count = 0;
      for (const rel of standardFiles) {
        const fullPath = path.join(standardsRoot, rel);
        if (fs.existsSync(fullPath)) {
          const buf = fs.readFileSync(fullPath);
          hashes[rel] = crypto.default.createHash('sha256').update(buf).digest('hex');
          count++;
        }
      }
      const snapshotOut = path.join(process.cwd(), '.satek-lint-standards.json');
      fs.writeFileSync(snapshotOut, JSON.stringify(hashes, null, 2), 'utf8');
      console.log(`\n✔ Đã cập nhật snapshot cho ${count} tài liệu chuẩn hóa tại: ${snapshotOut}\n`);
      process.exit(0);
    }

    // 3. Help banner
    if (args.includes('--help') || args.includes('-h')) {
      console.log(`
🛡️  SATEK LINTER V3 — UNIVERSAL FRONTEND ARCHITECTURE & AST ADVISORY ENGINE

Sử dụng:
  satek-lint [options] [path]
  fe-lint [options] [path]

⚙️ Tùy chọn phân tích & định dạng:
  --format=text|json              Định dạng xuất kết quả (mặc định: text)
  --report=<file.json>            Xuất báo cáo kết quả quét ra file JSON
  --coverage                      In ma trận truy vết toàn bộ yêu cầu từ 6 tài liệu chuẩn hóa
  --update-standards-snapshot     Lưu snapshot SHA256 các tài liệu chuẩn hóa vào .satek-lint-standards.json
  --config=<file.json>            Đường dẫn đến file cấu hình tùy chọn (satek-linter.config.json)
  --base=<git-ref>                So sánh commit trong khoảng base..HEAD cho kiểm tra commit
  --path=<folder|file>            Quét một thư mục hoặc tệp tin cụ thể
  --verbose, -v                   Hiển thị chi tiết cả các tệp tin chuẩn không có cảnh báo
  --all                           Bao gồm tất cả quy tắc mở rộng (radius bo góc và toàn bộ i18n)
  --rules, -l [từ_khóa]           In danh mục toàn bộ quy tắc ra màn hình
  --tui, -i                       Mở Dashboard tương tác Master-Detail chia đôi màn hình
  --help, -h                      Hiển thị hướng dẫn này
`);
      process.exit(0);
    }

    function getArgValue(argList, ...flags) {
      for (const flag of flags) {
        const eq = argList.find((a) => a.startsWith(`${flag}=`));
        if (eq) return eq.slice(flag.length + 1);
        const idx = argList.indexOf(flag);
        if (idx !== -1 && argList[idx + 1] && !argList[idx + 1].startsWith('-')) {
          return argList[idx + 1];
        }
      }
      return null;
    }

    // 4. Parse options đường dẫn và cấu hình
    const includeAll = args.includes('--all');
    let targetPath = getArgValue(args, '--path', '-p');
    if (!targetPath) {
      const positional = args.find(
        (a) => !a.startsWith('-') && a !== 'rules' && a !== 'list-rules'
      );
      if (positional) {
        targetPath = positional;
      }
    }

    if (targetPath && !fs.existsSync(targetPath)) {
      console.error(`\n✖ Lỗi: Đường dẫn quét không tồn tại: ${targetPath}\n`);
      process.exit(2);
    }

    const reportFile = getArgValue(args, '--report');
    const configFile = getArgValue(args, '--config', '-c');
    const baseRef = getArgValue(args, '--base');

    // 5. Thực thi Linter Engine
    const lintOutput = await runLintEngine({
      path: targetPath,
      config: configFile,
      base: baseRef,
      all: includeAll,
      cwd: process.cwd(),
    });

    const { results, summary, projectInfo, findings, diagnostics, manualChecks, coverage, timings } = lintOutput;

    if (reportFile) {
      fs.writeFileSync(
        reportFile,
        JSON.stringify(
          {
            schemaVersion: 3,
            status: 'complete',
            projectInfo,
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
        ),
        'utf-8'
      );
      if (format !== 'json') {
        console.log(`✔ Báo cáo JSON đã được lưu tại: ${reportFile}`);
      }
    }

    // 6. Hiển thị kết quả
    const isExplicitTui = args.includes('-i') || args.includes('--interactive') || args.includes('--tui');
    const shouldRunTui = isExplicitTui && format !== 'json' && summary.totalViolations > 0;

    if (shouldRunTui) {
      const exitCode = await startInteractiveDashboard(results, summary, projectInfo);
      process.exit(exitCode || 0);
    } else {
      const isVerbose = args.includes('--verbose') || args.includes('-v') || args.includes('--all');
      const exitCode = renderScanResults({
        results,
        summary,
        projectInfo,
        format,
        isVerbose,
        findings,
        coverage,
        manualChecks,
        diagnostics,
        timings,
      });
      process.exit(exitCode || 0);
    }
  } catch (err) {
    console.error(`\n💥 Lỗi thực thi nội bộ (Engine Error): ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(3);
  }
}
