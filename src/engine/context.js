import path from 'path';
import { createFinding, sortFindings, deduplicateFindings } from './findings.js';

export class LintContext {
  constructor({
    cwd = process.cwd(),
    projectRoot = process.cwd(),
    config = {},
    files = [],
    projectInfo = {},
    options = {},
  }) {
    this.cwd = cwd;
    this.projectRoot = projectRoot;
    this.config = config;
    this.files = files;
    this.projectInfo = projectInfo;
    this.options = options;

    this.findings = [];
    this.diagnostics = [];
    this.exemptionsCount = 0;
    this.manualChecks = [];
    this.coverage = new Map(); // requirementId -> status

    // Instances attached by engine
    this.parser = null;
    this.cssParser = null;
    this.resolver = null;
    this.importGraph = null;
    this.repository = null;
    this.facts = null;
    this.includeAll = Boolean(options.all);
    this.normalizedFilesSet = new Set(
      files.map((f) => path.normalize(f).toLowerCase().replace(/\\/g, '/'))
    );
  }

  isExempted(ruleCode, filePath) {
    if (!filePath || !this.config.exceptions || this.config.exceptions.length === 0) {
      return false;
    }
    const rel = path.relative(this.projectRoot, filePath).replace(/\\/g, '/');
    return this.config.exceptions.some((exc) => {
      if (exc.ruleCode !== ruleCode) return false;
      const excPath = (exc.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!excPath) return false;
      return rel === excPath || rel.endsWith('/' + excPath);
    });
  }

  addFinding(findingData) {
    const finding = createFinding(findingData);

    // 1. Noise reduction: Exclude RULE-RADIUS-001 and RULE-I18N-* unless --all is specified
    if (!this.includeAll) {
      if (finding.ruleCode === 'RULE-RADIUS-001' || finding.ruleCode.startsWith('RULE-I18N-')) {
        return;
      }
    }

    // 2. Scope filter: When a specific path is being scanned, don't report findings on files outside scope
    if (this.options.path && finding.location && finding.location.path) {
      const locPath = finding.location.path;
      const isProjectLevel = locPath === 'project' || locPath === this.projectRoot;
      if (!isProjectLevel) {
        const normLoc = path.normalize(locPath).toLowerCase().replace(/\\/g, '/');
        if (!this.normalizedFilesSet.has(normLoc)) {
          return;
        }
      }
    }

    if (this.isExempted(finding.ruleCode, finding.location.path)) {
      this.exemptionsCount++;
      return;
    }
    this.findings.push(finding);
  }

  addDiagnostic(diagnostic) {
    this.diagnostics.push({
      type: diagnostic.type || 'error',
      file: diagnostic.file || '',
      message: diagnostic.message || '',
      line: diagnostic.line || 1,
      column: diagnostic.column || 1,
    });
  }

  recordRequirement(requirementId, status = 'checked') {
    this.coverage.set(requirementId, status);
  }

  getProcessedFindings() {
    return sortFindings(deduplicateFindings(this.findings));
  }
}
