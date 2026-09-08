export const PRIORITIES = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO',
};

const PRIORITY_ORDER = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  INFO: 3,
};

function redactSensitiveData(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/(?:bearer\s+|token\s*[:=]\s*['"]?)[a-zA-Z0-9._-]{20,}/gi, 'Bearer [REDACTED]')
    .replace(/(?:password|secret|apikey|api_key)\s*[:=]\s*['"][^'"]+['"]/gi, 'secret="[REDACTED]"');
}

export function createFinding({
  ruleCode,
  subcheck = '',
  requirementIds = [],
  priority = PRIORITIES.MEDIUM,
  confidence = 'proven', // 'proven' | 'heuristic'
  location = { path: '', line: 1, column: 1 },
  message = '',
  evidence = '',
  suggestion = '',
}) {
  return {
    ruleCode,
    subcheck,
    requirementIds: Array.isArray(requirementIds) ? requirementIds : [requirementIds],
    priority: PRIORITIES[priority] || PRIORITIES.MEDIUM,
    confidence: confidence === 'heuristic' ? 'heuristic' : 'proven',
    location: {
      path: location.path || '',
      line: Math.max(1, location.line || 1),
      column: Math.max(1, location.column || 1),
    },
    message,
    evidence: redactSensitiveData(evidence),
    suggestion,
  };
}

export function sortFindings(findings = []) {
  return [...findings].sort((a, b) => {
    const pA = PRIORITY_ORDER[a.priority] ?? 99;
    const pB = PRIORITY_ORDER[b.priority] ?? 99;
    if (pA !== pB) return pA - pB;

    const pathCompare = a.location.path.localeCompare(b.location.path);
    if (pathCompare !== 0) return pathCompare;

    if (a.location.line !== b.location.line) return a.location.line - b.location.line;
    if (a.location.column !== b.location.column) return a.location.column - b.location.column;
    return a.ruleCode.localeCompare(b.ruleCode);
  });
}

export function deduplicateFindings(findings = []) {
  const seen = new Set();
  const result = [];
  for (const f of findings) {
    const key = `${f.ruleCode}:${f.subcheck}:${f.location.path}:${f.location.line}:${f.location.column}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(f);
    }
  }
  return result;
}
