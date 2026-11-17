/**
 * The first Apply's model (A4), pure: the "Resume the board" line from the pending tickets and the concurrency limit, the note that
 * Apply commits the constitution first, and the `pipeline-apply` command, which carries the checkbox's value as it shows.
 * Over entities (MonoApply) it also words what Apply stores, the pending tickets that the product owner gives an entity after Apply,
 * the entities worth a look, which never block Apply, and, only in update mode over a stored pipeline without entities, the refusal
 * that tickets in flight cause (E94), with a link to each ticket's detail.
 */
import type { EntityKey, Pipeline }    from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { AppliedPipelineFacts }   from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { PipelineSetup }          from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { ControlCommandBody }     from '../../../api/CommandClient.ts';
import { DetailRoute }                 from '../../../shell/DetailRoute.ts';
import { HashRouter }                  from '../../../shell/HashRouter.ts';
import { ForgeLevelPageModel }         from '../entities/ForgeLevelPageModel.ts';
import { ConstitutionCommitListModel } from './ConstitutionCommitListModel.ts';

/** How the resume line words the pace: today's "2 at a time", or "2 jobs at once" over entities, where a cap counts jobs. */
export type ResumePace = 'at-a-time' | 'jobs-at-once';

/** What the Apply dialog reads of the stored pipeline and the board, beside the record. */
export interface ApplyDialogBoard {
  readonly storedPipeline:    AppliedPipelineFacts | undefined;
  readonly ticketIdsInFlight: readonly string[];
}

export interface TicketLinkView {
  readonly ticketId: string;
  readonly text:     string;
  readonly href:     string;
}

/** E94 before Apply is pressed: the reason in User's words, a link to each ticket in flight, and why Apply waits. */
export interface EntitiesRefusalView {
  readonly title:          string;
  readonly text:           string;
  readonly ticketLinks:    readonly TicketLinkView[];
  readonly disabledReason: string;
}

export type WorthALookReason = 'no-gates' | 'default-constitution';

/** An entity that User may want to look at before Apply; it never blocks Apply. */
export interface WorthALookView {
  readonly entityKey: EntityKey;
  readonly reason:    WorthALookReason;
  readonly title:     string;
  readonly text:      string;
  readonly linkText:  string;
}

const CONSTITUTION_NOTE = 'Apply commits CONSTITUTION.md to main, then stores the pipeline.';

const SINGLE_DESCRIPTION = 'The board starts using it as shown on the flow.';

const KANBAN_TAB = 'kanban';

function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function listedText(items: readonly string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

function paceTextOf(concurrencyLimit: number | null, pace: ResumePace): string {
  if (concurrencyLimit === null) return '';
  return pace === 'at-a-time' ? `, ${concurrencyLimit} at a time` : `, ${ForgeLevelPageModel.jobsAtOnceTextOf(concurrencyLimit)}`;
}

/** "The 3 pending tickets start building, 2 at a time."; over entities "…, 2 jobs at once." */
function resumeTextOf(pendingTicketCount: number, concurrencyLimit: number | null, pace: ResumePace = 'at-a-time'): string {
  const paceText = paceTextOf(concurrencyLimit, pace);
  if (pendingTicketCount === 0) return `No ticket is pending yet. New tickets start building${paceText}.`;
  if (pendingTicketCount === 1) return `The pending ticket starts building${paceText}.`;
  return `The ${pendingTicketCount} pending tickets start building${paceText}.`;
}

/** Monorepo mode is a fact: the draft holds entities. */
function draftHasEntities(record: Pick<PipelineSetup, 'draft'>): boolean {
  return record.draft?.entities !== undefined;
}

/** Shown while the draft holds a constitution, which Apply commits to main before it stores the pipeline; over entities the list says it. */
function constitutionNoteOf(record: PipelineSetup): string | null {
  if (draftHasEntities(record)) return null;
  return record.constitution === null ? null : CONSTITUTION_NOTE;
}

function storedPipelineOf(storedPipeline: AppliedPipelineFacts | undefined): Pipeline | null {
  return storedPipeline?.readingVerdict === 'readable' ? storedPipeline.pipeline : null;
}

/** Over entities: "Apply stores the Forge level and 3 entities as one pipeline, version 1."; single mode keeps its sentence. */
function descriptionOf(record: PipelineSetup, storedPipeline: AppliedPipelineFacts | undefined): string {
  const entityCount = Object.keys(record.draft?.entities ?? {}).length;
  if (!draftHasEntities(record)) return SINGLE_DESCRIPTION;
  const appliedRevision = storedPipeline?.readingVerdict === 'readable' ? storedPipeline.application?.appliedRevision ?? null : null;
  const version = appliedRevision === null ? 1 : appliedRevision + 1;
  const stores = `Apply stores the Forge level and ${countText(entityCount, 'entity', 'entities')} as one pipeline, version ${version}.`;
  return storedPipelineOf(storedPipeline) === null ? `Nothing is stored yet. ${stores}` : stores;
}

/** The pace the resume line uses: jobs once the draft holds entities. */
function resumePaceOf(record: PipelineSetup): ResumePace {
  return draftHasEntities(record) ? 'jobs-at-once' : 'at-a-time';
}

/**
 * After an Apply that turns the pipeline into entities, the product owner gives each pending ticket without an entity one; null when no
 * ticket waits for it, or when the stored pipeline already holds entities.
 */
function pendingWithoutEntityTextOf(record: PipelineSetup, storedPipeline: AppliedPipelineFacts | undefined, ticketCount: number): string | null {
  if (!draftHasEntities(record) || ticketCount === 0) return null;
  if (storedPipelineOf(storedPipeline)?.entities !== undefined) return null;
  if (ticketCount === 1) return '1 pending ticket names no entity. After Apply the product owner gives it an entity.';
  return `${ticketCount} pending tickets name no entity. After Apply the product owner gives each one an entity.`;
}

function pendingTicketWithoutEntityCountOf(tickets: readonly { readonly status: string; readonly entity?: string }[]): number {
  return tickets.filter((ticket) => ticket.status === 'pending' && ticket.entity === undefined).length;
}

function ticketLinkOf(ticketId: string): TicketLinkView {
  return {
    ticketId,
    text: `Open ${ticketId}`,
    href: HashRouter.fragmentOf({ tab: KANBAN_TAB, item: DetailRoute.itemTextOf({ form: 'ticket', ticketId }) }),
  };
}

/**
 * E94 as the Overseer gives it: only in update mode, over a stored pipeline without entities that the draft turns into entities, while
 * tickets are in progress, in review or reviewed. A first Apply never shows it.
 */
function entitiesRefusalOf(record: PipelineSetup, board: ApplyDialogBoard): EntitiesRefusalView | null {
  if (record.mode !== 'update' || !draftHasEntities(record)) return null;
  const stored = storedPipelineOf(board.storedPipeline);
  if (stored === null || stored.entities !== undefined) return null;
  const ticketIds = board.ticketIdsInFlight;
  if (ticketIds.length === 0) return null;
  const single = ticketIds.length === 1;
  const tickets = `${single ? 'Ticket' : 'Tickets'} ${listedText(ticketIds)}`;
  return {
    title: 'Apply is refused',
    text:  `${tickets} ${single ? 'is' : 'are'} in progress, in review or reviewed, so this pipeline cannot turn into entities yet. `
      + `Apply once ${single ? 'it lands' : 'they land'}.`,
    ticketLinks:    ticketIds.map(ticketLinkOf),
    disabledReason: `${tickets} ${single ? 'is' : 'are'} in flight`,
  };
}

/** Each entity without gates, then each that reads the installed default constitution, in the draft's order; none blocks Apply. */
function worthALookOf(record: PipelineSetup): WorthALookView[] {
  const entities = record.draft?.entities ?? {};
  const withoutGates = Object.entries(entities).filter(([, entity]) => entity.kind !== 'root' && entity.gates.length === 0).map(([entityKey]) => ({
    entityKey,
    reason:   'no-gates' as const,
    title:    `${entityKey} has no gates`,
    text:     'Its tickets land with no checks. This does not block Apply; you can add gates later.',
    linkText: `Open ${entityKey}`,
  }));
  const withDefault = ConstitutionCommitListModel.commitOf(record).defaultKeys.map((entityKey) => ({
    entityKey,
    reason:   'default-constitution' as const,
    title:    `${entityKey} reads the default constitution`,
    text:     'Its agents follow the installed generic rules. This does not block Apply; you can draft its own later.',
    linkText: `Open ${entityKey}`,
  }));
  return [...withoutGates, ...withDefault];
}

function applyCommandOf(record: PipelineSetup, resumesBoard: boolean): ControlCommandBody {
  return {
    kind: 'pipeline-apply', setupId: record.setupId, draftRevision: record.draftRevision, resumesBoard,
  };
}

export const ApplyDialogModel = Object.freeze({
  resumeTextOf,
  constitutionNoteOf,
  applyCommandOf,
  draftHasEntities,
  descriptionOf,
  resumePaceOf,
  pendingWithoutEntityTextOf,
  pendingTicketWithoutEntityCountOf,
  entitiesRefusalOf,
  worthALookOf,
});
