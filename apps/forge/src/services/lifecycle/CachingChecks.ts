/**
 * The caching checks of a pipeline being set up, as suggestions only: nothing is installed and no tracked file is edited. Read from the
 * repository's `turbo.json` and the times the gate profiles User started recorded: a slow pipeline with no caching tool, a cache kept per
 * worktree, task inputs blind to what an import graph cannot see, and a gate run past the cache. A `turbo.json` that cannot be read is one
 * suggestion of its own, since User's file is flagged, never guessed at.
 */
import { existsSync, readdirSync } from 'node:fs';
import { isAbsolute, join }        from 'node:path';

import type { TurboConfigurationProblem } from '../../adapters/turbo-configuration/@types/TurboConfigurationProblem.ts';
import {
  TURBO_CONFIGURATION_FILE_NAME,
  type TurboConfiguration,
  TurboConfigurationIngestion,
  type TurboTask
} from '../../adapters/turbo-configuration/TurboConfigurationIngestion.ts';

export type CachingSuggestion =
  | { kind: 'no-caching-tool'; slowGates: { name: string; milliseconds: number }[] }
  | { kind: 'per-worktree-cache'; cacheFolder: string }
  | { kind: 'task-inputs-unseen'; task: string; folders: string[] }
  | { kind: 'gate-not-through-turbo'; gate: string }
  | { kind: 'turbo-configuration-unreadable'; file: string; problem: TurboConfigurationProblem };

/** One recorded gate profile: the gate and how long it ran. A gate profiled in several phases has a time for each. */
export interface RecordedGateTime {
  name:         string;
  milliseconds: number;
}

/** A gate this slow on its slower run is worth a cache. */
export const SLOW_GATE_MILLISECONDS = 30_000;

/** Turbo's own default, inside the worktree, so every worktree builds its cache again. */
const TURBO_DEFAULT_CACHE_FOLDER = '.turbo/cache';

const OTHER_CACHING_TOOL_FILES: readonly string[] = ['nx.json'];

/** What a task reads that its imports never name: a spawned binary, templates and fixtures. */
const UNSEEN_INPUT_FOLDER_NAMES: readonly string[] = ['bin', 'templates', 'fixtures', 'resources'];

const SKIPPED_FOLDER_NAMES: readonly string[] = ['node_modules', '.git'];

const TURBO_DEFAULT_INPUTS = '$TURBO_DEFAULT$';

const TURBO_RUN_PATTERN = /(^|[\s;&|])turbo run \S/;

/** The unseen-input folders at the root and one level down, as paths relative to the repository. */
function unseenInputFoldersOf(repositoryDirectory: string): string[] {
  const found: string[] = [];
  const visit = (relativeFolder: string, depth: number): void => {
    for (const entry of readdirSync(join(repositoryDirectory, relativeFolder), { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIPPED_FOLDER_NAMES.includes(entry.name)) continue;
      const path = relativeFolder === '' ? entry.name : `${relativeFolder}/${entry.name}`;
      if (UNSEEN_INPUT_FOLDER_NAMES.includes(entry.name)) found.push(path);
      if (depth > 0) visit(path, depth - 1);
    }
  };
  visit('', 1);
  return found.sort();
}

/** A task with no `inputs`, or with Turbo's defaults among them, reads every tracked file already. */
function unseenFoldersOfTask(task: TurboTask, folders: readonly string[]): string[] {
  const patterns = task.inputs;
  if (patterns === null || patterns.includes(TURBO_DEFAULT_INPUTS)) return [];
  const roots = patterns.map(patternRootOf).filter((root) => root !== '');
  return folders.filter((folder) => !roots.some((root) => folder === root || folder.startsWith(`${root}/`)));
}

/** The literal folder a glob starts from: `resources/**` covers `resources/templates`. */
function patternRootOf(pattern: string): string {
  return pattern.replace(/^\.\//, '').split(/[*?[{]/)[0]?.replace(/\/+$/, '') ?? '';
}

function taskSuggestionsOf(configuration: TurboConfiguration, folders: readonly string[]): CachingSuggestion[] {
  return configuration.tasks.flatMap((task): CachingSuggestion[] => {
    const unseen = unseenFoldersOfTask(task, folders);
    return unseen.length === 0 ? [] : [{ kind: 'task-inputs-unseen', task: task.name, folders: unseen }];
  });
}

/** Each gate once, with its slowest recorded time, in the order the gates were first recorded. */
function slowestTimeOfEachGate(recordedTimes: readonly RecordedGateTime[]): RecordedGateTime[] {
  const slowest = new Map<string, number>();
  for (const { name, milliseconds } of recordedTimes) slowest.set(name, Math.max(milliseconds, slowest.get(name) ?? 0));
  return [...slowest].map(([name, milliseconds]) => ({ name, milliseconds }));
}

function cachingSuggestionsOf(repositoryDirectory: string, gates: readonly { name: string; run: string }[], recordedTimes: readonly RecordedGateTime[]): CachingSuggestion[] {
  const reading = new TurboConfigurationIngestion(join(repositoryDirectory, TURBO_CONFIGURATION_FILE_NAME)).read();
  if (reading.verdict === 'unreadable') return [{ kind: 'turbo-configuration-unreadable', file: TURBO_CONFIGURATION_FILE_NAME, problem: reading.problem }];
  if (reading.verdict === 'absent') {
    if (OTHER_CACHING_TOOL_FILES.some((file) => existsSync(join(repositoryDirectory, file)))) return [];
    const slowGates = slowestTimeOfEachGate(recordedTimes).filter((gate) => gate.milliseconds >= SLOW_GATE_MILLISECONDS);
    return slowGates.length === 0 ? [] : [{ kind: 'no-caching-tool', slowGates }];
  }
  const { configuration } = reading;
  const cacheFolder = configuration.cacheFolder ?? TURBO_DEFAULT_CACHE_FOLDER;
  return [
    ...isAbsolute(cacheFolder) ? [] : [{ kind: 'per-worktree-cache', cacheFolder } as const],
    ...taskSuggestionsOf(configuration, unseenInputFoldersOf(repositoryDirectory)),
    ...gates.filter((gate) => !TURBO_RUN_PATTERN.test(gate.run)).map((gate) => ({ kind: 'gate-not-through-turbo', gate: gate.name } as const)),
  ];
}

export const CachingChecks = Object.freeze({ cachingSuggestionsOf, unseenInputFoldersOf });
