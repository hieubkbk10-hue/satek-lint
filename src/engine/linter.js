/**
 * ============================================================================
 * UNIVERSAL LINTER CORE ENGINE (V3 AST ADVISORY ARCHITECTURE)
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { detectProject } from './detector.js';
import { loadConfig } from './config.js';
import { LintContext } from './context.js';
import { AstParser } from './parser.js';
import { CssParser } from './css-parser.js';
import { ModuleResolver } from './module-resolver.js';
import { ImportGraph } from './import-graph.js';
import { FactExtractor } from './facts.js';
import { RepositoryReader } from './repository.js';
import { runAllRulePacks } from './rule-runner.js';
import { RULES } from '../rules/catalog.js';

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'routeTree.gen.ts',
];

export function collectFiles(customPath = null, targetDir = process.cwd(), customIgnore = []) {
  const files = [];
  const ignorePatterns = Array.from(new Set([...DEFAULT_IGNORE_PATTERNS, ...(customIgnore || [])]));

  function isPathIgnored(targetPath) {
    const norm = path.normalize(targetPath).replace(/\\/g, '/');
    const segments = norm.split('/');
    const fileName = segments[segments.length - 1];

    for (const pat of ignorePatterns) {
      const cleanPat = pat.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      if (!cleanPat) continue;
      // Segment match (e.g. 'node_modules', 'dist', 'build')
      if (segments.includes(cleanPat)) return true;
      // Exact filename match (e.g. 'routeTree.gen.ts')
      if (fileName === cleanPat) return true;
      // Ends with pattern
      if (norm.endsWith('/' + cleanPat) || norm === cleanPat) return true;
    }
    return false;
  }

  function scan(currentPath) {
    if (!fs.existsSync(currentPath)) return;
    if (isPathIgnored(currentPath)) return;

    const stat = fs.statSync(currentPath);

    if (stat.isDirectory()) {
      const items = fs.readdirSync(currentPath);
      for (const item of items) {
        scan(path.join(currentPath, item));
      }
    } else if (
      currentPath.endsWith('.tsx') ||
      currentPath.endsWith('.ts') ||
      currentPath.endsWith('.jsx') ||
      currentPath.endsWith('.js')
    ) {
      files.push(path.normalize(currentPath));
    }
  }

  if (customPath) {
    let resolved = null;
    if (fs.existsSync(customPath)) {
      resolved = path.resolve(customPath);
    } else {
      const candidateInTarget = path.resolve(targetDir, customPath);
      if (fs.existsSync(candidateInTarget)) {
        resolved = candidateInTarget;
      }
    }

    if (resolved) {
      scan(resolved);
      return files;
    }
  }

  scan(targetDir);
  return files;
}

export async function runLintEngine(options = {}) {
  const cwd = options.cwd || process.cwd();
  const scanTarget = options.path ? path.resolve(cwd, options.path) : cwd;
  const projectInfo = detectProject(scanTarget);
  const targetRoot = projectInfo.projectRoot || cwd;
  const targetDir = options.path ? scanTarget : (projectInfo.srcDir || targetRoot);
  const config = loadConfig(targetRoot, options.config);

  // Thu thập danh sách files (truyền config.ignore)
  const files = collectFiles(options.path, targetDir, config.ignore);

  // Khởi tạo LintContext
  const context = new LintContext({
    cwd,
    projectRoot: targetRoot,
    config,
    files,
    projectInfo,
    options,
  });

  // Khởi tạo và gắn các analysis services
  const parser = new AstParser(context);
  const cssParser = new CssParser(context);
  const resolver = new ModuleResolver(targetRoot);
  const importGraph = new ImportGraph(targetRoot, resolver);
  const facts = new FactExtractor(parser);
  const repository = new RepositoryReader(targetRoot);

  context.parser = parser;
  context.cssParser = cssParser;
  context.resolver = resolver;
  context.importGraph = importGraph;
  context.facts = facts;
  context.repository = repository;

  // Thực thi 6 Rule Packs
  const packResults = await runAllRulePacks(context);
  const allFindings = packResults.findings;

  // Nhóm vi phạm theo tệp tin để tương thích reporter & TUI
  const fileViolationsMap = new Map();
  for (const f of files) {
    fileViolationsMap.set(f, []);
  }

  for (const finding of allFindings) {
    const fPath = finding.location.path || 'project';
    if (!fileViolationsMap.has(fPath)) {
      fileViolationsMap.set(fPath, []);
    }
    const ruleDef = RULES.find((r) => r.code === finding.ruleCode);
    fileViolationsMap.get(fPath).push({
      line: finding.location.line,
      column: finding.location.column,
      ruleCode: finding.ruleCode,
      ruleName: ruleDef ? ruleDef.name : finding.ruleCode,
      category: ruleDef ? ruleDef.category : 'Architecture',
      severity: finding.priority,
      priority: finding.priority,
      confidence: finding.confidence,
      matchedText: finding.evidence,
      codeSnippet: finding.message,
      fix: finding.suggestion,
      evidence: finding.evidence,
      requirementIds: finding.requirementIds,
    });
  }

  const results = [];
  let totalViolations = 0;
  let filesWithViolations = 0;
  const byPriority = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };

  for (const [fPath, violations] of fileViolationsMap.entries()) {
    const rel = path.relative(projectInfo.projectRoot || cwd, fPath).replace(/\\/g, '/');
    if (violations.length > 0) {
      filesWithViolations++;
      totalViolations += violations.length;
      for (const v of violations) {
        byPriority[v.priority] = (byPriority[v.priority] || 0) + 1;
      }
    }
    results.push({
      filePath: fPath,
      relativePath: rel || fPath,
      violations,
      compliantCount: 1,
    });
  }

  const totalFiles = files.length;
  const cleanFiles = Math.max(0, totalFiles - filesWithViolations);
  const complianceRate = totalFiles > 0 ? ((cleanFiles / totalFiles) * 100).toFixed(1) : 100;

  return {
    projectInfo,
    results,
    findings: allFindings,
    diagnostics: packResults.diagnostics,
    manualChecks: context.manualChecks,
    coverage: Array.from(context.coverage.entries()).map(([reqId, status]) => ({ id: reqId, status })),
    exemptionsCount: packResults.exemptionsCount,
    timings: packResults.timings,
    emptyDirectories: [],
    deletedDirectories: [],
    summary: {
      totalFiles,
      cleanFiles,
      filesWithViolations,
      totalCompliant: cleanFiles,
      totalViolations,
      byPriority,
      complianceRate,
    },
  };
}
