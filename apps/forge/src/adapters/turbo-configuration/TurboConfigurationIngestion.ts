/**
 * A repository's `turbo.json`, User's Turborepo configuration: the cache folder and each task's inputs, the fields the caching checks read.
 * It is Turborepo's format, so it carries no forge version, and keys forge does not read are left alone.
 */
import { JsonRecordUtil }                 from '../../lib/json-record/JsonRecordUtil.ts';
import { storedFileTextOf }               from '../StoredFileText.ts';
import { StoredValueUtil }                from '../utils/StoredValueUtil.ts';
import type { TurboConfigurationProblem } from './@types/TurboConfigurationProblem.ts';

export const TURBO_CONFIGURATION_FILE_NAME = 'turbo.json';

export interface TurboTask {
  name:   string;
  /** `null` for a task that names no `inputs`, which reads every tracked file. */
  inputs: string[] | null;
}

export interface TurboConfiguration {
  /** `null` where `cacheDir` is not set and Turborepo keeps its default. */
  cacheFolder: string | null;
  tasks:       TurboTask[];
}

export type TurboConfigurationReading =
  | { verdict: 'readable'; configuration: TurboConfiguration }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: TurboConfigurationProblem };

type TaskReading = { verdict: 'readable'; task: TurboTask } | { verdict: 'unreadable'; problem: TurboConfigurationProblem };

function taskReadingOf(name: string, definition: unknown): TaskReading {
  if (!JsonRecordUtil.valueIsAPlainObject(definition)) return { verdict: 'unreadable', problem: { code: 'task-not-an-object', task: name } };
  if (!Object.hasOwn(definition, 'inputs')) return { verdict: 'readable', task: { name, inputs: null } };
  const { inputs } = definition;
  if (!Array.isArray(inputs) || !inputs.every((input) => typeof input === 'string')) {
    return { verdict: 'unreadable', problem: { code: 'task-inputs-not-a-list-of-strings', task: name } };
  }
  return { verdict: 'readable', task: { name, inputs: inputs as string[] } };
}

/** Turborepo 2 names its tasks `tasks`; Turborepo 1 named them `pipeline`. */
function storedTasksOf(document: Readonly<Record<string, unknown>>): { key: 'tasks' | 'pipeline'; value: unknown } | null {
  if (document['tasks'] !== undefined) return { key: 'tasks', value: document['tasks'] };
  if (document['pipeline'] !== undefined) return { key: 'pipeline', value: document['pipeline'] };
  return null;
}

export class TurboConfigurationIngestion {
  constructor(private readonly configurationFilePath: string) {}

  /** Never throws. */
  read(): TurboConfigurationReading {
    const storedText = storedFileTextOf(this.configurationFilePath);
    if (storedText.verdict !== 'readable') return storedText;
    const parsedJson = StoredValueUtil.parsedJsonOf(storedText.text);
    if (parsedJson.verdict === 'unparseable') return { verdict: 'unreadable', problem: parsedJson.problem };
    const document = parsedJson.value;
    if (!JsonRecordUtil.valueIsAPlainObject(document)) return { verdict: 'unreadable', problem: { code: 'not-a-json-object' } };
    const { cacheDir } = document;
    if (cacheDir !== undefined && typeof cacheDir !== 'string') return { verdict: 'unreadable', problem: { code: 'cache-dir-not-a-string', field: 'cacheDir' } };
    const storedTasks = storedTasksOf(document);
    if (storedTasks !== null && !JsonRecordUtil.valueIsAPlainObject(storedTasks.value)) {
      return { verdict: 'unreadable', problem: { code: 'tasks-not-an-object', field: storedTasks.key } };
    }
    const tasks: TurboTask[] = [];
    for (const [name, definition] of Object.entries(storedTasks?.value ?? {})) {
      const taskReading = taskReadingOf(name, definition);
      if (taskReading.verdict === 'unreadable') return taskReading;
      tasks.push(taskReading.task);
    }
    return { verdict: 'readable', configuration: { cacheFolder: cacheDir ?? null, tasks } };
  }
}
