import fs from 'fs';
import path from 'path';
import ts from 'typescript';

function safeParseJson(cand, raw) {
  try {
    const result = ts.parseConfigFileTextToJson(cand, raw);
    if (!result.error && result.config) {
      return result.config;
    }
  } catch (_) {}

  try {
    // Safe fallback regex: does not strip // inside quoted strings like https://
    const stripped = raw.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? '' : m));
    return JSON.parse(stripped);
  } catch (_) {
    return null;
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class ModuleResolver {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.pathsConfig = [];
    this.baseUrl = projectRoot;
    this.resolutionCache = new Map();
    this.initTsConfig();
  }

  initTsConfig() {
    const candidates = [
      path.join(this.projectRoot, 'tsconfig.app.json'),
      path.join(this.projectRoot, 'tsconfig.json'),
      path.join(this.projectRoot, 'jsconfig.json'),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        try {
          const raw = fs.readFileSync(cand, 'utf8');
          const parsed = safeParseJson(cand, raw);
          if (!parsed) continue;

          let compilerOptions = parsed.compilerOptions || {};

          // Handle extends if compilerOptions.paths is not in this file
          if (!compilerOptions.paths && parsed.extends) {
            const extPath = path.resolve(path.dirname(cand), parsed.extends);
            if (fs.existsSync(extPath)) {
              const extRaw = fs.readFileSync(extPath, 'utf8');
              const extParsed = safeParseJson(extPath, extRaw);
              if (extParsed) {
                compilerOptions = { ...(extParsed.compilerOptions || {}), ...compilerOptions };
              }
            }
          }

          if (compilerOptions.baseUrl) {
            this.baseUrl = path.resolve(this.projectRoot, compilerOptions.baseUrl);
          } else {
            this.baseUrl = this.projectRoot;
          }

          if (compilerOptions.paths) {
            for (const [key, targetList] of Object.entries(compilerOptions.paths)) {
              const rawTargets = Array.isArray(targetList) ? targetList : [targetList];
              if (key.includes('*')) {
                const parts = key.split('*');
                const prefix = parts[0];
                const suffix = parts[1] || '';
                const regex = new RegExp(`^${escapeRegex(prefix)}(.*)${escapeRegex(suffix)}$`);
                const cleanTargets = rawTargets.map((t) => t.replace(/\*$/, ''));
                this.pathsConfig.push({ key, regex, cleanTargets, hasStar: true });
              } else {
                const regex = new RegExp(`^${escapeRegex(key)}$`);
                this.pathsConfig.push({ key, regex, cleanTargets: rawTargets, hasStar: false });
              }
            }
          }
          break;
        } catch (_) {
          // Fallback to default baseUrl
        }
      }
    }

    // Default fallback alias for @/ -> src/ if no paths config found
    if (this.pathsConfig.length === 0 && fs.existsSync(path.join(this.projectRoot, 'src'))) {
      this.pathsConfig.push({
        key: '@/*',
        regex: /^@\/(.*)$/,
        cleanTargets: ['./src/'],
        hasStar: true,
      });
    }
  }

  probeExtensions(candidatePath) {
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      return candidatePath;
    }

    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'];
    for (const ext of extensions) {
      const withExt = candidatePath + ext;
      if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
        return withExt;
      }
    }

    const indexExtensions = [
      'index.ts',
      'index.tsx',
      'index.js',
      'index.jsx',
      'index.mts',
      'index.cts',
    ];
    for (const idx of indexExtensions) {
      const withIndex = path.join(candidatePath, idx);
      if (fs.existsSync(withIndex) && fs.statSync(withIndex).isFile()) {
        return withIndex;
      }
    }

    return null;
  }

  resolve(importerFile, specifier) {
    if (!specifier || typeof specifier !== 'string') {
      return { resolvedPath: null, isExternal: false };
    }

    const cacheKey = `${path.dirname(importerFile)}||${specifier}`;
    if (this.resolutionCache.has(cacheKey)) {
      return this.resolutionCache.get(cacheKey);
    }

    // 1. Relative import (./ or ../)
    if (specifier.startsWith('.')) {
      const dir = path.dirname(importerFile);
      const absCand = path.resolve(dir, specifier);
      const found = this.probeExtensions(absCand);
      const result = { resolvedPath: found ? path.normalize(found) : null, isExternal: false };
      this.resolutionCache.set(cacheKey, result);
      return result;
    }

    // 2. Tsconfig paths aliases
    for (const { regex, cleanTargets } of this.pathsConfig) {
      const match = specifier.match(regex);
      if (match) {
        const subPath = match[1] || '';
        for (const target of cleanTargets) {
          const candBase = path.resolve(this.baseUrl, target);
          const candidate = subPath ? path.join(candBase, subPath) : candBase;
          const found = this.probeExtensions(candidate);
          if (found) {
            const result = { resolvedPath: path.normalize(found), isExternal: false };
            this.resolutionCache.set(cacheKey, result);
            return result;
          }
        }
      }
    }

    // 3. Absolute path within project
    if (path.isAbsolute(specifier)) {
      const found = this.probeExtensions(specifier);
      const result = { resolvedPath: found ? path.normalize(found) : null, isExternal: false };
      this.resolutionCache.set(cacheKey, result);
      return result;
    }

    // 4. External node package
    const result = { resolvedPath: null, isExternal: true, packageName: specifier };
    this.resolutionCache.set(cacheKey, result);
    return result;
  }
}
