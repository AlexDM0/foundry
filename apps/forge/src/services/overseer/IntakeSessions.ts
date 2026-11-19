/**
 * The Overseer's side of a product-owner intake (design section 8.4): the session's confinement (skills on, web fetches and searches
 * only, shell commands with no domain), what its first message is filled from and the pictures it carries, the entity map its brief
 * receives on a forge with entities, and the end of a closed intake.
 */
import { readFileSync } from 'node:fs';

import type { AgentAdapter }              from '../../lib/agent-launch/AgentAdapter.ts';
import type { WorkerProfile }             from '../../lib/agent-launch/WorkerProfile.ts';
import type { Job, PictureReference }     from '../../lib/tracker-model/@types/Job.ts';
import type { EntityKey, PipelineEntity } from '../../lib/tracker-model/@types/Pipeline.ts';
import type { Board }                     from '../../lib/tracker-model/Board.ts';
import { filledTemplateOf }               from '../../shared/FilledTemplate.ts';
import { resourceFilePathOf }             from '../../shared/ResourceFilePath.ts';
import { PRODUCT_NAMES }                  from '../../shared/constants/ProductNames.ts';
import type { ChildLiveness }             from './BoardChildren.ts';

export const PRODUCT_OWNER_KIND = 'product-owner';

const ENTITY_MAP_PLACEHOLDER = '{{entityMap}}';

/** What a product owner's first message is filled from; a fresh session after a replaced one also gets its drafts and answers. */
export interface IntakeFacts {
  text:           string;
  /** The line that runs the product-owner instruction bundle on User's request, as the session's agent words it. */
  firstLine:      string;
  drafts:         readonly { id: string; title: string }[];
  carriedAnswers: readonly Readonly<Record<string, string>>[];
}

function isIntakeJob(job: Readonly<Job>): boolean {
  return job.kind === PRODUCT_OWNER_KIND;
}

/** Writes only its session folder and its Hatch folder; the slash command loads the product-owner skill, so skills stay on. */
function productOwnerProfileOf(sessionProfile: WorkerProfile): WorkerProfile {
  return {
    ...sessionProfile, shellNetworkDomains: [], webNetworkDomains: 'any', askUser: true, skills: true, networkDomainGuard: null
  };
}

function intakeFactsOf(board: Board, job: Readonly<Job>, agentAdapter: Pick<AgentAdapter, 'instructionBundleLineOf'>): IntakeFacts | null {
  if (!isIntakeJob(job)) return null;
  const freshAfterReplacement = job.parentJobId !== null;
  const text = job.intake?.text ?? '';
  return {
    text,
    firstLine:      agentAdapter.instructionBundleLineOf(PRODUCT_NAMES.PRODUCT_OWNER_SKILL, text),
    drafts:         freshAfterReplacement ? board.draftsFiledByIntakeOf(job.id).map((ticket) => ({ id: ticket.frontmatter.id, title: ticket.frontmatter.title })) : [],
    carriedAnswers: job.intake?.carriedAnswers ?? [],
  };
}

/** A product owner's first message carries the pictures of User's request, a fresh session after a replaced one too; no other job's does. */
function firstMessagePicturesOf(job: Readonly<Job>): readonly PictureReference[] {
  return isIntakeJob(job) ? job.intake?.pictures ?? [] : [];
}

/** One entity as the map lists it: its key, kind, home folders, the entities it depends on, and the summary intake routes a ticket by. */
function entityLineOf(entityKey: EntityKey, entity: Readonly<PipelineEntity>): string {
  const homes = entity.home.map((home) => `\`${home}\``).join(', ');
  const summary = entity.summary === undefined ? '' : ` ${entity.summary.replace(/\s+/gu, ' ').trim()}`;
  const dependsOn = entity.dependsOn === undefined || entity.dependsOn.length === 0
    ? ''
    : ` Depends on ${entity.dependsOn.map((dependencyKey) => `\`${dependencyKey}\``).join(', ')}.`;
  return `- \`${entityKey}\` (${entity.kind}): ${homes}.${dependsOn}${summary}`;
}

/** The map of the pipeline's entities that a product owner's brief ends with; empty on a forge without entities. */
function entityMapOf(board: Board): string {
  const entities = board.pipeline()?.entities;
  if (entities === undefined) return '';
  const template = readFileSync(resourceFilePathOf('prompts', 'ProductOwnerEntityMap.md'), 'utf8');
  const entityLines = Object.entries(entities).map(([entityKey, entity]) => entityLineOf(entityKey, entity)).join('\n');
  return `\n\n${filledTemplateOf(template, { entityLines, program: PRODUCT_NAMES.PROGRAM }).trimEnd()}`;
}

/**
 * A product owner's instruction files with the entity map in place of their `{{entityMap}}`, which a forge without entities fills with
 * nothing, so its brief stays as it was. A brief without the placeholder, installed before it or named by the pipeline, ends with the
 * map. Every other job's are returned as they are.
 */
function productOwnerInstructionsOf(board: Board, job: Readonly<Job>, instructions: string): string {
  if (!isIntakeJob(job)) return instructions;
  const entityMap = entityMapOf(board);
  if (instructions.includes(ENTITY_MAP_PLACEHOLDER)) return filledTemplateOf(instructions, { entityMap });
  return entityMap === '' ? instructions : `${instructions.trimEnd()}${entityMap}\n`;
}

/**
 * A product owner whose input was closed, by `intake close` or `job stop`, ends `closed` once no child of it is live, a child that never
 * started included.
 */
function endClosedIntakes(board: Board, livenessOf: (job: Readonly<Job>) => ChildLiveness, at: string): void {
  for (const job of board.jobs().filter((candidate) => isIntakeJob(candidate) && candidate.state === 'stopping')) {
    if (livenessOf(job).verdict === 'live') continue;
    board.endIntakeJob(job.id, at);
  }
}

export const IntakeSessions = Object.freeze({
  isIntakeJob, productOwnerProfileOf, intakeFactsOf, productOwnerInstructionsOf, firstMessagePicturesOf, endClosedIntakes
});
