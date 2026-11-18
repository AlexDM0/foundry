/**
 * The fake sessions of a scratch board that runs a ticket to its landing: a builder appends a line to `fake-agent-work.md` in each folder its
 * stage may change that the Brief's `Work belongs in:` line names (in each of them when it names none), commits it and reports `built`; a
 * reviewer reports every Acceptance item as holding. Each report follows the schema its
 * launch hands it, a crossing ticket's package and adapt stages included: a package build states that what the package exposes did not
 * change, its review confirms it, so the adapt stage is skipped. It claims no gate, so only a gate the Overseer alone runs passes V15.
 */
import {
  ADAPT_BUILDER_REPORT_SCHEMA,
  BUILDER_REPORT_SCHEMA,
  PACKAGE_BUILDER_REPORT_SCHEMA,
  PACKAGE_REVIEWER_REPORT_SCHEMA,
  REVIEWER_REPORT_SCHEMA
} from '../adapters/reports/ReportSchemas.ts';
import type { JsonSchema }                                                      from '../adapters/reports/ReportValidation.ts';
import { TicketAcceptanceUtil }                                                 from '../adapters/tickets/utils/TicketAcceptanceUtil.ts';
import type { AgentLaunchRequest }                                              from '../lib/agent-launch/AgentLaunchRequest.ts';
import { JOB_ID_VARIABLE }                                                      from '../shared/Environment.ts';
import { FAKE_HEAD_PLACEHOLDER, fakeStartedLineSelectorOf, type FakeAgentStep } from './FakeAgentAdapter.ts';

export const FAKE_WORK_FILE_NAME = 'fake-agent-work.md';

export const FAKE_COMMIT_AUTHOR = { name: 'Alex Example', email: 'alex@example.com' } as const;

type ReportingRole = 'builder' | 'package-builder' | 'adapt-builder' | 'reviewer' | 'package-reviewer';

const REPORTING_ROLE_OF_SCHEMA: ReadonlyMap<JsonSchema, ReportingRole> = new Map([
  [BUILDER_REPORT_SCHEMA, 'builder'],
  [PACKAGE_BUILDER_REPORT_SCHEMA, 'package-builder'],
  [ADAPT_BUILDER_REPORT_SCHEMA, 'adapt-builder'],
  [REVIEWER_REPORT_SCHEMA, 'reviewer'],
  [PACKAGE_REVIEWER_REPORT_SCHEMA, 'package-reviewer'],
]);

export interface FakeReportingSessions {
  /** The steps of a session whose report schema a reporting role answers; `null` for any other, which plays the adapter's own steps. */
  stepsOf(request: AgentLaunchRequest): readonly FakeAgentStep[] | null;
}

function shellQuoted(text: string): string {
  return `'${text.replaceAll('\'', '\'\\\'\'')}'`;
}

function jobIdOf(request: AgentLaunchRequest): string {
  return request.environment[JOB_ID_VARIABLE] ?? request.sessionId;
}

/** A folder the Brief's work files name, as the folder itself or a path inside it, read from the root of the worktree it lies in. */
function isNamedByWorkFiles(folder: string, workingDirectory: string, workFiles: readonly string[]): boolean {
  if (!folder.startsWith(`${workingDirectory}/`)) return false;
  const repositoryFolder = folder.slice(workingDirectory.length);
  return workFiles.some((workFile) => workFile === repositoryFolder || workFile.startsWith(`${repositoryFolder}/`));
}

/**
 * The folders the stage may change that the Brief's work files name, so a stage 1 proposes a change only in the packages its ticket names, as
 * a real builder would; every folder the stage may change when the Brief names none of them.
 */
function workFoldersOf(request: AgentLaunchRequest, workFiles: readonly string[]): readonly string[] {
  const folders = request.profile.stageFolders ?? [request.workingDirectory];
  const namedFolders = folders.filter((folder) => isNamedByWorkFiles(folder, request.workingDirectory, workFiles));
  return namedFolders.length === 0 ? folders : namedFolders;
}

/** Appends a line naming the job in each work folder that exists, stages those folders alone, and commits them. */
function workCommandOf(request: AgentLaunchRequest, workFiles: readonly string[]): string {
  const jobId = jobIdOf(request);
  const folders = workFoldersOf(request, workFiles);
  const line = shellQuoted(`Work of job ${jobId}.`);
  const appendLines = folders.map((folder) => {
    const quotedFolder = shellQuoted(folder);
    const workFile = `${quotedFolder}/${FAKE_WORK_FILE_NAME}`;
    return `if [ -d ${quotedFolder} ]; then printf '%s\\n' ${line} >> ${workFile} && git add -- ${workFile}; fi`;
  });
  const author = `-c user.name=${shellQuoted(FAKE_COMMIT_AUTHOR.name)} -c user.email=${shellQuoted(FAKE_COMMIT_AUTHOR.email)}`;
  const commit = `git ${author} commit -q -m ${shellQuoted(`Do the work of job ${jobId}`)}`;
  return [...appendLines, commit].join('; ');
}

function builderReportOf(role: ReportingRole, acceptanceLabels: readonly string[]): Record<string, unknown> {
  const isPackageStage = role === 'package-builder';
  const report: Record<string, unknown> = {
    role:              'builder',
    outcome:           'built',
    headCommit:        FAKE_HEAD_PLACEHOLDER,
    acceptance:        isPackageStage ? [] : acceptanceLabels.map((item) => ({ item, state: 'met', evidence: `The fake agent met ${item}.` })),
    alsoFixed:         [],
    gates:             [],
    handoff:           `The fake agent appended a line to ${FAKE_WORK_FILE_NAME} in each folder its stage may change.`,
    blockedReason:     null,
    cannotBuildReason: null,
  };
  if (role === 'package-builder') return { ...report, exposedSurfaceChanged: false, refusedReason: null };
  if (role === 'adapt-builder') return { ...report, packageReturnReason: null, packageReturnEntity: null };
  return report;
}

function reviewerReportOf(role: ReportingRole, acceptanceLabels: readonly string[]): Record<string, unknown> {
  const report: Record<string, unknown> = {
    role:       'reviewer',
    headCommit: FAKE_HEAD_PLACEHOLDER,
    claims:     acceptanceLabels.map((item) => ({
      item, result: 'holds', handoffContradicted: false, note: `The fake agent holds ${item}.`
    })),
    findings:   [],
    reviewText: 'The fake agent found nothing to change.',
  };
  return role === 'package-reviewer' ? { ...report, exposedSurfaceConfirmed: true } : report;
}

function resultLineOf(report: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, structured_output: report, permission_denials: []
  });
}

function assistantTurnLineOf(jobId: string): string {
  return JSON.stringify({ type: 'assistant', parent_tool_use_id: null, message: { id: `msg_fake_${jobId}`, content: [] } });
}

interface TicketFacts {
  readonly acceptanceLabels: readonly string[];
  readonly workFiles:        readonly string[];
}

/**
 * The labels a session's first message names under its ticket's `## Acceptance`, and the paths its `Work belongs in:` line names. A resumed
 * session is told no ticket, so it uses what its first launch read, kept by session for as long as this process runs.
 */
export function fakeReportingSessions(): FakeReportingSessions {
  const ticketFactsBySession = new Map<string, TicketFacts>();
  const ticketFactsOf = (request: AgentLaunchRequest): TicketFacts => {
    const acceptanceLabels = TicketAcceptanceUtil.acceptanceItemsOf(request.firstMessage).map(({ label }) => label);
    if (acceptanceLabels.length === 0) return ticketFactsBySession.get(request.sessionId) ?? { acceptanceLabels: [], workFiles: [] };
    const ticketFacts = { acceptanceLabels, workFiles: TicketAcceptanceUtil.workFilesOf(request.firstMessage) };
    ticketFactsBySession.set(request.sessionId, ticketFacts);
    return ticketFacts;
  };
  return {
    stepsOf(request) {
      const role = request.reportSchema === null ? undefined : REPORTING_ROLE_OF_SCHEMA.get(request.reportSchema as JsonSchema);
      if (role === undefined) return null;
      const { acceptanceLabels, workFiles } = ticketFactsOf(request);
      const isReviewer = role === 'reviewer' || role === 'package-reviewer';
      const report = isReviewer ? reviewerReportOf(role, acceptanceLabels) : builderReportOf(role, acceptanceLabels);
      return [
        { kind: 'print', line: fakeStartedLineSelectorOf(request.sessionId) },
        { kind: 'await-line' },
        ...isReviewer ? [] : [{ kind: 'shell', command: workCommandOf(request, workFiles) } as const],
        { kind: 'print', line: assistantTurnLineOf(jobIdOf(request)) },
        { kind: 'print', line: resultLineOf(report) },
        { kind: 'await-line' },
      ];
    },
  };
}
