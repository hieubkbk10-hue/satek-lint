import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PRIORITIES } from '../../../engine/findings.js';

const CONVENTIONAL_COMMIT_REGEX = /^(?:feat|fix|docs|style|refactor|test|chore|perf)(?:\([^)]+\))?!?: .+/;
const BRANCH_NAME_REGEX = /^dev_[a-z0-9]+_[a-z0-9]+(?:_[a-z0-9]+)*$/;
const EXEMPT_BRANCHES = new Set(['main', 'master', 'develop', 'staging', 'production']);

export async function runRepositoryPack(context) {
  const repoReader = context.repository;
  if (!repoReader) return;

  const localConfigs = repoReader.readLocalConfigs();
  const gitMetadata = await repoReader.readGitMetadata(context.options.base);

  function report(ruleCode, targetPath, message, suggestion, evidence = '', priority = PRIORITIES.MEDIUM, subcheck = '', requirementIds = []) {
    context.addFinding({
      ruleCode,
      subcheck,
      requirementIds,
      priority,
      confidence: 'proven',
      location: { path: targetPath, line: 1, column: 1 },
      message,
      suggestion,
      evidence,
    });
  }

  // Record requirements
  context.recordRequirement('CODE.REPO.FORMAT');
  context.recordRequirement('CODE.REPO.TS_STRICT');
  context.recordRequirement('CODE.REPO.BRANCH');
  context.recordRequirement('CODE.REPO.COMMITS');
  context.recordRequirement('CODE.REPO.HUSKY');

  // 1. RULE-REPO-001: Prettier & EditorConfig
  if (localConfigs.prettierConfig) {
    if (localConfigs.prettierConfig.tabWidth && localConfigs.prettierConfig.tabWidth !== 2) {
      report(
        'RULE-REPO-001',
        path.join(context.projectRoot, '.prettierrc'),
        `Cấu hình tabWidth trong Prettier phải là 2 spaces (hiện tại: ${localConfigs.prettierConfig.tabWidth}).`,
        'Đặt lại "tabWidth": 2 trong .prettierrc.',
        `tabWidth: ${localConfigs.prettierConfig.tabWidth}`,
        PRIORITIES.LOW,
        'prettier-tab-width',
        ['CODE.REPO.FORMAT']
      );
    }
  }

  // 2. RULE-REPO-002: TS strict mode and scripts in package.json
  if (localConfigs.packageJson) {
    const scripts = localConfigs.packageJson.scripts || {};
    if (!scripts.build) {
      report(
        'RULE-REPO-002',
        path.join(context.projectRoot, 'package.json'),
        'package.json thiếu script "build" phục vụ kiểm tra toàn vẹn mã nguồn trong CI/pre-commit.',
        'Thêm script "build" vào package.json.',
        'missing scripts.build',
        PRIORITIES.HIGH,
        'missing-build-script',
        ['CODE.REPO.TS_STRICT']
      );
    }
  }

  // RULE-REPO-005: Husky git hooks wiring
  context.recordRequirement('CODE.REPO.HUSKY');
  if (!localConfigs.hasHusky || !localConfigs.preCommitContent) {
    report(
      'RULE-REPO-005',
      path.join(context.projectRoot, '.husky/pre-commit'),
      'Dự án thiếu hook ".husky/pre-commit" phục vụ kiểm soát format, lint, build tự động trước khi commit.',
      'Khởi tạo pre-commit hook trong .husky/pre-commit chạy format, lint và build.',
      'missing .husky/pre-commit',
      PRIORITIES.MEDIUM,
      'missing-pre-commit-hook',
      ['CODE.REPO.HUSKY']
    );
  }
  if (!localConfigs.commitMsgContent) {
    report(
      'RULE-REPO-005',
      path.join(context.projectRoot, '.husky/commit-msg'),
      'Dự án thiếu hook ".husky/commit-msg" phục vụ kiểm tra chuẩn Conventional Commits.',
      'Khởi tạo commit-msg hook trong .husky/commit-msg chạy npx --no -- commitlint --edit "$1".',
      'missing .husky/commit-msg',
      PRIORITIES.LOW,
      'missing-commit-msg-hook',
      ['CODE.REPO.HUSKY']
    );
  }

  // 3. Git-based rules (if git repo detected)
  if (gitMetadata.isGit) {
    // RULE-REPO-003: Branch naming
    if (gitMetadata.branch && !EXEMPT_BRANCHES.has(gitMetadata.branch) && gitMetadata.branch !== 'HEAD') {
      if (!BRANCH_NAME_REGEX.test(gitMetadata.branch)) {
        report(
          'RULE-REPO-003',
          context.projectRoot,
          `Tên branch hiện tại "${gitMetadata.branch}" không tuân thủ quy chuẩn "dev_<tên-thành-viên>_<tính-năng>".`,
          'Đặt tên branch theo mẫu: dev_hieu_auth_flow, dev_nam_email_service (chỉ dùng chữ thường và gạch dưới).',
          gitMetadata.branch,
          PRIORITIES.MEDIUM,
          'invalid-branch-naming',
          ['CODE.REPO.BRANCH']
        );
      }
    }

    // RULE-REPO-004: Conventional Commits (ignore automated merge commits)
    for (const commit of gitMetadata.recentCommits) {
      if (commit.subject && !commit.subject.startsWith('Merge ') && !CONVENTIONAL_COMMIT_REGEX.test(commit.subject)) {
        report(
          'RULE-REPO-004',
          context.projectRoot,
          `Thông điệp commit "${commit.subject}" (${commit.hash}) không tuân thủ chuẩn Conventional Commits (8 loại: feat, fix, docs, style, refactor, test, chore, perf).`,
          'Viết commit theo mẫu: feat(auth): add login form hoặc fix(cart): resolve total price rounding.',
          commit.subject,
          PRIORITIES.LOW,
          'non-conventional-commit',
          ['CODE.REPO.COMMITS']
        );
      }
    }

    // RULE-GENERATED-001: routeTree.gen.ts modified
    if (gitMetadata.hasRouteTreeModified) {
      report(
        'RULE-GENERATED-001',
        path.join(context.projectRoot, 'src/routeTree.gen.ts'),
        'Tệp "routeTree.gen.ts" đã được chỉnh sửa trong worktree. Cần đảm bảo file này được sinh tự động bởi TanStack Router generator, không sửa tay.',
        'Chạy lệnh sinh route tự động hoặc kiểm tra lại diff.',
        'routeTree.gen.ts modified',
        PRIORITIES.INFO,
        'generated-route-tree-modified'
      );
    }
  }

  // 4. RULE-STANDARDS-001: Standards Drift check (if standardsRoot is configured or present)
  const standardsRoot = context.config.standardsRoot || path.join(context.projectRoot, '.agents');
  if (fs.existsSync(standardsRoot)) {
    context.recordRequirement('CODE.STANDARDS.DRIFT');
    const standardFiles = [
      'rules/rules.md',
      'rules/api.md',
      'rules/list_page_table_rules.md',
      'rules/quy_chuan_code_cong_ty.md',
      'guides/query_guides.md',
      'guides/feature_development_guide.md',
    ];

    const snapshotPath = path.join(context.projectRoot, '.satek-lint-standards.json');
    let savedHashes = null;
    if (fs.existsSync(snapshotPath)) {
      try {
        savedHashes = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      } catch (_) {}
    }

    if (savedHashes) {
      for (const rel of standardFiles) {
        const fullPath = path.join(standardsRoot, rel);
        if (!fs.existsSync(fullPath)) continue;
        try {
          const fileBuf = fs.readFileSync(fullPath);
          const currentHash = crypto.createHash('sha256').update(fileBuf).digest('hex');
          if (savedHashes[rel] && savedHashes[rel] !== currentHash) {
            report(
              'RULE-STANDARDS-001',
              fullPath,
              `Tài liệu chuẩn hóa "${rel}" đã thay đổi so với snapshot đã lưu.`,
              'Rà soát lại các quy tắc liên quan và chạy satek-lint --update-standards-snapshot để cập nhật baseline.',
              `Current: ${currentHash.slice(0, 12)} | Saved: ${savedHashes[rel].slice(0, 12)}`,
              PRIORITIES.INFO,
              'standards-drift-detected',
              ['CODE.STANDARDS.DRIFT']
            );
          }
        } catch (_) {}
      }
    }
  }
}
