import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { ImportGraph } from '../../src/engine/import-graph.js';
import { ModuleResolver } from '../../src/engine/module-resolver.js';
import { AstParser } from '../../src/engine/parser.js';

describe('ImportGraph Unit Tests', () => {
  const projectRoot = process.cwd();
  const resolver = new ModuleResolver(projectRoot);
  const parser = new AstParser();
  const graph = new ImportGraph(projectRoot, resolver);

  it('should build graph and track consumers', () => {
    const fileA = path.resolve('test/fixtures/FileA.ts');
    const fileB = path.resolve('test/fixtures/FileB.ts');
    fs.mkdirSync(path.dirname(fileA), { recursive: true });

    fs.writeFileSync(fileB, 'export const helper = () => 1;', 'utf8');
    fs.writeFileSync(fileA, "import { helper } from './FileB'; export const useHelper = () => helper();", 'utf8');

    const sfB = parser.getSourceFile(fileB);
    const sfA = parser.getSourceFile(fileA);

    graph.addFile(fileB, sfB);
    graph.addFile(fileA, sfA);

    const nodeB = graph.getNode(fileB);
    assert.ok(nodeB.consumers.has(path.normalize(fileA)), 'FileB should have FileA as consumer');
  });
});
