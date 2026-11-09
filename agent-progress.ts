#!/usr/bin/env bun
/**
 * The binary: with `watcher.ts` and `setup.ts`, one of the three entry files that call `process.exit`, and a module whose
 * import is the invocation, so no spec may import it — `cli/BinarySmoke.integration.spec.ts` spawns it instead.
 */
import { createProcessContext } from './cli/CommandContext.ts';
import { runCommandLine }       from './cli/Main.ts';

process.exit(await runCommandLine(Bun.argv.slice(2), createProcessContext()));
