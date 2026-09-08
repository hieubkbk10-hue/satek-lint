import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import { ModuleResolver } from '../../src/engine/module-resolver.js';

describe('ModuleResolver Unit Tests', () => {
  const resolver = new ModuleResolver(process.cwd());

  it('should identify external packages', () => {
    const res = resolver.resolve(path.resolve('src/cli.js'), 'react');
    assert.strictEqual(res.isExternal, true);
    assert.strictEqual(res.packageName, 'react');
  });

  it('should resolve relative imports with extension probing', () => {
    const res = resolver.resolve(path.resolve('src/cli.js'), './engine/reporter');
    assert.ok(res.resolvedPath, 'Should resolve reporter path');
    assert.ok(res.resolvedPath.endsWith('reporter.js'));
  });

  it('should correctly treat scoped npm packages as external and not collide with @/* alias', () => {
    const res = resolver.resolve(path.resolve('src/cli.js'), '@radix-ui/react-slot');
    assert.strictEqual(res.isExternal, true);
    assert.strictEqual(res.packageName, '@radix-ui/react-slot');
  });
});
