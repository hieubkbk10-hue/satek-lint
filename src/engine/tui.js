/**
 * ============================================================================
 * INTERACTIVE TERMINAL UI (TUI) DASHBOARD ENGINE
 * Master-Detail Split View, Live Instant Preview, Full Error Details Display
 * Native Cross-Platform for PowerShell, Windows Terminal, CMD, Bash
 * ============================================================================
 */

import readline from 'readline';

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
  bgCyan: '\x1b[46m',
  bgDark: '\x1b[100m',
  inverse: '\x1b[7m',
};

export function startInteractiveDashboard(results, summary, projectInfo = {}) {
  return new Promise((resolve) => {
    const filesWithIssues = results.filter((r) => r.violations.length > 0);

    if (filesWithIssues.length === 0) {
      console.log(`\n${COLORS.bright}${COLORS.green}✔ HOÀN HẢO! Toàn bộ ${results.length} tệp tin đều đạt 100% chuẩn SSOT & Kiến trúc Satek.${COLORS.reset}\n`);
      return resolve(0);
    }

    // 5 Tabs phân loại ngắn gọn
    const TABS = [
      { id: 'all', label: 'Tất cả', short: 'All', filter: () => true },
      { id: 'critical', label: 'Critical', short: 'Crit', filter: (v) => v.severity === 'CRITICAL' || v.severity === 'MAJOR' },
      { id: 'i18n', label: 'Tiếng Việt', short: 'i18n', filter: (v) => v.ruleCode === 'RULE-I18N-001' },
      { id: 'radius', label: 'Bo góc', short: 'Radius', filter: (v) => v.ruleCode === 'RULE-RADIUS-001' },
      { id: 'arch', label: 'Cấu trúc/RTK', short: 'Arch', filter: (v) => v.ruleCode.startsWith('RULE-RTK') || v.ruleCode.startsWith('RULE-ROUTE') || v.ruleCode.startsWith('RULE-IMPORT') || v.ruleCode.startsWith('RULE-FOLDER') },
    ];

    let currentTabIdx = 0;
    let selectedFileIdx = 0;
    let detailScrollOffset = 0;

    // Đếm số lượng vi phạm mỗi Tab
    function getTabCount(tab) {
      let count = 0;
      filesWithIssues.forEach((f) => {
        f.violations.forEach((v) => {
          if (tab.filter(v)) count++;
        });
      });
      return count;
    }

    // Lọc danh sách file theo Tab
    function getFilteredFiles() {
      const activeTab = TABS[currentTabIdx];
      if (activeTab.id === 'all') return filesWithIssues;

      return filesWithIssues
        .map((f) => {
          const matchedViolations = f.violations.filter(activeTab.filter);
          return {
            ...f,
            violations: matchedViolations,
          };
        })
        .filter((f) => f.violations.length > 0);
    }

    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
    }

    function clearScreen() {
      process.stdout.write('\x1b[2J\x1b[0;0H');
    }

    function render() {
      clearScreen();
      const termRows = process.stdout.rows || 30;
      const termCols = process.stdout.columns || 100;
      const divider = '─'.repeat(Math.min(termCols, 90));

      const filteredFiles = getFilteredFiles();
      if (selectedFileIdx >= filteredFiles.length) {
        selectedFileIdx = Math.max(0, filteredFiles.length - 1);
      }

      // 1. Header Bar
      console.log(
        `${COLORS.bright}${COLORS.bgBlue} SATEK LINTER DASHBOARD ${COLORS.reset} ${COLORS.dim}│ ${summary.totalViolations} lỗi / ${summary.filesWithViolations} files │ Tuân thủ: ${summary.complianceRate}%${COLORS.reset}`
      );

      // 2. Compact Tab Bar (Không tràn dòng)
      let tabBar = ' ';
      TABS.forEach((tab, idx) => {
        const count = getTabCount(tab);
        const isActive = idx === currentTabIdx;
        const tag = `[${idx + 1}] ${tab.label}(${count})`;
        if (isActive) {
          tabBar += `${COLORS.bright}${COLORS.cyan}${COLORS.inverse} ${tag} ${COLORS.reset} `;
        } else {
          tabBar += `${COLORS.dim}${tag}${COLORS.reset} `;
        }
      });
      console.log(tabBar);
      console.log(divider);

      if (filteredFiles.length === 0) {
        console.log(`\n  ${COLORS.green}✔ Không có vi phạm nào trong danh mục này.${COLORS.reset}\n`);
      } else {
        const selectedFile = filteredFiles[selectedFileIdx];

        // 3. TOP PANE: Danh sách File gọn gàng (4 dòng)
        const filePaneHeight = 4;
        let startIdx = 0;
        if (selectedFileIdx >= filePaneHeight) {
          startIdx = selectedFileIdx - filePaneHeight + 1;
        }

        console.log(` ${COLORS.bright}${COLORS.white}DANH SÁCH TỆP TIN:${COLORS.reset} ${COLORS.dim}(Tệp ${selectedFileIdx + 1}/${filteredFiles.length})${COLORS.reset}`);

        for (let i = startIdx; i < Math.min(filteredFiles.length, startIdx + filePaneHeight); i++) {
          const f = filteredFiles[i];
          const isSelected = i === selectedFileIdx;
          const pointer = isSelected ? `${COLORS.bright}${COLORS.cyan}>${COLORS.reset}` : ' ';
          const fName = isSelected ? `${COLORS.bright}${COLORS.white}${COLORS.bgDark} ${f.relativePath} ${COLORS.reset}` : `${COLORS.yellow}${f.relativePath}${COLORS.reset}`;
          const errCount = `${COLORS.red}${f.violations.length} lỗi${COLORS.reset}`;

          console.log(` ${pointer} ${fName} ${COLORS.dim}—${COLORS.reset} ${errCount}`);
        }

        console.log(divider);

        // 4. BOTTOM PANE: CHI TIẾT TẤT CẢ LỖI (HIỆN HẾT KHÔNG CẮT BỚT BẰNG ...)
        if (selectedFile) {
          const vCount = selectedFile.violations.length;
          console.log(
            ` ${COLORS.bright}${COLORS.cyan}CHI TIẾT TOÀN BỘ ${vCount} LỖI:${COLORS.reset} ${COLORS.bright}${COLORS.white}${selectedFile.relativePath}${COLORS.reset}`
          );

          // Hiển thị toàn bộ các lỗi của file hiện tại
          const startVIdx = Math.max(0, detailScrollOffset);
          for (let vIdx = startVIdx; vIdx < selectedFile.violations.length; vIdx++) {
            const v = selectedFile.violations[vIdx];
            const sevBadge =
              v.priority === 'HIGH' || v.severity === 'CRITICAL'
                ? `${COLORS.red}[HIGH]${COLORS.reset}`
                : v.priority === 'MEDIUM' || v.severity === 'MAJOR'
                ? `${COLORS.yellow}[MEDIUM]${COLORS.reset}`
                : v.priority === 'RECOMMEND'
                ? `${COLORS.bright}${COLORS.cyan}[RECOMMEND]${COLORS.reset}`
                : `${COLORS.dim}[${v.priority || v.ruleCode}]${COLORS.reset}`;

            const lineTag = `${COLORS.dim}Dòng ${v.line}:${COLORS.reset}`;
            const snippet = (v.matchedText || v.codeSnippet || '').trim();

            console.log(`   ${COLORS.bright}#${vIdx + 1}${COLORS.reset} ${sevBadge} ${lineTag} ${COLORS.white}${snippet}${COLORS.reset}`);
            console.log(`      ${COLORS.dim}💡 Sửa:${COLORS.reset} ${COLORS.green}${v.fix}${COLORS.reset}`);
          }
        }
      }

      // 5. Footer & Navigation Controls
      console.log(divider);
      console.log(` ${COLORS.bright}Phím:${COLORS.reset} ${COLORS.cyan}[↑/↓]${COLORS.reset} Chọn file xem lỗi ngay │ ${COLORS.cyan}[Tab / 1-5]${COLORS.reset} Đổi Tab │ ${COLORS.cyan}[PgUp/PgDn]${COLORS.reset} Cuộn chi tiết │ ${COLORS.red}[q/Esc]${COLORS.reset} Thoát`);
    }

    render();

    function onKeypress(str, key) {
      if (!key) return;

      // Thoát: q, escape, ctrl+c
      if (key.name === 'q' || key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        clearScreen();
        printSummaryTable(summary, filesWithIssues);
        return resolve(summary.totalViolations === 0 ? 0 : 1);
      }

      const filteredFiles = getFilteredFiles();

      // Di chuyển lên / xuống (Xem lỗi trực tiếp, reset scroll detail)
      if (key.name === 'up' || key.name === 'k') {
        selectedFileIdx = Math.max(0, selectedFileIdx - 1);
        detailScrollOffset = 0;
        render();
      } else if (key.name === 'down' || key.name === 'j') {
        selectedFileIdx = Math.min(filteredFiles.length - 1, selectedFileIdx + 1);
        detailScrollOffset = 0;
        render();
      }

      // Cuộn chi tiết lỗi của file nếu file có nhiều lỗi
      else if (key.name === 'pageup' || key.name === 'w') {
        detailScrollOffset = Math.max(0, detailScrollOffset - 4);
        render();
      } else if (key.name === 'pagedown' || key.name === 's') {
        const sel = filteredFiles[selectedFileIdx];
        if (sel && detailScrollOffset + 4 < sel.violations.length) {
          detailScrollOffset += 4;
        }
        render();
      }

      // Đổi Tab: Tab hoặc mũi tên trái/phải
      else if (key.name === 'tab' || key.name === 'right' || key.name === 'l') {
        currentTabIdx = (currentTabIdx + 1) % TABS.length;
        selectedFileIdx = 0;
        detailScrollOffset = 0;
        render();
      } else if (key.name === 'left' || key.name === 'h') {
        currentTabIdx = (currentTabIdx - 1 + TABS.length) % TABS.length;
        selectedFileIdx = 0;
        detailScrollOffset = 0;
        render();
      }

      // Phím số 1-5 chuyển tab trực tiếp
      else if (['1', '2', '3', '4', '5'].includes(str)) {
        const targetIdx = parseInt(str, 10) - 1;
        if (targetIdx >= 0 && targetIdx < TABS.length) {
          currentTabIdx = targetIdx;
          selectedFileIdx = 0;
          detailScrollOffset = 0;
          render();
        }
      }
    }

    process.stdin.on('keypress', onKeypress);

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }
    }
  });
}

function printSummaryTable(summary, filesWithIssues) {
  console.log(`\n========================================================================================`);
  console.log(`📊 SATEK AUDIT SUMMARY (Đã quét: ${summary.totalFiles} files │ Tuân thủ: ${summary.complianceRate}%)`);
  console.log(`========================================================================================`);
  console.log(`- Số file đạt chuẩn   : ${COLORS.green}${summary.cleanFiles}${COLORS.reset} files`);
  console.log(`- Số file có vi phạm  : ${COLORS.red}${summary.filesWithViolations}${COLORS.reset} files`);
  console.log(`- Tổng số lỗi cần sửa : ${COLORS.red}${COLORS.bright}${summary.totalViolations}${COLORS.reset} vị trí\n`);
}
