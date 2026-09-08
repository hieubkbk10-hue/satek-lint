import fs from 'fs';
import path from 'path';
import { PRIORITIES } from '../../../engine/findings.js';

export function runModuleGraphPack(context) {
  const graph = context.importGraph;
  if (!graph) return;

  const projectRoot = context.projectRoot;
  const componentsDir = path.join(projectRoot, 'src/components');
  const routesDir = path.join(projectRoot, 'src/routes');

  // Populate graph nodes for all files
  for (const filePath of context.files) {
    const sourceFile = context.parser.getSourceFile(filePath);
    if (sourceFile) {
      graph.addFile(filePath, sourceFile);
    }
  }

  // Helper for adding finding
  function report(ruleCode, filePath, line, column, message, suggestion, evidence = '', priority = PRIORITIES.MEDIUM, subcheck = '', requirementIds = []) {
    context.addFinding({
      ruleCode,
      subcheck,
      requirementIds,
      priority,
      confidence: 'proven',
      location: { path: filePath, line: line || 1, column: column || 1 },
      message,
      suggestion,
      evidence,
    });
  }

  // --- RULE-BARREL-001: Missing Feature Barrel Entrypoint ---
  context.recordRequirement('ARCH.BARREL.SURFACE');
  if (fs.existsSync(componentsDir)) {
    const entries = fs.readdirSync(componentsDir, { withFileTypes: true });
    const infrastructure = new Set(context.config.infrastructureModules || ['common', 'layout', 'ui']);

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const featureName = entry.name;
      if (infrastructure.has(featureName)) continue;

      const featureDir = path.join(componentsDir, featureName);
      if (context.options.path) {
        const normFeatureDir = path.normalize(featureDir).toLowerCase();
        const hasScannedFiles = context.files.some((f) => path.normalize(f).toLowerCase().startsWith(normFeatureDir));
        if (!hasScannedFiles) continue;
      }

      const pagesDir = path.join(featureDir, 'pages');
      const sharedDir = path.join(featureDir, 'shared');

      // Check root index.ts / index.tsx
      const hasRootIndex = fs.existsSync(path.join(featureDir, 'index.ts')) || fs.existsSync(path.join(featureDir, 'index.tsx'));
      if (!hasRootIndex) {
        report(
          'RULE-BARREL-001',
          path.join(featureDir, 'index.ts'),
          1,
          1,
          `Feature domain "${featureName}" thiếu public barrel entrypoint "index.ts" tại root feature.`,
          `Tạo tệp "src/components/${featureName}/index.ts" và re-export các thành phần public từ pages/ và shared/.`,
          featureName,
          PRIORITIES.HIGH,
          'missing-feature-root-barrel',
          ['ARCH.BARREL.SURFACE']
        );
      }

      // Check pages/ and shared/
      if (fs.existsSync(pagesDir)) {
        const hasPagesIndex = fs.existsSync(path.join(pagesDir, 'index.ts')) || fs.existsSync(path.join(pagesDir, 'index.tsx'));
        if (!hasPagesIndex) {
          report(
            'RULE-BARREL-001',
            path.join(pagesDir, 'index.ts'),
            1,
            1,
            `Thư mục pages của feature "${featureName}" thiếu tệp barrel "pages/index.ts".`,
            `Tạo "src/components/${featureName}/pages/index.ts" để xuất các Page component.`,
            featureName,
            PRIORITIES.HIGH,
            'missing-pages-barrel',
            ['ARCH.BARREL.SURFACE']
          );
        }
      }

      if (fs.existsSync(sharedDir)) {
        const hasSharedIndex = fs.existsSync(path.join(sharedDir, 'index.ts')) || fs.existsSync(path.join(sharedDir, 'index.tsx'));
        if (!hasSharedIndex) {
          report(
            'RULE-BARREL-001',
            path.join(sharedDir, 'index.ts'),
            1,
            1,
            `Thư mục shared của feature "${featureName}" thiếu tệp barrel "shared/index.ts".`,
            `Tạo "src/components/${featureName}/shared/index.ts" để xuất các shared components nội bộ.`,
            featureName,
            PRIORITIES.HIGH,
            'missing-shared-barrel',
            ['ARCH.BARREL.SURFACE']
          );
        }
      }

      // RULE-FOLDER-003: Legacy or dead feature folder (components/<feature>/components or forms)
      if (featureName !== 'auth') {
        const legacyComponents = path.join(featureDir, 'components');
        if (fs.existsSync(legacyComponents)) {
          report(
            'RULE-FOLDER-003',
            legacyComponents,
            1,
            1,
            `Phát hiện thư mục phẳng cũ "${featureName}/components". Cần phân loại vào pages/, shared/, tabs/, hoặc steps/.`,
            'Di chuyển components con vào đúng thư mục vai trò tương ứng.',
            `${featureName}/components`,
            PRIORITIES.MEDIUM,
            'legacy-folder-detected'
          );
        }
      }
    }

    // RULE-FOLDER-004: Common Kit 7-group architecture
    const commonDir = path.join(componentsDir, 'common');
    if (fs.existsSync(commonDir)) {
      context.recordRequirement('ARCH.FOLDER.COMMON');
      const validCommonGroups = new Set(['cards', 'feedback', 'forms', 'navigation', 'system', 'table', 'ui', 'index.ts']);
      const commonEntries = fs.readdirSync(commonDir, { withFileTypes: true });
      for (const ce of commonEntries) {
        if (ce.isDirectory() && !validCommonGroups.has(ce.name)) {
          report(
            'RULE-FOLDER-004',
            path.join(commonDir, ce.name),
            1,
            1,
            `Thư mục common "${ce.name}" không thuộc 7 nhóm chuẩn (cards, feedback, forms, navigation, system, table, ui).`,
            'Phân loại component vào 1 trong 7 nhóm chuẩn của Common kit.',
            ce.name,
            PRIORITIES.MEDIUM,
            'non-standard-common-group',
            ['ARCH.FOLDER.COMMON']
          );
        }
      }
    }
  }

  // RULE-BARREL-003: Public Barrels for Shared Packages
  context.recordRequirement('ARCH.BARREL.PUBLIC');
  const sharedPackages = ['src/hooks', 'src/utils', 'src/helpers', 'src/constants'];
  for (const pkg of sharedPackages) {
    const pkgDir = path.join(projectRoot, pkg);
    if (fs.existsSync(pkgDir)) {
      const idxFile = path.join(pkgDir, 'index.ts');
      if (!fs.existsSync(idxFile)) {
        report(
          'RULE-BARREL-003',
          idxFile,
          1,
          1,
          `Gói dùng chung "${pkg}" bắt buộc phải có public barrel "index.ts" tập trung.`,
          `Tạo tệp "${pkg}/index.ts" để export các tiện ích công khai.`,
          pkg,
          PRIORITIES.HIGH,
          'missing-shared-package-barrel',
          ['ARCH.BARREL.PUBLIC']
        );
      }
    }
  }

  // RULE-PARAM-001: Fragmented Dynamic Param Name in src/routes/
  if (fs.existsSync(routesDir)) {
    const checkDynamicParams = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          checkDynamicParams(full);
        } else if (e.name.startsWith('$') && (e.name.endsWith('.tsx') || e.name.endsWith('.ts'))) {
          if (!e.name.startsWith('$id.') && e.name !== '$id.tsx' && e.name !== '$id.lazy.tsx') {
            report(
              'RULE-PARAM-001',
              full,
              1,
              1,
              `Tên file dynamic route "${e.name}" bị phân mảnh. Bắt buộc dùng $id.tsx hoặc $id.lazy.tsx.`,
              'Đổi tên file thành $id.tsx hoặc $id.lazy.tsx.',
              e.name,
              PRIORITIES.LOW,
              'fragmented-dynamic-param'
            );
          }
        }
      }
    };
    checkDynamicParams(routesDir);
  }

  // Check imports across all nodes in the graph
  context.recordRequirement('ARCH.BARREL.CONSUMER');
  context.recordRequirement('ARCH.IMPORT.SELF');

  for (const [filePath, node] of graph.nodes.entries()) {
    const rel = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    const fileName = path.basename(filePath);

    // --- RULE-WORKFLOW-001 & RULE-NAMING-001: Step component placement & naming ---
    if (fileName.endsWith('Step.tsx')) {
      const parts = rel.split('/');
      const inValidStepFolder = parts.some((p) => p === 'steps' || p.endsWith('-steps'));
      if (!inValidStepFolder) {
        context.recordRequirement('FEATURE.WORKFLOW.STEPS');
        report(
          'RULE-WORKFLOW-001',
          filePath,
          1,
          1,
          `Component workflow step "${fileName}" phải được đặt trong thư mục "steps/" hoặc "*-steps/".`,
          `Di chuyển "${fileName}" vào thư mục steps tương ứng của tính năng.`,
          rel,
          PRIORITIES.MEDIUM,
          'misplaced-step-component',
          ['FEATURE.WORKFLOW.STEPS']
        );
      }
    }

    // Check individual import statements
    for (const imp of node.imports) {
      const spec = imp.specifier;
      const line = imp.node ? context.parser.getNodeLocation(imp.node, context.parser.getSourceFile(filePath)).line : 1;

      // 1. RULE-IMPORT-001: Self circular barrel import
      if (spec === '.' || spec === './' || spec === './index' || spec === './index.ts') {
        report(
          'RULE-IMPORT-001',
          filePath,
          line,
          1,
          `Phát hiện self-barrel import "${spec}". Tệp tin không được import từ chính barrel cùng thư mục của mình.`,
          'Import trực tiếp tệp tin cụ thể hoặc tách code chung.',
          spec,
          PRIORITIES.HIGH,
          'self-circular-import',
          ['ARCH.IMPORT.SELF']
        );
      }

      // 2. RULE-BARREL-002: External consumer deep import into @/components/{feature}/...
      const featureMatch = spec.match(/^@\/components\/([^/]+)\/(.+)$/);
      if (featureMatch) {
        const targetFeature = featureMatch[1];
        const subPath = featureMatch[2];

        if (!infrastructure.has(targetFeature)) {
          const isOwnFeature = rel.startsWith(`src/components/${targetFeature}/`) || rel.startsWith(`components/${targetFeature}/`);
          if (!isOwnFeature && subPath !== 'index') {
            report(
              'RULE-BARREL-002',
              filePath,
              line,
              1,
              `Consumer bên ngoài feature "${targetFeature}" không được import sâu vào "${spec}". Bắt buộc phải import qua public barrel "@components/${targetFeature}".`,
              `Đổi import thành: import { ... } from '@/components/${targetFeature}';`,
              spec,
              PRIORITIES.HIGH,
              'external-deep-import',
              ['ARCH.BARREL.CONSUMER']
            );
          }
        }
      }

      // 3. RULE-TYPE-002: Deep type import (e.g. @/types/foo.types)
      if (spec.startsWith('@/types/') && spec !== '@/types') {
        report(
          'RULE-TYPE-002',
          filePath,
          line,
          1,
          `Kiểu dữ liệu phải được import từ public barrel "@/types" thay vì import sâu vào "${spec}".`,
          `Đổi thành: import { ... } from '@/types';`,
          spec,
          PRIORITIES.HIGH,
          'deep-types-import',
          ['ARCH.BARREL.CONSUMER']
        );
      }

      // 4. RULE-API-002: Deep API slice import (e.g. @/store/api/fooApi)
      if (spec.startsWith('@/store/api/') && spec !== '@/store/api') {
        report(
          'RULE-API-002',
          filePath,
          line,
          1,
          `API hooks/endpoints phải được import từ public barrel "@/store/api" thay vì import trực tiếp từ slice "${spec}".`,
          `Đổi thành: import { ... } from '@/store/api';`,
          spec,
          PRIORITIES.HIGH,
          'deep-api-slice-import',
          ['ARCH.BARREL.CONSUMER']
        );
      }

      // 5. RULE-IMPORT-003: Upward Layer Architectural Import Violation
      // Tầng dưới (store, types, utils, common) không được import từ tầng trên (routes, features)
      const isBottomLayer =
        rel.startsWith('src/store/') ||
        rel.startsWith('src/types/') ||
        rel.startsWith('src/utils/') ||
        rel.startsWith('src/components/common/');

      if (isBottomLayer) {
        if (spec.startsWith('@/routes/') || spec.startsWith('@/components/') && !spec.startsWith('@/components/common')) {
          report(
            'RULE-IMPORT-003',
            filePath,
            line,
            1,
            `Cấm import ngược tầng kiến trúc: tệp thuộc tầng hạ tầng/dưới ("${rel}") không được phụ thuộc vào tầng trên ("${spec}").`,
            'Đảo chiều phụ thuộc hoặc chuyển kiểu dữ liệu/tiện ích xuống tầng dùng chung.',
            spec,
            PRIORITIES.HIGH,
            'upward-layer-import'
          );
        }
      }
    }
  }

  // --- RULE-FOLDER-002: Modal co-location & single-use component in shared/ ---
  function resolveRealConsumers(targetPath, visited = new Set()) {
    if (visited.has(targetPath)) return new Set();
    visited.add(targetPath);

    const realConsumers = new Set();
    const targetNode = graph.nodes.get(targetPath);
    if (!targetNode) return realConsumers;

    for (const c of targetNode.consumers) {
      const norm = c.replace(/\\/g, '/');
      if (norm.endsWith('/index.ts') || norm.endsWith('/index.tsx')) {
        const downstream = resolveRealConsumers(c, visited);
        for (const d of downstream) realConsumers.add(d);
      } else {
        realConsumers.add(c);
      }
    }
    return realConsumers;
  }

  for (const [filePath, node] of graph.nodes.entries()) {
    const rel = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    if (rel.includes('/shared/') && /Modal\.tsx$/.test(filePath)) {
      const consumers = Array.from(resolveRealConsumers(filePath));
      if (consumers.length === 1) {
        context.recordRequirement('ARCH.COLOCATION.COMPONENT');
        report(
          'RULE-FOLDER-002',
          filePath,
          1,
          1,
          `Modal "${path.basename(filePath)}" trong shared/ chỉ có đúng 1 consumer ("${path.basename(consumers[0])}"). Nên co-locate modal gần consumer sử dụng.`,
          `Chuyển modal vào thư mục modals/ của trang hoặc tab tiêu thụ nó.`,
          rel,
          PRIORITIES.LOW,
          'single-consumer-shared-modal',
          ['ARCH.COLOCATION.COMPONENT']
        );
      }
    }
  }

  // --- RULE-NAMING-001: Component PascalCase & Hierarchy Suffix Naming ---
  for (const [filePath] of graph.nodes.entries()) {
    const rel = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    const fileName = path.basename(filePath);

    if (fileName.endsWith('.tsx') && fileName !== 'index.tsx' && !fileName.startsWith('_')) {
      // Components in components/ must be PascalCase
      if ((rel.includes('/components/') || rel.includes('/shared/')) && !/^[A-Z][a-zA-Z0-9]*\.tsx$/.test(fileName)) {
        report(
          'RULE-NAMING-001',
          filePath,
          1,
          1,
          `Tệp component "${fileName}" không tuân thủ định dạng PascalCase.`,
          'Đổi tên tệp component sang PascalCase (ví dụ: UserCard.tsx, ConfirmModal.tsx).',
          fileName,
          PRIORITIES.MEDIUM,
          'component-not-pascal-case',
          ['CODE.REPO.FILE_NAMING']
        );
      }

      // Page suffix must be in pages/
      if (/Page\.tsx$/.test(fileName) && !rel.includes('/pages/')) {
        report(
          'RULE-NAMING-001',
          filePath,
          1,
          1,
          `Component hậu tố "Page" ("${fileName}") phải được đặt trong thư mục pages/.`,
          'Di chuyển file vào thư mục pages/ của feature.',
          rel,
          PRIORITIES.MEDIUM,
          'page-suffix-outside-pages',
          ['ARCH.FOLDER.STRUCTURE']
        );
      }

      // Tab suffix must be in tabs/
      if (/Tab\.tsx$/.test(fileName) && !rel.includes('/tabs/')) {
        report(
          'RULE-NAMING-001',
          filePath,
          1,
          1,
          `Component hậu tố "Tab" ("${fileName}") phải được đặt trong thư mục tabs/.`,
          'Di chuyển file vào thư mục tabs/ của trang hoặc feature.',
          rel,
          PRIORITIES.MEDIUM,
          'tab-suffix-outside-tabs',
          ['ARCH.FOLDER.STRUCTURE']
        );
      }
    }
  }

  // --- RULE-I18N-002: Unused Locale Translation Key in src/locales/ (Only active when --all is specified) ---
  const localesDir = path.join(projectRoot, 'src/locales');
  if (context.includeAll && fs.existsSync(localesDir)) {
    // 1. Natural Fallback Pattern Check: Prohibit redundant EN domain files in src/locales/en
    const enDir = path.join(localesDir, 'en');
    if (fs.existsSync(enDir)) {
      try {
        const enFiles = fs.readdirSync(enDir);
        for (const ef of enFiles) {
          if (ef !== 'common.ts' && ef !== 'index.ts' && (ef.endsWith('.ts') || ef.endsWith('.js'))) {
            report(
              'RULE-I18N-002',
              path.join(enDir, ef),
              1,
              1,
              `File từ điển "en/${ef}" vi phạm nguyên lý Natural Fallback Pattern. Toàn bộ Translation Key đã là tiếng Anh chuẩn và tự động fallback (?? key).`,
              `Xóa bỏ "src/locales/en/${ef}" để tiết kiệm dung lượng file và tránh duplicate boilerplate. Chỉ cần khai báo bản dịch tại "src/locales/vi/".`,
              `src/locales/en/${ef}`,
              PRIORITIES.MEDIUM,
              'en-boilerplate-prohibited'
            );
          }
        }
      } catch (_) {}
    }

    // 2. Unused Keys Check in vi/common.ts
    const viCommonPath = path.join(localesDir, 'vi', 'common.ts');
    if (fs.existsSync(viCommonPath)) {
      try {
        const viContent = fs.readFileSync(viCommonPath, 'utf8');
        const lines = viContent.split('\n');
        const keysToCheck = [];

        lines.forEach((lineText, idx) => {
          const m = lineText.match(/^\s*(?:'([^']+)'|"([^"]+)"|([a-zA-Z0-9_-]+))\s*:/);
          if (m) {
            const k = m[1] || m[2] || m[3];
            if (k && k !== 'common' && !k.startsWith('//') && k.length > 2) {
              keysToCheck.push({ key: k, line: idx + 1, raw: lineText.trim() });
            }
          }
        });

        if (keysToCheck.length > 0) {
          // Collect text across all project source files to prevent false positives
          let allSrcText = '';
          const srcDir = path.join(projectRoot, 'src');
          if (fs.existsSync(srcDir)) {
            const scanSrcForText = (dir) => {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const ent of entries) {
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) {
                  if (ent.name !== 'locales' && ent.name !== 'node_modules' && ent.name !== 'dist') {
                    scanSrcForText(full);
                  }
                } else if (/\.(?:tsx?|jsx?)$/.test(ent.name)) {
                  allSrcText += fs.readFileSync(full, 'utf8') + '\n';
                }
              }
            };
            scanSrcForText(srcDir);
          }

          for (const { key, line, raw } of keysToCheck) {
            if (!allSrcText.includes(key)) {
              report(
                'RULE-I18N-002',
                viCommonPath,
                line,
                1,
                `Translation key "${key}" không được bất kỳ file nào trong src/ sử dụng.`,
                `Xóa bỏ translation key "${key}" để giảm kích thước bundle.`,
                raw,
                PRIORITIES.MEDIUM,
                'unused-locale-key'
              );
            }
          }
        }
      } catch (_) {}
    }
  }
}
