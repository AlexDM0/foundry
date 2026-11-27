/**
 * Each entity's work on a live forge over entities (MonoLive, MonoApplyChanges), pure, from the Board facts of the tickets and the jobs:
 * the rail's count of each entity's open tickets and the crossings into it, and the forge row's jobs and merge train; the crossings an
 * entity's page shows now; the words of a package stage run for a crossing; the entity of a ticket in the merge train; each entity's
 * jobs against its cap, worded in jobs; and the tickets in flight grouped by the entity whose stage they run. A ticket in a package stage
 * runs at the crossed package and counts there as a crossing from its own entity, never as one of its own entity's tickets.
 */
import type { BoardDocument }                                             from '../../../../@types/board/BoardDocument.ts';
import type { BoardJobDocument }                                          from '../../../../@types/board/BoardJobDocuments.ts';
import type { BoardAppliedPipelineDocument, BoardPipelineEntityDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardTicketStageFactsDocument }                             from '../../../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState }                                         from '../../../../@types/board/BoardVocabulary.ts';
import type { BoardRoute }                                                from '../../../../shared/BoardRouter.ts';
import { PipelinePhaseModel }                                             from '../flow/PipelinePhaseModel.ts';
import { FlowActivityPanelModel, type OccupantChipView }                  from './FlowActivityPanelModel.ts';

/** A ticket as the entity work reads it: its page facts beside the served flags of its status. */
export interface EntityWorkTicket {
  readonly ticketId:             string;
  readonly displayState:         BoardDisplayState;
  readonly entity:               string | null;
  readonly stage:                BoardTicketStageFactsDocument | null;
  readonly isClosed:             boolean;
  readonly noAgentHasPickedItUp: boolean;
}

export type EntityWorkFacts = Pick<BoardDocument, 'pipeline' | 'jobs' | 'launchSlots' | 'concurrency' | 'page'>;

/** A crossing's package stage, which an entity's page shows under "Crossing now". */
export interface CrossingNowView {
  readonly key:           string;
  readonly ticketId:      string;
  readonly route:         BoardRoute;
  readonly homeEntity:    string;
  readonly packageEntity: string;
  readonly stageText:     string;
}

export interface EntityConcurrencyRowView {
  readonly key:            string;
  readonly entityKey:      string;
  /** "3 jobs", "Board limit" for an entity without a cap of its own, or "For a person" for a root kept for a person. */
  readonly capText:        string;
  /** "1", "1 · crossing from web", or "No jobs" for a root kept for a person. */
  readonly runningText:    string;
  readonly atCap:          boolean;
  readonly waitingTickets: readonly OccupantChipView[];
}

export interface InFlightTicketView {
  readonly chip:         OccupantChipView;
  /** "crossing from web" for a ticket that runs a package stage of another entity's crossing. */
  readonly crossingText: string | null;
}

export interface InFlightGroupView {
  readonly key:     string;
  /** Null for the tickets that name no entity yet. */
  readonly entity:  string | null;
  readonly tickets: readonly InFlightTicketView[];
}

const PACKAGE_STAGE_WORDS: Readonly<Record<'package-build' | 'package-review', string>> = Object.freeze({
  'package-build':  'Package build',
  'package-review': 'Package review',
});

const NO_ENTITY_GROUP_KEY = 'no-entity';

/** Where a chip with no detail of its own would lead: the board's first tab, as no detail opens. */
const DETAIL_FALLBACK_ROUTE: BoardRoute = Object.freeze({ tab: 'kanban', item: null });

function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Every ticket the page facts name; one the board serves no ticket for counts as closed, as nothing more can be told of it. */
function ticketsOf(facts: Pick<EntityWorkFacts, 'page'>): readonly EntityWorkTicket[] {
  const ticketById = new Map(facts.page.tickets.map((ticket) => [ticket.id, ticket]));
  return facts.page.facts.tickets.map((pageFacts) => {
    const ticketFacts = ticketById.get(pageFacts.ticketId)?.facts ?? null;
    return {
      ticketId:             pageFacts.ticketId,
      displayState:         pageFacts.displayState,
      entity:               pageFacts.entity,
      stage:                pageFacts.stage,
      isClosed:             ticketFacts?.isClosed ?? true,
      noAgentHasPickedItUp: ticketFacts?.noAgentHasPickedItUp ?? false,
    };
  });
}

function ticketIsOpen(ticket: Pick<EntityWorkTicket, 'isClosed'>): boolean {
  return !ticket.isClosed;
}

function openTicketsOf(facts: Pick<EntityWorkFacts, 'page'>): EntityWorkTicket[] {
  return ticketsOf(facts).filter((ticket) => ticketIsOpen(ticket));
}

/** An agent has claimed the ticket and it is not settled: it stands on a phase, not ready or waiting for a slot. */
function ticketIsOnAPhase(ticket: Pick<EntityWorkTicket, 'isClosed' | 'noAgentHasPickedItUp'>): boolean {
  return ticketIsOpen(ticket) && !ticket.noAgentHasPickedItUp;
}

/** The package stage a ticket of another entity runs now; null for any other stage, and for a ticket that names no entity. */
function packageStageOf(ticket: EntityWorkTicket): { readonly name: 'package-build' | 'package-review'; readonly packageEntity: string; readonly homeEntity: string } | null {
  const { stage, entity } = ticket;
  if (stage === null || entity === null || stage.entity === entity) return null;
  if (stage.name === 'package-build' || stage.name === 'package-review') return { name: stage.name, packageEntity: stage.entity, homeEntity: entity };
  return null;
}

/** The entity whose agent runs the ticket's next job: its stage's, else its own; null while it names none. */
function launchingEntityOf(ticket: EntityWorkTicket): string | null {
  return ticket.stage?.entity ?? ticket.entity;
}

function ticketOf(ticketId: string, facts: Pick<EntityWorkFacts, 'page'>): EntityWorkTicket | null {
  return ticketsOf(facts).find((ticket) => ticket.ticketId === ticketId) ?? null;
}

/**
 * "2 tickets", "1 ticket · 1 crossing", "No tickets": the entity's tickets on its own phases, and the crossings that run a package stage
 * in it now. A ready ticket, or one waiting for a slot, stands on no phase yet and counts nowhere.
 */
function railActivityTextOf(entityKey: string, facts: Pick<EntityWorkFacts, 'page'>): string {
  const openTickets = openTicketsOf(facts);
  const ownCount = openTickets.filter((ticket) => ticket.entity === entityKey && ticketIsOnAPhase(ticket) && packageStageOf(ticket) === null).length;
  const crossingCount = openTickets.filter((ticket) => packageStageOf(ticket)?.packageEntity === entityKey).length;
  const parts = [
    ...(ownCount === 0 ? [] : [countText(ownCount, 'ticket', 'tickets')]),
    ...(crossingCount === 0 ? [] : [countText(crossingCount, 'crossing', 'crossings')]),
  ];
  return parts.length === 0 ? 'No tickets' : parts.join(' · ');
}

/** "2 of 6 jobs · 1 merging, 2 waiting": the board's jobs in flight against its limit, then the merge train; null without a limit. */
function forgeRailActivityTextOf(facts: Pick<EntityWorkFacts, 'concurrency' | 'pipeline'>): string {
  const { concurrency } = facts;
  const jobsText = `${String(concurrency.agentsInFlight)} of ${countText(concurrency.limit, 'job', 'jobs')}`;
  const { flow } = facts.pipeline;
  if (flow === null) return jobsText;
  const trainNodeIds = new Set(PipelinePhaseModel.trainNodeIdsOf(flow));
  const queueNodeIds = new Set(PipelinePhaseModel.queueNodeIdsOf(flow));
  const tickets = flow.occupants.filter((occupant) => occupant.occupantKind === 'ticket');
  const mergingCount = tickets.filter((occupant) => trainNodeIds.has(occupant.nodeId)).length;
  const waitingCount = tickets.filter((occupant) => queueNodeIds.has(occupant.nodeId)).length;
  if (mergingCount === 0 && waitingCount === 0) return jobsText;
  return `${jobsText} · ${String(mergingCount)} merging, ${String(waitingCount)} waiting`;
}

function stageTextOf(name: 'package-build' | 'package-review', packageEntity: string): string {
  return name === 'package-build'
    ? `package build, with ${packageEntity}’s constitution, builder and gates`
    : `package review, by ${packageEntity}’s reviewer`;
}

/** The open crossings that run a package stage now, out of the entity or into it, in the facts' order. */
function crossingsNowOf(entityKey: string, facts: Pick<EntityWorkFacts, 'page'>): CrossingNowView[] {
  return openTicketsOf(facts).flatMap((ticket) => {
    const packageStage = packageStageOf(ticket);
    if (packageStage === null || (packageStage.homeEntity !== entityKey && packageStage.packageEntity !== entityKey)) return [];
    const [chip] = FlowActivityPanelModel.inFlightChipsOf([ticket.ticketId]);
    return [{
      key:           ticket.ticketId,
      ticketId:      ticket.ticketId,
      route:         chip?.route ?? DETAIL_FALLBACK_ROUTE,
      homeEntity:    packageStage.homeEntity,
      packageEntity: packageStage.packageEntity,
      stageText:     stageTextOf(packageStage.name, packageStage.packageEntity),
    }];
  });
}

/** "Package build of a crossing from web", for an activity row of a ticket that runs another entity's package stage; null otherwise. */
function crossingActivityTextOf(ticketId: string, facts: Pick<EntityWorkFacts, 'page'>): string | null {
  const ticket = ticketOf(ticketId, facts);
  const packageStage = ticket === null ? null : packageStageOf(ticket);
  if (packageStage === null) return null;
  return `${PACKAGE_STAGE_WORDS[packageStage.name]} of a crossing from ${packageStage.homeEntity}`;
}

/** The entity a ticket names; null while it names none. */
function ticketEntityOf(ticketId: string, facts: Pick<EntityWorkFacts, 'page'>): string | null {
  return ticketOf(ticketId, facts)?.entity ?? null;
}

function storedEntitiesOf(applied: BoardAppliedPipelineDocument): Readonly<Record<string, BoardPipelineEntityDocument>> {
  return applied.readingVerdict === 'readable' ? applied.pipeline.entities ?? {} : {};
}

/** The jobs that hold a launch slot, as the board serves them. */
function slotJobsOf(facts: Pick<EntityWorkFacts, 'jobs' | 'launchSlots'>): BoardJobDocument[] {
  const { slotJobIds } = facts.launchSlots;
  return facts.jobs.filter((job) => slotJobIds.includes(job.id));
}

/** The other entities whose crossings the entity's running jobs serve, in the jobs' order. */
function crossingHomesOf(entityKey: string, runningJobs: readonly BoardJobDocument[], facts: Pick<EntityWorkFacts, 'page'>): string[] {
  const homes = runningJobs.flatMap((job) => job.ticketIds.flatMap((ticketId) => {
    const home = ticketEntityOf(ticketId, facts);
    return home === null || home === entityKey ? [] : [home];
  }));
  return [...new Set(homes)];
}

function entityIsKeptForAPerson(entity: BoardPipelineEntityDocument): boolean {
  return entity.kind === 'root' && entity.gates.length === 0;
}

/**
 * One row per stored entity, in the pipeline's order (E72): its cap, or the board's limit alone; its jobs that hold a slot, naming the
 * entities whose crossings they serve; and its ready tickets that wait for a slot, with whether it stands at its cap. A root kept for a
 * person runs no jobs, so its row says so.
 */
function concurrencyRowsOf(facts: EntityWorkFacts): EntityConcurrencyRowView[] {
  const slotJobs = slotJobsOf(facts);
  const readyTicketIds = facts.page.facts.readyTickets.filter((ready) => !ready.isHeld).map((ready) => ready.id);
  const ticketIdsWithJob = new Set(slotJobs.flatMap((job) => job.ticketIds));
  return Object.entries(storedEntitiesOf(facts.pipeline.applied)).map(([entityKey, entity]): EntityConcurrencyRowView => {
    if (entityIsKeptForAPerson(entity)) {
      return {
        key: entityKey, entityKey, capText: 'For a person', runningText: 'No jobs', atCap: false, waitingTickets: []
      };
    }
    const runningJobs = slotJobs.filter((job) => job.entity === entityKey);
    const crossingHomes = crossingHomesOf(entityKey, runningJobs, facts);
    const waitingTicketIds = readyTicketIds.filter((ticketId) => {
      const ticket = ticketOf(ticketId, facts);
      return ticket !== null && launchingEntityOf(ticket) === entityKey && !ticketIdsWithJob.has(ticketId);
    });
    return {
      key:            entityKey,
      entityKey,
      capText:        entity.concurrency === null ? 'Board limit' : countText(entity.concurrency, 'job', 'jobs'),
      runningText:    crossingHomes.length === 0 ? String(runningJobs.length) : `${String(runningJobs.length)} · crossing from ${crossingHomes.join(', ')}`,
      atCap:          entity.concurrency !== null && runningJobs.length >= entity.concurrency,
      waitingTickets: FlowActivityPanelModel.inFlightChipsOf(waitingTicketIds),
    };
  });
}

/** Where a ticket in flight runs: the crossed package during a package stage, else its own entity; null while it names none. */
function inFlightPlaceOf(ticket: EntityWorkTicket | null): { readonly entity: string | null; readonly crossingText: string | null } {
  if (ticket === null) return { entity: null, crossingText: null };
  const packageStage = packageStageOf(ticket);
  if (packageStage !== null) return { entity: packageStage.packageEntity, crossingText: `crossing from ${packageStage.homeEntity}` };
  return { entity: ticket.entity, crossingText: null };
}

/**
 * The tickets in flight in one group per entity, in the entities' order and then any entity they name beyond it, each ticket in the
 * facts' order; the tickets that name no entity yet come last.
 */
function inFlightGroupsOf(ticketIds: readonly string[], tickets: readonly EntityWorkTicket[], entityOrder: readonly string[]): InFlightGroupView[] {
  const placed = ticketIds.map((ticketId) => {
    const place = inFlightPlaceOf(tickets.find((ticket) => ticket.ticketId === ticketId) ?? null);
    const [chip] = FlowActivityPanelModel.inFlightChipsOf([ticketId]);
    return {
      ...place,
      view: {
        chip: chip ?? {
          key: `ticket-${ticketId}`, text: ticketId, route: DETAIL_FALLBACK_ROUTE, state: 'in-progress' as const
        },
        crossingText: place.crossingText
      }
    };
  });
  const namedEntities = placed.flatMap((ticket) => (ticket.entity === null ? [] : [ticket.entity]));
  const groupEntities = [...new Set([...entityOrder.filter((entity) => namedEntities.includes(entity)), ...namedEntities])];
  const groups: InFlightGroupView[] = groupEntities.map((entity) => ({
    key:     `entity-${entity}`,
    entity,
    tickets: placed.filter((ticket) => ticket.entity === entity).map((ticket) => ticket.view),
  }));
  const unnamed = placed.filter((ticket) => ticket.entity === null).map((ticket) => ticket.view);
  return unnamed.length === 0 ? groups : [...groups, { key: NO_ENTITY_GROUP_KEY, entity: null, tickets: unnamed }];
}

export const EntityWorkModel = Object.freeze({
  ticketsOf,
  railActivityTextOf,
  forgeRailActivityTextOf,
  crossingsNowOf,
  crossingActivityTextOf,
  ticketEntityOf,
  concurrencyRowsOf,
  inFlightGroupsOf,
});
