import path from 'path';
import { runSourceAstPack } from '../rules/packs/source-ast/index.js';
import { runModuleGraphPack } from '../rules/packs/module-graph/index.js';
import { runQueryContractPack } from '../rules/packs/query-contract/index.js';
import { runListPagePack } from '../rules/packs/list-page/index.js';
import { runRepositoryPack } from '../rules/packs/repository/index.js';
import { runHeuristicAndManualPack } from '../rules/packs/heuristic-and-manual/index.js';

export async function runAllRulePacks(context) {
  const timings = {
    startMs: Date.now(),
  };

  // 1. Source AST Pack (quét từng file theo AST)
  const astStart = Date.now();
  for (const filePath of context.files) {
    runSourceAstPack(context, filePath);
  }
  timings.astMs = Date.now() - astStart;

  // 2. Module Graph Pack (quét đồ thị phụ thuộc và cấu trúc public barrel)
  const graphStart = Date.now();
  runModuleGraphPack(context);
  timings.graphMs = Date.now() - graphStart;

  // 3. Query Contract Pack (quét RTK Query endpoints, query grammar, cache tags)
  const queryStart = Date.now();
  for (const filePath of context.files) {
    runQueryContractPack(context, filePath);
  }
  timings.queryMs = Date.now() - queryStart;

  // 4. List Page Pack (quét ListPage table & filters)
  const listStart = Date.now();
  for (const filePath of context.files) {
    runListPagePack(context, filePath);
  }
  timings.listMs = Date.now() - listStart;

  // 5. Repository Pack (quét config, git metadata, husky - chỉ khi quét root project hoặc chạy CI)
  const isTargetingSubpath = context.options.path && path.resolve(context.cwd, context.options.path) !== context.projectRoot;
  if (!isTargetingSubpath || context.options.ci) {
    const repoStart = Date.now();
    await runRepositoryPack(context);
    timings.repoMs = Date.now() - repoStart;
  }

  // 6. Heuristic & Manual Pack
  const hmStart = Date.now();
  runHeuristicAndManualPack(context);
  timings.heuristicMs = Date.now() - hmStart;

  timings.totalMs = Date.now() - timings.startMs;
  return {
    findings: context.getProcessedFindings(),
    diagnostics: context.diagnostics,
    exemptionsCount: context.exemptionsCount,
    timings,
  };
}
