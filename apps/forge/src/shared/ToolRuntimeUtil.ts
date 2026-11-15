/**
 * The Bun arguments that start this tool apart from its working directory: Bun loads the working directory's `bunfig.toml` (its preload
 * included) and `.env` into every process it starts, and a tracked repository's preload or variables must never run inside the tool.
 */
import { join } from 'node:path';

const TOOL_BUNFIG_FILE_NAME = 'bunfig.toml';

function isolatingArgumentsFor(toolDirectory: string): string[] {
  // The `=` form: `-c <file>` with a space still loads the working directory's bunfig.
  return ['--no-env-file', `--config=${join(toolDirectory, TOOL_BUNFIG_FILE_NAME)}`];
}

export const ToolRuntimeUtil = Object.freeze({
  /** For the checkout at `toolDirectory`, whose root holds `agent-progress.ts` and the tool's own `bunfig.toml`. */
  isolatingArgumentsFor,
  isolatingArgumentsOfThisCheckout: (): string[] => isolatingArgumentsFor(join(import.meta.dir, '..', '..')),
});
