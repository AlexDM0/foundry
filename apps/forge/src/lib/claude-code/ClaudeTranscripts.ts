/**
 * Where Claude Code keeps one repository's transcripts, and which belong to subagents; as the claude-code building block's main module it
 * stands for its siblings too. It depends on `src/lib/agent-launch`, `src/lib/atomic-file`, `src/lib/git`, `src/lib/json-record` and
 * `src/lib/talos`, whose ending recognition its fixture specs hold the plan's endings against.
 */
import type { Dirent }               from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import {
  basename,
  dirname,
  join,
  resolve
} from 'node:path';

import { JsonRecordUtil } from '../json-record/JsonRecordUtil.ts';

const PROJECTS_DIRECTORY_NAME = 'projects';

const SUBAGENTS_DIRECTORY_NAME = 'subagents';

const WORKFLOWS_DIRECTORY_NAME = 'workflows';

const SUBAGENT_FILE_PREFIX = 'agent-';

const TRANSCRIPT_FILE_SUFFIX = '.jsonl';

const AGENT_METADATA_FILE_SUFFIX = '.meta.json';

/** Everything outside `[a-zA-Z0-9]`, because that is the whole of what the harness keeps in a folder name. */
const CHARACTER_THE_SLUG_REPLACES = /[^a-zA-Z0-9]/g;

/** The two identifiers are carried separately from the path because a report names the agent, and only a failure names the file. */
export interface SubagentTranscript {
  path:              string;
  sessionIdentifier: string;
  agentIdentifier:   string;
}

/**
 * `<config>/projects/` plus the start folder's absolute path, every character outside `[a-zA-Z0-9]` replaced by `-`: one folder per start
 * folder, so a session found by its id is searched across all of them. The caller supplies the config folder, since the package reads
 * nothing from the process.
 */
export function transcriptFolderFor(sessionStartDirectory: string, configFolder: string): string {
  const slug = resolve(sessionStartDirectory).replace(CHARACTER_THE_SLUG_REPLACES, '-');
  return join(configFolder, PROJECTS_DIRECTORY_NAME, slug);
}

/** Fail closed: a directory that is missing, or that `readdir` refuses, reads as empty — the same answer as a repository nobody has run an agent in. */
function directoryEntriesOf(directory: string): Dirent<string>[] {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** A workflow run's journal and each agent's `.meta.json` sit beside its transcripts and fail the prefix or the suffix, so neither is read as one. */
function agentTranscriptsIn(directory: string, sessionIdentifier: string): SubagentTranscript[] {
  return directoryEntriesOf(directory)
    .filter((agentEntry) => agentEntry.isFile() && agentEntry.name.startsWith(SUBAGENT_FILE_PREFIX) && agentEntry.name.endsWith(TRANSCRIPT_FILE_SUFFIX))
    .map((agentEntry) => ({
      path:            join(directory, agentEntry.name),
      sessionIdentifier,
      agentIdentifier: agentEntry.name.slice(SUBAGENT_FILE_PREFIX.length, -TRANSCRIPT_FILE_SUFFIX.length),
    }));
}

function unsortedSessionSubagentTranscripts(transcriptFolder: string, sessionIdentifier: string): SubagentTranscript[] {
  const subagentsDirectory = join(transcriptFolder, sessionIdentifier, SUBAGENTS_DIRECTORY_NAME);
  const transcripts        = agentTranscriptsIn(subagentsDirectory, sessionIdentifier);

  const workflowsDirectory = join(subagentsDirectory, WORKFLOWS_DIRECTORY_NAME);
  for (const runEntry of directoryEntriesOf(workflowsDirectory)) {
    if (!runEntry.isDirectory()) continue;
    transcripts.push(...agentTranscriptsIn(join(workflowsDirectory, runEntry.name), sessionIdentifier));
  }
  return transcripts;
}

function sortedByPath(transcripts: SubagentTranscript[]): SubagentTranscript[] {
  return transcripts.sort((a, b) => a.path.localeCompare(b.path));
}

/** Subagent transcripts only, including workflow runs, sorted by path; an absent folder is an empty list. */
export function listSubagentTranscripts(transcriptFolder: string): SubagentTranscript[] {
  return sortedByPath(directoryEntriesOf(transcriptFolder)
    .filter((sessionEntry) => sessionEntry.isDirectory())
    .flatMap((sessionEntry) => unsortedSessionSubagentTranscripts(transcriptFolder, sessionEntry.name)));
}

/** One session's subagent transcripts, workflow runs' included, sorted by path, reading no other session's folder; an absent session is none. */
export function listSessionSubagentTranscripts(transcriptFolder: string, sessionIdentifier: string): SubagentTranscript[] {
  return sortedByPath(unsortedSessionSubagentTranscripts(transcriptFolder, sessionIdentifier));
}

/**
 * One session's subagent transcripts, found by its id in every folder under `<config>/projects/`, so a working directory with a second
 * spelling (a symlink, another drive-letter case) still finds them; sorted by path, and none when no folder holds the session.
 */
export function findSessionSubagentTranscripts(configFolder: string, sessionIdentifier: string): SubagentTranscript[] {
  const projectsFolder = join(configFolder, PROJECTS_DIRECTORY_NAME);
  return sortedByPath(directoryEntriesOf(projectsFolder)
    .filter((projectEntry) => projectEntry.isDirectory())
    .flatMap((projectEntry) => unsortedSessionSubagentTranscripts(join(projectsFolder, projectEntry.name), sessionIdentifier)));
}

/** The run folder of a transcript at `…/workflows/<runId>/agent-<id>.jsonl`; `undefined` for any other path, a plain subagent's among them. */
export function workflowRunIdentifierOf(transcriptPath: string): string | undefined {
  const runDirectory = dirname(transcriptPath);
  if (basename(dirname(runDirectory)) !== WORKFLOWS_DIRECTORY_NAME) return undefined;
  const runIdentifier = basename(runDirectory);
  return runIdentifier.length > 0 ? runIdentifier : undefined;
}

/** The `description` in the `.meta.json` the harness writes beside a transcript; `undefined` when the file, its JSON or the field is missing. */
export function agentDescriptionBeside(transcriptPath: string): string | undefined {
  if (!transcriptPath.endsWith(TRANSCRIPT_FILE_SUFFIX)) return undefined;
  const metadataText = transcriptTextAt(`${transcriptPath.slice(0, -TRANSCRIPT_FILE_SUFFIX.length)}${AGENT_METADATA_FILE_SUFFIX}`);
  if (metadataText === undefined) return undefined;
  let parsedMetadata: unknown;
  try {
    parsedMetadata = JSON.parse(metadataText);
  } catch {
    return undefined;
  }
  const description = JsonRecordUtil.recordOf(parsedMetadata)?.['description'];
  return typeof description === 'string' && description.length > 0 ? description : undefined;
}

export function transcriptTextAt(transcriptPath: string): string | undefined {
  try {
    return readFileSync(transcriptPath, 'utf8');
  } catch {
    // A transcript that vanished or will not open reads as none: the folder is the harness's and may be pruned while it is read.
    return undefined;
  }
}
