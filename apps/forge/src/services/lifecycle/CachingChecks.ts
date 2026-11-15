/**
 * The caching checks of a pipeline being set up, as suggestions only: nothing is installed and no tracked file is edited. Read from the
 * repository's `turbo.json` and the times the gate profiles User started recorded: a slow pipeline with no caching tool, a cache kept per
 * worktree, task inputs blind to what an import graph cannot see, and a gate run past the cache.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join }                      from 'node:path';

export type CachingSuggestion =
  | { kind: 'no-caching-tool'; slowGates: { name: string; milliseconds: number }[] }
  | { kind: 'per-worktree-cache'; cacheFolder: string }
  | { kind: 'task-inputs-unseen'; task: string; folders: string[] }
  | { kind: 'gate-not-through-turbo'; gate: string };

/** One recorded gate profile: the gate and how long it ran. A gate profiled in several phases has a time for each. */
export interface RecordedGateTime {
  name:         string;
  milliseconds: number;
}

/** A gate this slow on its slower run is worth a cache. */
export const SLOW_GATE_MILLISECONDS = 30_000;

/** Turbo's own default, inside the worktree, so every worktree builds its cache again. */
const TURBO_DEFAULT_CACHE_FOLDER = '.turbo/cache';

const TURBO_CONFIGURATION_FILE = 'turbo.json';

const OTHER_CACHING_TOOL_FILES: readonly string[] = ['nx.json'];

/** What a task reads that its imports never name: a spawned binary, templates and fixtures. */
const UNSEEN_INPUT_FOLDER_NAMES: readonly string[] = ['bin', 'templates', 'fixtures', 'resources'];

const SKIPPED_FOLDER_NAMES: readonly string[] = ['node_modules', '.git'];

const TURBO_DEFAULT_INPUTS = '$TURBO_DEFAULT$';

const TURBO_RUN_PATTERN = /(^|[\s;&|])turbo run \S/;

interface TurboConfiguration {
  cacheDir?: unknown;
  tasks?:    unknown;
  pipeline?: unknown;
}

function turboConfigurationOf(repositoryDirectory: string): TurboConfiguration | null {
  const path = join(repositoryDirectory, TURBO_CONFIGURATION_FILE);
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed as TurboConfiguration : {};
  } catch {
    return {};
  }
}

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
function unseenFoldersOfTask(task: unknown, folders: readonly string[]): string[] {
  if (typeof task !== 'object' || task === null || !Object.hasOwn(task, 'inputs')) return [];
  const { inputs } = (task as { inputs: unknown });
  if (!Array.isArray(inputs)) return [];
  const patterns = inputs.filter((input): input is string => typeof input === 'string');
  if (patterns.includes(TURBO_DEFAULT_INPUTS)) return [];
  const roots = patterns.map(patternRootOf).filter((root) => root !== '');
  return folders.filter((folder) => !roots.some((root) => folder === root || folder.startsWith(`${root}/`)));
}

/** The literal folder a glob starts from: `resources/**` covers `resources/templates`. */
function patternRootOf(pattern: string): string {
  return pattern.replace(/^\.\//, '').split(/[*?[{]/)[0]?.replace(/\/+$/, '') ?? '';
}

function taskSuggestionsOf(configuration: TurboConfiguration, folders: readonly string[]): CachingSuggestion[] {
  const tasks = configuration.tasks ?? configuration.pipeline;
  if (typeof tasks !== 'object' || tasks === null) return [];
  return Object.entries(tasks).flatMap(([task, definition]): CachingSuggestion[] => {
    const unseen = unseenFoldersOfTask(definition, folders);
    return unseen.length === 0 ? [] : [{ kind: 'task-inputs-unseen', task, folders: unseen }];
  });
}

/** Each gate once, with its slowest recorded time, in the order the gates were first recorded. */
function slowestTimeOfEachGate(recordedTimes: readonly RecordedGateTime[]): RecordedGateTime[] {
  const slowest = new Map<string, number>();
  for (const { name, milliseconds } of recordedTimes) slowest.set(name, Math.max(milliseconds, slowest.get(name) ?? 0));
  return [...slowest].map(([name, milliseconds]) => ({ name, milliseconds }));
}

function cachingSuggestionsOf(repositoryDirectory: string, gates: readonly { name: string; run: string }[], recordedTimes: readonly RecordedGateTime[]): CachingSuggestion[] {
  const configuration = turboConfigurationOf(repositoryDirectory);
  if (configuration === null) {
    if (OTHER_CACHING_TOOL_FILES.some((file) => existsSync(join(repositoryDirectory, file)))) return [];
    const slowGates = slowestTimeOfEachGate(recordedTimes).filter((gate) => gate.milliseconds >= SLOW_GATE_MILLISECONDS);
    return slowGates.length === 0 ? [] : [{ kind: 'no-caching-tool', slowGates }];
  }
  const cacheFolder = typeof configuration.cacheDir === 'string' ? configuration.cacheDir : TURBO_DEFAULT_CACHE_FOLDER;
  return [
    ...isAbsolute(cacheFolder) ? [] : [{ kind: 'per-worktree-cache', cacheFolder } as const],
    ...taskSuggestionsOf(configuration, unseenInputFoldersOf(repositoryDirectory)),
    ...gates.filter((gate) => !TURBO_RUN_PATTERN.test(gate.run)).map((gate) => ({ kind: 'gate-not-through-turbo', gate: gate.name } as const)),
  ];
}

export const CachingChecks = Object.freeze({ cachingSuggestionsOf, unseenInputFoldersOf });
