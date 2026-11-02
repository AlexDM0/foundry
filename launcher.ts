/**
 * The installed command. `setup.ts` compiles it with Bun's autoload of the working directory's bunfig and `.env` switched off, so a
 * tracked repository's preload or variables never run in it, and it starts `agent-progress.ts` on the Bun and checkout it was compiled
 * against, with that autoload off too, passing its streams, arguments and exit code through.
 */
import { constants } from 'node:os';
import { join }      from 'node:path';

import { ToolRuntimeUtil } from './src/shared/ToolRuntimeUtil.ts';

/** Both are compiled in by `setup.ts` through `--define`. */
declare const LAUNCHER_BUN_PATH: string;
declare const LAUNCHER_TOOL_DIRECTORY: string;

const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
const SIGNAL_EXIT_CODE_BASE = 128;

const toolCommand = [
  LAUNCHER_BUN_PATH, ...ToolRuntimeUtil.isolatingArgumentsFor(LAUNCHER_TOOL_DIRECTORY), join(LAUNCHER_TOOL_DIRECTORY, 'agent-progress.ts'), ...process.argv.slice(2)
];
const tool = Bun.spawn(toolCommand, { stdio: ['inherit', 'inherit', 'inherit'], windowsHide: true });
for (const signal of FORWARDED_SIGNALS) process.on(signal, () => tool.kill(signal));
const exitCode = await tool.exited;
process.exitCode = tool.signalCode === null ? exitCode : SIGNAL_EXIT_CODE_BASE + constants.signals[tool.signalCode];
