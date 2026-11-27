/**
 * The instruction files the pipeline names for a role: its ordered list, or the role's default list where it names none, each entry
 * resolved to a path; an empty list reads the role's built-in brief. A data-folder file is read from disk; any other is tracked, so it is
 * read from the main line, never from a ticket's branch. Every path here is the project's, mapped to the repository's only where git is asked,
 * and git runs at the repository's root.
 */
import { createHash }   from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import type { Job }        from '../../domain/tracker-model/@types/Job.ts';
import {
  PIPELINE_AGENT_ROLES,
  type EntityKey,
  type InstructionEntry,
  type Pipeline,
  type PipelineAgentRole
} from '../../domain/tracker-model/@types/Pipeline.ts';
import type { MainConstitutionReading, PipelineSetup } from '../../domain/tracker-model/@types/PipelineSetup.ts';
import { PipelineUtil }                                from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { readCurrentBranch }                           from '../../lib/git/BranchIntegration.ts';
import { GitProcess }                                  from '../../lib/git/GitProcess.ts';
import { resourceFilePathOf }                          from '../../shared/ResourceFilePath.ts';
import { PRODUCT_NAMES }                               from '../../shared/constants/ProductNames.ts';
import { PathNestingUtil }                             from '../../shared/utils/PathNestingUtil.ts';
import { ProjectPathsUtil }                            from '../../shared/utils/ProjectPathsUtil.ts';
import { projectLocationOf }                           from '../tracker/ProjectLocation.ts';
import { AssistantBoot }                               from './AssistantBoot.ts';
import { LaunchSettings }                              from './LaunchSettings.ts';

export const INSTRUCTION_DEFAULTS_FOLDER = `${PRODUCT_NAMES.DATA_FOLDER}/briefs/defaults`;

export const CONSTITUTION_DEFAULT_PATH = `${INSTRUCTION_DEFAULTS_FOLDER}/constitution.md`;

/** The tracked constitution at the project's root, which an Apply commits to the main line and points `constitution.path` at. */
export const CONSTITUTION_FILE_PATH = 'CONSTITUTION.md';

const CONTENT_HASH_LENGTH_CHARACTERS = 16;

export interface InstructionFileRead {
  path:        string;
  contentHash: string;
}

/** A project's file as git names it: the repository's root, where git runs, and the file's path from that root. */
export interface ProjectFile {
  repositoryRoot: string;
  repositoryPath: string;
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

function projectFileOf(projectDirectory: string, projectPath: string): ProjectFile {
  const location = projectLocationOf(projectDirectory);
  return { repositoryRoot: location.repositoryRoot, repositoryPath: ProjectPathsUtil.toRepositoryPath(location.projectPrefix, projectPath) };
}

function isDataFolderPath(path: string): boolean {
  return path.startsWith(`${PRODUCT_NAMES.DATA_FOLDER}/`);
}

function namedInstructionPathsOf(pipeline: Readonly<Pipeline> | null): string[] {
  const listedPaths = PIPELINE_AGENT_ROLES.flatMap((role) => PipelineUtil.resolvedInstructionsOf(pipeline, role))
    .map((entry) => instructionPathOf(pipeline, entry));
  return [...(pipeline?.constitution === undefined ? [] : [pipeline.constitution.path]), ...listedPaths];
}

/**
 * Every tracked file a role's resolved list names, and the constitution, the forge's own and each entity's, which a branch may change only
 * where its ticket names it. They are repository paths, as Customs V11 compares them with git's; `projectPrefix` is
 * `ProjectLocation.projectPrefix`, `''` at the root.
 */
function trackedInstructionPathsOf(pipeline: Readonly<Pipeline> | null, projectPrefix = ''): string[] {
  const entities = pipeline?.entities ?? {};
  const entityPipelines = pipeline === null ? [] : Object.keys(entities).flatMap((entityKey) => PipelineUtil.pipelineOfEntity(pipeline, entityKey) ?? []);
  const named = [pipeline, ...entityPipelines].flatMap((eachPipeline) => namedInstructionPathsOf(eachPipeline));
  const trackedProjectPaths = named.filter((path) => !isDataFolderPath(path));
  return [...new Set(trackedProjectPaths.map((projectPath) => ProjectPathsUtil.toRepositoryPath(projectPrefix, projectPath)))];
}

/**
 * Each entity's tracked constitution as a repository path, with the entity whose pipeline names it (`PipelineUtil.pipelineOfEntity`): what
 * Customs V17 holds to its own entity's tickets (E8). None on a pipeline without entities.
 */
function entityConstitutionsOf(pipeline: Readonly<Pipeline> | null, projectPrefix = ''): { entity: EntityKey; gitPath: string }[] {
  if (pipeline === null) return [];
  return Object.keys(pipeline.entities ?? {}).flatMap((entityKey) => {
    const constitutionPath = PipelineUtil.pipelineOfEntity(pipeline, entityKey)?.constitution?.path;
    if (constitutionPath === undefined || isDataFolderPath(constitutionPath)) return [];
    return [{ entity: entityKey, gitPath: ProjectPathsUtil.toRepositoryPath(projectPrefix, constitutionPath) }];
  });
}

type InstructionFileText = { verdict: 'read'; text: string } | { verdict: 'missing' } | { verdict: 'unreadable' };

/**
 * A path leaving the repository on any host, a backslash included, is read as missing, never followed. `mainRevision` is the main line's
 * name or a commit of it. A git that could not be started is `unreadable`, never `missing`, so a caller keeps no answer of it.
 */
function fileTextReadingOf(projectDirectory: string, mainRevision: string, path: string): InstructionFileText {
  if (!PathNestingUtil.relativeWirePathStaysInside(path)) return { verdict: 'missing' };
  if (isDataFolderPath(path)) {
    try {
      return { verdict: 'read', text: readFileSync(join(projectDirectory, path), 'utf8') };
    } catch {
      return { verdict: 'missing' };
    }
  }
  const file = projectFileOf(projectDirectory, path);
  const shown = GitProcess.run(file.repositoryRoot, ['show', `${mainRevision}:${file.repositoryPath}`]);
  if (shown === null) return { verdict: 'unreadable' };
  return GitProcess.succeeded(shown) ? { verdict: 'read', text: shown.standardOutput } : { verdict: 'missing' };
}

function fileTextOf(projectDirectory: string, mainRevision: string, path: string): string | null {
  const reading = fileTextReadingOf(projectDirectory, mainRevision, path);
  return reading.verdict === 'read' ? reading.text : null;
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
 * The pipeline a job reads its constitution and instructions from: its entity's, on a forge with entities, else the forge's own. An entity
 * the pipeline no longer holds sets nothing, so its job reads the installed defaults.
 */
function pipelineOfJob(pipeline: Readonly<Pipeline> | null, job: Readonly<Job>): Readonly<Pipeline> | null {
  if (pipeline === null || job.entity === undefined) return pipeline;
  return PipelineUtil.pipelineOfEntity(pipeline, job.entity);
}

/** A setup record's draft constitution, which a pipeline agent the record serves reads in place of any file; `null`: none drafted yet. */
interface DraftConstitution {
  markdown: string | null;
}

/** The draft of the level whose session the job is: the record's own, or its entity's; `null` when the open record serves no such job. */
function draftConstitutionOf(setup: Readonly<PipelineSetup> | null, job: Readonly<Job>): DraftConstitution | null {
  if (setup === null) return null;
  if (setup.agentJobId === job.id) return { markdown: setup.constitution?.markdown ?? null };
  const servedEntity = Object.values(setup.entities ?? {}).find((part) => part.agentJobId === job.id);
  return servedEntity === undefined ? null : { markdown: servedEntity.constitution?.markdown ?? null };
}

function lineEndedTextOf(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

/**
 * Read whole at each launch, so a changed file, default or pipeline reaches the next launch or resume; one missing file refuses them all. An
 * empty list reads the role's built-in brief, so the agent still knows its job. A job of an entity reads that entity's list and constitution.
 * A pipeline agent that the open setup record serves reads the record's draft constitution, never a file, and none while nothing is drafted.
 */
function readingFor(
  projectDirectory: string,
  mainLine: string,
  pipeline: Readonly<Pipeline> | null,
  job: Readonly<Job>,
  setup: Readonly<PipelineSetup> | null = null,
): InstructionReading {
  const role = instructionRoleOf(job);
  if (role === null) return { verdict: 'read', text: '', files: [] };
  const jobPipeline = pipelineOfJob(pipeline, job);
  const entries = PipelineUtil.resolvedInstructionsOf(jobPipeline, role);
  if (entries.length === 0) return builtInBriefReadingOf(role);
  const draftConstitution = role === 'pipelineAgent' ? draftConstitutionOf(setup, job) : null;
  const texts: string[] = [];
  const files: InstructionFileRead[] = [];
  for (const entry of entries) {
    if (entry.kind === 'constitution' && draftConstitution !== null) {
      if (draftConstitution.markdown !== null) texts.push(lineEndedTextOf(draftConstitution.markdown));
      continue;
    }
    const path = instructionPathOf(jobPipeline, entry);
    const text = fileTextOf(projectDirectory, mainLine, path);
    if (text === null) return { verdict: 'instructions-missing', path };
    texts.push(lineEndedTextOf(text));
    files.push({ path, contentHash: contentHashOf(text) });
  }
  return { verdict: 'read', text: texts.join('\n'), files };
}

/**
 * A constitution on main, the project's `CONSTITUTION.md` unless an entity's path is given, its text and its blob id read from one commit of
 * the main line, so the two always belong together. A main line checked out with no commit yet holds no file, so it is absent; any other
 * main line that does not resolve, or a git that cannot answer, is unreadable, never absent.
 */
function mainConstitutionOf(projectDirectory: string, mainLine: string, constitutionPath = CONSTITUTION_FILE_PATH): MainConstitutionReading {
  const { repositoryRoot } = projectLocationOf(projectDirectory);
  const mainTip = GitProcess.resolvedCommitOf(repositoryRoot, mainLine);
  if (mainTip !== null) return mainConstitutionAt(projectDirectory, mainTip, constitutionPath);
  const currentBranch = readCurrentBranch(repositoryRoot);
  if (currentBranch.verdict === 'on-branch' && currentBranch.branch === mainLine) return { verdict: 'absent' };
  return { verdict: 'unreadable', problem: { code: 'main-line-unresolved', mainLine } };
}

/** A constitution at one resolved commit of the main line, the project's `CONSTITUTION.md` unless given, named by its project path. */
function mainConstitutionAt(projectDirectory: string, mainTip: string, constitutionPath = CONSTITUTION_FILE_PATH): MainConstitutionReading {
  const constitution = projectFileOf(projectDirectory, constitutionPath);
  const blobArguments = ['rev-parse', '--verify', '--quiet', '--end-of-options', `${mainTip}:${constitution.repositoryPath}`];
  const blobRun = GitProcess.run(constitution.repositoryRoot, blobArguments);
  if (blobRun === null) return { verdict: 'unreadable', problem: GitProcess.failureOf(blobRun, blobArguments) };
  if (!GitProcess.succeeded(blobRun)) return { verdict: 'absent' };
  const showArguments = ['show', `${mainTip}:${constitution.repositoryPath}`];
  const shown = GitProcess.run(constitution.repositoryRoot, showArguments);
  if (!GitProcess.succeeded(shown)) return { verdict: 'unreadable', problem: GitProcess.failureOf(shown, showArguments) };
  return { verdict: 'read', constitution: { path: constitutionPath, markdown: shown.standardOutput, blob: blobRun.standardOutput.trim() } };
}

export const InstructionFiles = Object.freeze({
  pipelineOfJob,
  readingFor,
  trackedInstructionPathsOf,
  entityConstitutionsOf,
  instructionRoleOf,
  instructionPathOf,
  projectFileOf,
  isDataFolderPath,
  fileTextOf,
  fileTextReadingOf,
  mainConstitutionOf,
  mainConstitutionAt
});
