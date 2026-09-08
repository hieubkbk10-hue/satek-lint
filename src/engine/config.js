import fs from 'fs';
import path from 'path';

export const DEFAULT_CONFIG = {
  features: [],
  infrastructureModules: ['common', 'layout', 'ui'],
  ignore: [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage',
    'routeTree.gen.ts',
  ],
  publicBarrels: ['@/types', '@/store/api', '@/hooks', '@/utils', '@/helpers'],
  standardsRoot: null,
  endpointMetadata: {},
  exceptions: [], // { ruleCode, path, reason }
};

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(cwd = process.cwd(), explicitConfigPath = null) {
  let targetPath = null;

  if (explicitConfigPath) {
    targetPath = path.isAbsolute(explicitConfigPath)
      ? explicitConfigPath
      : path.resolve(cwd, explicitConfigPath);

    if (!fs.existsSync(targetPath)) {
      throw new ConfigError(`Tệp cấu hình không tồn tại: ${targetPath}`);
    }
  } else {
    const defaultCandidate = path.resolve(cwd, 'satek-linter.config.json');
    if (fs.existsSync(defaultCandidate)) {
      targetPath = defaultCandidate;
    }
  }

  if (!targetPath) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(targetPath, 'utf8');
    const userConfig = JSON.parse(content);
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      infrastructureModules: userConfig.infrastructureModules || DEFAULT_CONFIG.infrastructureModules,
      ignore: Array.from(new Set([...DEFAULT_CONFIG.ignore, ...(userConfig.ignore || [])])),
      publicBarrels: userConfig.publicBarrels || DEFAULT_CONFIG.publicBarrels,
      exceptions: userConfig.exceptions || [],
    };
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError(`Lỗi phân tích cú pháp tệp cấu hình ${targetPath}: ${err.message}`);
  }
}
