import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class RepositoryReader {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = path.normalize(projectRoot);
  }

  readLocalConfigs() {
    const configs = {
      hasPrettier: false,
      prettierConfig: null,
      hasEditorConfig: false,
      editorConfigContent: null,
      hasHusky: false,
      preCommitContent: null,
      commitMsgContent: null,
      packageJson: null,
    };

    // Prettier config
    const prettierCandidates = ['.prettierrc', '.prettierrc.json', '.prettierrc.js', 'prettier.config.js'];
    for (const cand of prettierCandidates) {
      const p = path.join(this.projectRoot, cand);
      if (fs.existsSync(p)) {
        configs.hasPrettier = true;
        try {
          if (cand.endsWith('.json') || cand === '.prettierrc') {
            configs.prettierConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
          }
        } catch (_) {}
        break;
      }
    }

    // EditorConfig
    const ecPath = path.join(this.projectRoot, '.editorconfig');
    if (fs.existsSync(ecPath)) {
      configs.hasEditorConfig = true;
      try {
        configs.editorConfigContent = fs.readFileSync(ecPath, 'utf8');
      } catch (_) {}
    }

    // Husky
    const preCommitPath = path.join(this.projectRoot, '.husky/pre-commit');
    if (fs.existsSync(preCommitPath)) {
      configs.hasHusky = true;
      try {
        configs.preCommitContent = fs.readFileSync(preCommitPath, 'utf8');
      } catch (_) {}
    }
    const commitMsgPath = path.join(this.projectRoot, '.husky/commit-msg');
    if (fs.existsSync(commitMsgPath)) {
      try {
        configs.commitMsgContent = fs.readFileSync(commitMsgPath, 'utf8');
      } catch (_) {}
    }

    // package.json
    const pkgPath = path.join(this.projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        configs.packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      } catch (_) {}
    }

    return configs;
  }

  async readGitMetadata(baseRef = null) {
    const result = {
      isGit: false,
      branch: null,
      recentCommits: [],
      statusShort: [],
      hasRouteTreeModified: false,
    };

    try {
      // 1. Current branch
      const { stdout: branchOut } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: this.projectRoot,
        timeout: 5000,
      });
      result.isGit = true;
      result.branch = branchOut.trim();

      // 2. Status short
      const { stdout: statusOut } = await execFileAsync('git', ['status', '--short'], {
        cwd: this.projectRoot,
        timeout: 5000,
      });
      result.statusShort = statusOut.split('\n').map((l) => l.trim()).filter(Boolean);
      result.hasRouteTreeModified = result.statusShort.some((line) => line.includes('routeTree.gen.ts'));

      // 3. Commits: Only check unpushed commits against remote tracking branch or baseRef
      let unpushedCommits = [];
      try {
        let range = null;
        if (baseRef) {
          range = `${baseRef}..HEAD`;
        } else {
          // Probe upstream tracking branch
          try {
            const { stdout: upstreamOut } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', '@{u}'], {
              cwd: this.projectRoot,
              timeout: 3000,
            });
            const upstream = upstreamOut.trim();
            if (upstream) {
              range = `${upstream}..HEAD`;
            }
          } catch (_) {
            // No upstream configured, try origin/${result.branch}
            try {
              if (result.branch) {
                await execFileAsync('git', ['rev-parse', '--verify', `origin/${result.branch}`], {
                  cwd: this.projectRoot,
                  timeout: 3000,
                });
                range = `origin/${result.branch}..HEAD`;
              }
            } catch (_) {
              // Not on remote yet
            }
          }
        }

        if (range) {
          const { stdout: logOut } = await execFileAsync('git', ['log', range, '--pretty=format:%h%x09%s', '-n', '50'], {
            cwd: this.projectRoot,
            timeout: 5000,
          });

          unpushedCommits = logOut
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .map((line) => {
              const parts = line.split('\t');
              return {
                hash: parts[0] || '',
                subject: parts[1] || '',
              };
            });
        }
      } catch (_) {}

      result.recentCommits = unpushedCommits;
    } catch (_) {
      // Git command failed or not a git repository
      result.isGit = false;
    }

    return result;
  }
}
