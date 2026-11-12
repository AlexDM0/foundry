/**
 * The instruction files the pipeline names for a role: its ordered list, or the role's default list where it names none, each entry
 * resolved to a path; an empty list reads the role's built-in brief. A data-folder file is read from disk; any other is tracked, so it is
 * read from the main line, never from a ticket's branch.
 */
import { createHash }   from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { GitProcess }      from '../../lib/git/GitProcess.ts';
import type { Job }        from '../../lib/tracker-model/@types/Job.ts';
import {
  PIPELINE_AGENT_ROLES,
  type InstructionEntry,
  type Pipeline,
  type PipelineAgentRole
} from '../../lib/tracker-model/@types/Pipeline.ts';
import { PipelineUtil }       from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { resourceFilePathOf } from '../../shared/ResourceFilePath.ts';
import { PRODUCT_NAMES }      from '../../shared/constants/ProductNames.ts';
import { PathNestingUtil }    from '../../shared/utils/PathNestingUtil.ts';
import { AssistantBoot }      from './AssistantBoot.ts';
import { LaunchSettings }     from './LaunchSettings.ts';

export const INSTRUCTION_DEFAULTS_FOLDER = `${PRODUCT_NAMES.DATA_FOLDER}/briefs/defaults`;

export const CONSTITUTION_DEFAULT_PATH = `${INSTRUCTION_DEFAULTS_FOLDER}/constitution.md`;

const CONTENT_HASH_LENGTH_CHARACTERS = 16;

export interface InstructionFileRead {
  path:        string;
  contentHash: string;
}

export type InstructionReading =
  | { verdict: 'read'; text: string; files: readonly InstructionFileRead[] }
  | { verdict: 'instructions-missing'; path: string };

export function defaultInstructionPathOf(role: PipelineAgentRole): string {
  return `${INSTRUCTION_DEFAULTS_FOLDER}/${role}.md`;
}

/** A role's built-in brief in the program's `resources/prompts/`: `reReviewer` reads `BuiltInBriefReReviewer.md`. */
export function builtInBriefPathOf(role: PipelineAgentRole): string {
  return resourceFilePathOf('prompts', `BuiltInBrief${role.charAt(0).toUpperCase()}${role.slice(1)}.md`);
}

/**
 * The pipeline role whose files a job reads; `null` for a job no list speaks for. A review past its first round is a re-reviewer, and an
 * Airlock agent reads the list of the role it stands in for.
 */
function instructionRoleOf(job: Readonly<Job>): PipelineAgentRole | null {
  if (AssistantBoot.isAssistantJob(job)) return 'assistant';
  if (job.kind === 'build') return 'builder';
  return LaunchSettings.pipelineRoleOf(job) ?? (job.kind === 'review' ? 'reviewer' : null);
}

function instructionPathOf(pipeline: Readonly<Pipeline> | null, entry: Readonly<InstructionEntry>): string {
  if (entry.kind === 'constitution') return pipeline?.constitution?.path ?? CONSTITUTION_DEFAULT_PATH;
  if (entry.kind === 'default-brief') return defaultInstructionPathOf(entry.role);
  return entry.path;
}

function isDataFolderPath(path: string): boolean {
  return path.startsWith(`${PRODUCT_NAMES.DATA_FOLDER}/`);
}

/** Every tracked file a role's resolved list names, and the constitution, which a branch may change only where its ticket names it. */
function trackedInstructionPathsOf(pipeline: Readonly<Pipeline> | null): string[] {
  const listedPaths = PIPELINE_AGENT_ROLES.flatMap((role) => PipelineUtil.resolvedInstructionsOf(pipeline, role))
    .map((entry) => instructionPathOf(pipeline, entry));
  const named = [...(pipeline?.constitution === undefined ? [] : [pipeline.constitution.path]), ...listedPaths];
  return [...new Set(named.filter((path) => !isDataFolderPath(path)))];
}

/** A path leaving the repository on any host, a backslash included, is read as missing, never followed. */
function fileTextOf(rootDirectory: string, mainLine: string, path: string): string | null {
  if (!PathNestingUtil.relativeWirePathStaysInside(path)) return null;
  if (isDataFolderPath(path)) {
    try {
      return readFileSync(join(rootDirectory, path), 'utf8');
    } catch {
      return null;
    }
  }
  const shown = GitProcess.run(rootDirectory, ['show', `${mainLine}:${path}`]);
  return GitProcess.succeeded(shown) ? shown.standardOutput : null;
}

function contentHashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, CONTENT_HASH_LENGTH_CHARACTERS);
}

/** Part of the program, never of the board, so it records no file read; the program missing it refuses like a missing file. */
function builtInBriefReadingOf(role: PipelineAgentRole): InstructionReading {
  const path = builtInBriefPathOf(role);
  try {
    return { verdict: 'read', text: readFileSync(path, 'utf8'), files: [] };
  } catch {
    return { verdict: 'instructions-missing', path };
  }
}

/**
 * Read whole at each launch, so a changed file, default or pipeline reaches the next launch or resume; one missing file refuses them all. An
 * empty list reads the role's built-in brief, so the agent still knows its job.
 */
function readingFor(rootDirectory: string, mainLine: string, pipeline: Readonly<Pipeline> | null, job: Readonly<Job>): InstructionReading {
  const role = instructionRoleOf(job);
  if (role === null) return { verdict: 'read', text: '', files: [] };
  const entries = PipelineUtil.resolvedInstructionsOf(pipeline, role);
  if (entries.length === 0) return builtInBriefReadingOf(role);
  const texts: string[] = [];
  const files: InstructionFileRead[] = [];
  for (const path of entries.map((entry) => instructionPathOf(pipeline, entry))) {
    const text = fileTextOf(rootDirectory, mainLine, path);
    if (text === null) return { verdict: 'instructions-missing', path };
    texts.push(text.endsWith('\n') ? text : `${text}\n`);
    files.push({ path, contentHash: contentHashOf(text) });
  }
  return { verdict: 'read', text: texts.join('\n'), files };
}

export const InstructionFiles = Object.freeze({ readingFor, trackedInstructionPathsOf, instructionRoleOf });
