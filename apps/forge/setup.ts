#!/usr/bin/env bun
/**
 * The machine setup entry `setup.sh` and `setup.ps1` hand over to once Bun exists, and `bun run setup` starts: it runs before any command
 * context exists, so it is its own composition root, and a module whose import is the invocation.
 */
import { homedir } from 'node:os';

import { processSetupHostOf } from './cli/setup/ProcessSetupHost.ts';
import { runSetup }           from './cli/setup/Setup.ts';

const host = processSetupHostOf({
  platform: process.platform, checkoutDirectory: import.meta.dir, homeDirectory: homedir(), runningBun: process.execPath
});
process.exit(runSetup(Bun.argv.slice(2), host));
