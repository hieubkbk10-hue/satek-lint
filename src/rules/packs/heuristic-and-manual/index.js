import path from 'path';
import { PRIORITIES } from '../../../engine/findings.js';

export function runHeuristicAndManualPack(context) {
  // 1. RULE-HELPER-001: Utils vs Helpers separation
  // Check if any file in src/utils imports domain components or store API
  for (const filePath of context.files) {
    const norm = path.normalize(filePath).replace(/\\/g, '/');
    if (norm.includes('/src/utils/') && !norm.includes('/src/helpers/')) {
      const node = context.importGraph ? context.importGraph.getNode(filePath) : null;
      if (node) {
        for (const imp of node.imports) {
          const spec = imp.specifier;
          if (spec.startsWith('@/components/') || spec.startsWith('@/store/api') || spec.startsWith('@/store/slices')) {
            context.addFinding({
              ruleCode: 'RULE-HELPER-001',
              subcheck: 'domain-import-in-utils',
              requirementIds: [],
              priority: PRIORITIES.LOW,
              confidence: 'heuristic',
              location: { path: filePath, line: 1, column: 1 },
              message: `Tệp tiện ích thuần túy "${path.basename(filePath)}" trong "src/utils/" không nên phụ thuộc vào domain entity, component hoặc store API ("${spec}").`,
              suggestion: 'Di chuyển hàm có tính chất nghiệp vụ sang "src/helpers/" và export qua "src/helpers/index.ts".',
              evidence: spec,
            });
          }
        }
      }
    }
  }

  // 2. Initialize Manual Checklist
  context.manualChecks = [
    {
      id: 'MANUAL-PR-001',
      description: 'PR source là dev_*, target develop/staging, tiêu đề theo Conventional Commits, nội dung mô tả đầy đủ ticket và checklist kiểm thử.',
      status: 'pending_verification',
    },
    {
      id: 'MANUAL-PR-002',
      description: 'PR có ít nhất 1 phê duyệt độc lập từ đồng nghiệp; kiểm tra kỹ any, circular imports và phân quyền.',
      status: 'pending_verification',
    },
    {
      id: 'MANUAL-PR-003',
      description: 'Thực hiện Squash and Merge và tự động xóa remote branch sau khi merge thành công.',
      status: 'pending_verification',
    },
    {
      id: 'MANUAL-GATE-001',
      description: 'Toàn bộ build, lint, typecheck và format đã chạy và pass trên CI trước khi merge; hotfix bypass cần Tech Lead approval.',
      status: 'pending_verification',
    },
    {
      id: 'MANUAL-API-001',
      description: 'Xác nhận endpoint, relations và fields thực tế tồn tại trên backend; backend đã sẵn sàng tích hợp.',
      status: 'pending_verification',
    },
    {
      id: 'MANUAL-SEMANTIC-001',
      description: 'Tên biến, ngữ nghĩa domain và logic tính toán đúng nghiệp vụ; identifier hoàn toàn bằng tiếng Anh.',
      status: 'pending_verification',
    },
    {
      id: 'MANUAL-RUNTIME-001',
      description: 'Xác minh realtime queue, focus recovery và thứ tự hiển thị modal/dialog trên môi trường runtime thực tế.',
      status: 'pending_verification',
    },
    {
      id: 'MANUAL-FEATURE-001',
      description: 'Thực hiện đúng 6 bước SOP trong quy trình phát triển tính năng (chuẩn bị API, route, page orchestrator, tests).',
      status: 'pending_verification',
    },
  ];
}
