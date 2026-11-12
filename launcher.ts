/**
 * The installed command. `setup.ts` compiles it with Bun's autoload of the working directory's bunfig and `.env` switched off, so a
 * tracked repository's preload or variables never run in it, and it starts `agent-progress.ts` on the Bun and checkout it was compiled
 * against, with that autoload off too, passing its streams, arguments and exit code through, and its own path in the environment.
 */
import { join } from 'node:path';

import { launchedProgramEnvironment } from './src/shared/Environment.ts';
import { LauncherSignals }            from './src/shared/LauncherSignals.ts';
import { ToolRuntimeUtil }            from './src/shared/ToolRuntimeUtil.ts';

/** Both are compiled in by `setup.ts` through `--define`. */
declare const LAUNCHER_BUN_PATH: string;
declare const LAUNCHER_TOOL_DIRECTORY: string;

const toolCommand = [
  LAUNCHER_BUN_PATH, ...ToolRuntimeUtil.isolatingArgumentsFor(LAUNCHER_TOOL_DIRECTORY), join(LAUNCHER_TOOL_DIRECTORY, 'agent-progress.ts'), ...Bun.argv.slice(2)
];
const tool = Bun.spawn(toolCommand, { stdio: ['inherit', 'inherit', 'inherit'], windowsHide: true, env: launchedProgramEnvironment(process.execPath) });
LauncherSignals.relayStopSignals(process, tool);
const exitCode = await tool.exited;
process.exitCode = LauncherSignals.exitCodeOf(exitCode, tool.signalCode);
