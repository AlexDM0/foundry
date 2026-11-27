/**
 * The first Apply's model, pure: the "Resume the board" line, the constitution note and the `pipeline-apply` command. The refusal an
 * Apply meets is the one the forge serves, in its sentence; nothing is predicted here.
 */
import { PAGE_CONTRACT_VERSIONS }                                                                       from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }                                                                    from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardAppliedPipelineDocument, BoardPipelineDefinitionDocument, BoardSetupRecordDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardForgeRefusalDocument }                                                               from '../../../../@types/board/BoardRelayDocuments.ts';
import type { BoardRoute }                                                                              from '../../../../shared/BoardRouter.ts';
import { CountTextUtil }                                                                                from '../../../../shared/utils/CountTextUtil.ts';
import { DetailRoute }                                                                                  from '../../../shared/routing/DetailRoute.ts';
import { ForgeLevelPageModel }                                                                          from '../entities/ForgeLevelPageModel.ts';
import { ConstitutionCommitListModel }                                                                  from './ConstitutionCommitListModel.ts';

/** How the resume line words the pace: "2 at a time", or "2 jobs at once" over entities, where a cap counts jobs. */
export type ResumePace = 'at-a-time' | 'jobs-at-once';

export interface TicketLinkView {
  readonly ticketId: string;
  readonly text:     string;
  readonly route:    BoardRoute;
}

/** The refusal the forge serves for an Apply now, before Apply is pressed: its sentence, a link to each ticket it names, and why Apply waits. */
export interface ApplyRefusalView {
  readonly title:          string;
  readonly text:           string;
  readonly ticketLinks:    readonly TicketLinkView[];
  readonly disabledReason: string;
}

export type WorthALookReason = 'no-gates' | 'default-constitution';

/** An entity that User may want to look at before Apply; it never blocks Apply. */
export interface WorthALookView {
  readonly entityKey: string;
  readonly reason:    WorthALookReason;
  readonly title:     string;
  readonly text:      string;
  readonly linkText:  string;
}

const CONSTITUTION_NOTE = 'Apply commits CONSTITUTION.md to main, then stores the pipeline.';

const SINGLE_DESCRIPTION = 'The board starts using it as shown on the flow.';

const TICKETS_TAB = 'tickets' as const;

const APPLY_REFUSED_TITLE = 'Apply is refused';

function paceTextOf(concurrencyLimit: number | null, pace: ResumePace): string {
  if (concurrencyLimit === null) return '';
  return pace === 'at-a-time' ? `, ${concurrencyLimit} at a time` : `, ${ForgeLevelPageModel.jobsAtOnceTextOf(concurrencyLimit)}`;
}

/** "The 3 committed tickets start building, 2 at a time."; over entities "…, 2 jobs at once." */
function resumeTextOf(pendingTicketCount: number, concurrencyLimit: number | null, pace: ResumePace = 'at-a-time'): string {
  const paceText = paceTextOf(concurrencyLimit, pace);
  if (pendingTicketCount === 0) return `No ticket is committed yet. New tickets start building${paceText}.`;
  if (pendingTicketCount === 1) return `The committed ticket starts building${paceText}.`;
  return `The ${pendingTicketCount} committed tickets start building${paceText}.`;
}

/** Monorepo mode is a fact: the draft holds entities. */
function draftHasEntities(record: Pick<BoardSetupRecordDocument, 'draft'>): boolean {
  return (record.draft?.entities ?? null) !== null;
}

/** Shown while the draft holds a constitution, which Apply commits to main before it stores the pipeline; over entities the list says it. */
function constitutionNoteOf(record: BoardSetupRecordDocument): string | null {
  if (draftHasEntities(record)) return null;
  return record.constitution === null ? null : CONSTITUTION_NOTE;
}

function storedPipelineOf(storedPipeline: BoardAppliedPipelineDocument | undefined): BoardPipelineDefinitionDocument | null {
  return storedPipeline?.readingVerdict === 'readable' ? storedPipeline.pipeline : null;
}

/** Over entities: "Apply stores the Forge level and 3 entities as one pipeline, version 1."; single mode keeps its sentence. */
function descriptionOf(record: BoardSetupRecordDocument, storedPipeline: BoardAppliedPipelineDocument | undefined): string {
  const entityCount = Object.keys(record.draft?.entities ?? {}).length;
  if (!draftHasEntities(record)) return SINGLE_DESCRIPTION;
  const appliedRevision = storedPipeline?.readingVerdict === 'readable' ? storedPipeline.application?.appliedRevision ?? null : null;
  const version = appliedRevision === null ? 1 : appliedRevision + 1;
  const stores = `Apply stores the Forge level and ${CountTextUtil.countedPhrase(entityCount, 'entity', 'entities')} as one pipeline, version ${version}.`;
  return storedPipelineOf(storedPipeline) === null ? `Nothing is stored yet. ${stores}` : stores;
}

/** The pace the resume line uses: jobs once the draft holds entities. */
function resumePaceOf(record: BoardSetupRecordDocument): ResumePace {
  return draftHasEntities(record) ? 'jobs-at-once' : 'at-a-time';
}

/**
 * After an Apply that turns the pipeline into entities, the product owner gives each committed ticket without an entity one; null when no
 * ticket waits for it, or when the stored pipeline already holds entities.
 */
function pendingWithoutEntityTextOf(record: BoardSetupRecordDocument, storedPipeline: BoardAppliedPipelineDocument | undefined, ticketCount: number): string | null {
  if (!draftHasEntities(record) || ticketCount === 0) return null;
  if ((storedPipelineOf(storedPipeline)?.entities ?? null) !== null) return null;
  if (ticketCount === 1) return '1 committed ticket names no entity. After Apply the product owner gives it an entity.';
  return `${ticketCount} committed tickets name no entity. After Apply the product owner gives each one an entity.`;
}

function pendingTicketWithoutEntityCountOf(tickets: readonly { readonly status: string; readonly entity: string | null }[]): number {
  return tickets.filter((ticket) => ticket.status === 'committed' && ticket.entity === null).length;
}

function ticketLinkOf(ticketId: string): TicketLinkView {
  return {
    ticketId,
    text:  `Open ${ticketId}`,
    route: { tab: TICKETS_TAB, item: DetailRoute.itemTextOf({ form: 'ticket', ticketId }) },
  };
}

/** The tickets a served refusal names in its facts, such as the tickets in flight that refuse turning a pipeline into entities. */
function ticketIdsOf(refusal: BoardForgeRefusalDocument): string[] {
  const { ticketIds } = refusal.fields;
  return Array.isArray(ticketIds) ? ticketIds.filter((ticketId): ticketId is string => typeof ticketId === 'string') : [];
}

/** The refusal an Apply of the draft meets now, as the forge serves it; `null` while it would proceed. */
function applyRefusalOf(applyRefusal: BoardForgeRefusalDocument | null): ApplyRefusalView | null {
  if (applyRefusal === null) return null;
  return {
    title:          APPLY_REFUSED_TITLE,
    text:           applyRefusal.text,
    ticketLinks:    ticketIdsOf(applyRefusal).map(ticketLinkOf),
    disabledReason: applyRefusal.text,
  };
}

/** Each entity without gates, then each that reads the installed default constitution, in the draft's order; none blocks Apply. */
function worthALookOf(record: BoardSetupRecordDocument): WorthALookView[] {
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

function applyCommandOf(record: BoardSetupRecordDocument, resumesBoard: boolean): BoardCommandDocument {
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-apply', setupId: record.setupId, draftRevision: record.draftRevision, resumesBoard,
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
  applyRefusalOf,
  worthALookOf,
});
