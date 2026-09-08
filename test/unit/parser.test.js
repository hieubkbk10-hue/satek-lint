import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { AstParser } from '../../src/engine/parser.js';

describe('AstParser Unit Tests', () => {
  const parser = new AstParser();

  it('should parse TypeScript code and extract AST SourceFile', () => {
    const tempFile = path.resolve('test/fixtures/sample.ts');
    fs.mkdirSync(path.dirname(tempFile), { recursive: true });
    fs.writeFileSync(tempFile, 'export const answer: number = 42;', 'utf8');

    const sourceFile = parser.getSourceFile(tempFile);
    assert.ok(sourceFile, 'SourceFile should be defined');
    assert.strictEqual(sourceFile.statements.length, 1);

    const loc = parser.getNodeLocation(sourceFile.statements[0], sourceFile);
    assert.strictEqual(loc.line, 1);
    assert.strictEqual(loc.column, 1);
  });

  it('should parse TSX code and identify JSX elements', () => {
    const tempFile = path.resolve('test/fixtures/SampleComponent.tsx');
    fs.writeFileSync(tempFile, 'export function Card() { return <div>Card Content</div>; }', 'utf8');

    const sourceFile = parser.getSourceFile(tempFile);
    assert.ok(sourceFile);
    assert.strictEqual(sourceFile.statements.length, 1);
  });
});
