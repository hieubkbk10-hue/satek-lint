/**
 * ============================================================================
 * PROJECT DETECTOR ENGINE
 * Tự động phát hiện cấu trúc dự án (React, Vite, Next.js, Tailwind, Router)
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';

export function detectProject(targetDir = process.cwd()) {
  let current = path.resolve(targetDir);
  if (fs.existsSync(current) && !fs.statSync(current).isDirectory()) {
    current = path.dirname(current);
  }
  let projectRoot = null;

  // 1. Tìm root chứa package.json hoặc src
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'package.json')) || fs.existsSync(path.join(current, 'src'))) {
      projectRoot = current;
      break;
    }
    current = path.dirname(current);
  }

  if (!projectRoot) {
    projectRoot = path.resolve(targetDir);
    if (fs.existsSync(projectRoot) && !fs.statSync(projectRoot).isDirectory()) {
      projectRoot = path.dirname(projectRoot);
    }
  }

  const srcDir = fs.existsSync(path.join(projectRoot, 'src'))
    ? path.join(projectRoot, 'src')
    : projectRoot;

  let pkg = {};
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch {
      pkg = {};
    }
  }

  // 2. Phát hiện các công nghệ sử dụng
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  const hasReact = Boolean(deps['react'] || deps['react-dom']);
  const hasTailwind =
    Boolean(deps['tailwindcss'] || deps['@tailwindcss/vite']) ||
    fs.existsSync(path.join(projectRoot, 'tailwind.config.js')) ||
    fs.existsSync(path.join(projectRoot, 'tailwind.config.ts')) ||
    fs.existsSync(path.join(srcDir, 'index.css')) ||
    fs.existsSync(path.join(srcDir, 'globals.css'));

  const hasTanstackRouter =
    Boolean(deps['@tanstack/react-router']) ||
    fs.existsSync(path.join(srcDir, 'routes')) ||
    fs.existsSync(path.join(srcDir, 'routeTree.gen.ts'));

  const hasNextJs = Boolean(deps['next']);

  return {
    projectRoot,
    srcDir,
    pkg,
    hasReact,
    hasTailwind,
    hasTanstackRouter,
    hasNextJs,
  };
}
