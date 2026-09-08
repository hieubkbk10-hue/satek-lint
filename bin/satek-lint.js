#!/usr/bin/env node

/**
 * ============================================================================
 * SATEK & UNIVERSAL FRONTEND LINTER CLI
 * ============================================================================
 */

import { runCli } from '../src/cli.js';

runCli(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(3);
});
