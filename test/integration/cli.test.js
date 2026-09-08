import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve('bin/satek-lint.js');

describe('CLI Integration Tests', () => {
  it('should exit with 0 when scanning valid files or reporting findings', async () => {
    const { stdout } = await execFileAsync('node', [CLI_PATH, '--format=json', path.resolve('test/fixtures/SampleComponent.tsx')]);
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.schemaVersion, 3);
    assert.strictEqual(parsed.status, 'complete');
    assert.ok(Array.isArray(parsed.findings));
  });

  it('should exit with 2 when --ci flag is passed', async () => {
    try {
      await execFileAsync('node', [CLI_PATH, '--ci']);
      assert.fail('Should have exited with code 2');
    } catch (err) {
      assert.strictEqual(err.code, 2);
      assert.ok(err.stderr.includes('Cờ --ci và --strict đã bị loại bỏ'));
    }
  });

  it('should exit with 2 when target path does not exist', async () => {
    try {
      await execFileAsync('node', [CLI_PATH, '--path=non_existent_folder_xyz_123']);
      assert.fail('Should have exited with code 2');
    } catch (err) {
      assert.strictEqual(err.code, 2);
      assert.ok(err.stderr.includes('Đường dẫn quét không tồn tại'));
    }
  });

  it('should support --coverage option and output traceability matrix', async () => {
    const { stdout } = await execFileAsync('node', [CLI_PATH, '--coverage']);
    assert.ok(stdout.includes('STANDARDS TRACEABILITY MATRIX'));
  });
});
