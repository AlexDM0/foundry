/**
 * `Bun.build` as `src/services/overseer/WatcherBundle.ts` calls it, answered only with what the real build answered under
 * `bun run record src/services/overseer/WatcherBundle.ts`. An entry is named by its placeholder; an entry with no recorded answer fails.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import type { BoundaryRecording }           from './BoundaryRecordings.ts';
import { recordCommandOf, recordingPathOf } from './BoundaryRecordings.ts';
import { recordAnswer }                     from './RecordedAnswers.ts';

/** `rejected`: the build threw, as Bun's build does for a missing entry or a syntax error, with the messages it carried. */
export type BunBuildAnswer =
  | { readonly kind: 'built'; readonly success: boolean; readonly outputTexts: readonly string[] }
  | { readonly kind: 'rejected'; readonly messages: readonly string[] };

export const BUN_BUILD_RECORDING = {
  BOUNDARY:            'src/services/overseer/WatcherBundle.ts',
  BUILT_ENTRY:         '<an entry that prints one line>',
  SYNTAX_ERROR_ENTRY:  '<an entry with a syntax error>',
  MISSING_ENTRY:       '<a missing entry>',
  SCRATCH_PLACEHOLDER: '<scratch>',
} as const;

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');

export function bunBuildCallShapeOf(entryPlaceholder: string): string {
  return `Bun.build ${entryPlaceholder} target bun format esm`;
}

/** What the real-system spec calls: builds once for real, as the Watcher bundle does, and gives the real answer. */
export async function realBunBuildAnswerOf(entryPath: string): Promise<BunBuildAnswer> {
  try {
    const built = await Bun.build({ entrypoints: [entryPath], target: 'bun', format: 'esm' });
    return { kind: 'built', success: built.success, outputTexts: await Promise.all(built.outputs.map(async (output) => await output.text())) };
  } catch (problem) {
    const errors = problem instanceof AggregateError ? problem.errors : [problem];
    return { kind: 'rejected', messages: errors.map((error) => (error instanceof Error ? error.message : String(error))) };
  }
}

/** The scratch folder becomes `<scratch>` in the answer, so no path of one run is recorded. */
export function recordBunBuildAnswer(entryPlaceholder: string, scratchDirectory: string, answer: BunBuildAnswer): void {
  const shaped = (text: string): string => text.replaceAll(scratchDirectory, BUN_BUILD_RECORDING.SCRATCH_PLACEHOLDER);
  recordAnswer(
    bunBuildCallShapeOf(entryPlaceholder),
    answer.kind === 'built' ? { ...answer, outputTexts: answer.outputTexts.map(shaped) } : { ...answer, messages: answer.messages.map(shaped) },
  );
}

/** In place of `Bun.build`: each entry path given is named by its placeholder, and an entry not given fails. */
export function recordedBunBuildOf(entryPlaceholderOfPath: Readonly<Record<string, string>>): (config: { readonly entrypoints: readonly string[] }) => Promise<Bun.BuildOutput> {
  const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(BUN_BUILD_RECORDING.BOUNDARY, process.platform));
  if (!existsSync(recordingPath)) {
    throw new Error(`no Bun.build answers are recorded for ${process.platform}: run \`${recordCommandOf(BUN_BUILD_RECORDING.BOUNDARY)}\`.`);
  }
  const recording = JSON.parse(readFileSync(recordingPath, 'utf8')) as BoundaryRecording;
  const answers = new Map(recording.answers.map(({ callShape, answer }) => [callShape, answer as BunBuildAnswer]));
  return async ({ entrypoints }) => {
    const [entryPath = ''] = entrypoints;
    const entryPlaceholder = Object.hasOwn(entryPlaceholderOfPath, entryPath) ? entryPlaceholderOfPath[entryPath] : undefined;
    const answer = entryPlaceholder === undefined ? undefined : answers.get(bunBuildCallShapeOf(entryPlaceholder));
    if (answer === undefined) throw new Error(`Bun.build of ${entryPath} has no recorded answer in ${recordingPathOf(BUN_BUILD_RECORDING.BOUNDARY, process.platform)}.`);
    if (answer.kind === 'rejected') return await Promise.reject(new AggregateError(answer.messages.map((message) => new Error(message)), 'Bun.build failed'));
    const outputs = answer.outputTexts.map((text) => ({ text: async () => await Promise.resolve(text) }));
    return { success: answer.success, outputs, logs: [] } as unknown as Bun.BuildOutput;
  };
}
