/**
 * The Kanban in monorepo mode, pure: the entity filter (the stored pipeline's entities with their open tickets, and the chosen one), the
 * rail that shows it, which tickets an entity holds, the swimlanes that divide a lane by entity, and the stages of a crossing ticket on its
 * card. A board whose stored pipeline has no entities is in single mode: it gets no filter, no swimlanes and no stages, and the Kanban is
 * unchanged. A ticket belongs to its own entity, and while a crossing runs a package stage, also to that package.
 */
import type { PipelineEntityKind }                                        from '../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { TicketStage, TicketStageName }                              from '../../../src/lib/tracker-model/@types/Task.ts';
import type { KanbanBoardState, KanbanEntityDocument, KanbanTicketFacts } from '../../@types/KanbanBoardState.ts';
import { EntityGroupUtil }                                                from '../../utils/EntityGroupUtil.ts';

export const KANBAN_SWIMLANES = ['by-entity', 'none'] as const;

/** `by-entity`: each lane divides its cards by entity; `none`: as in single mode. */
export type KanbanSwimlanes = typeof KANBAN_SWIMLANES[number];

export const DEFAULT_KANBAN_SWIMLANES: KanbanSwimlanes = 'by-entity';

export const KANBAN_ENTITY_CHOICE_NAME = 'kanban-entity';
export const KANBAN_SWIMLANES_CHOICE_NAME = 'kanban-swimlanes';

export interface KanbanEntityFilterEntity {
  readonly key:             string;
  readonly kind:            PipelineEntityKind;
  /** The open tickets it holds: its own, and a crossing's while a package stage runs in it. */
  readonly openTicketCount: number;
}

/** The entity filter of a board in monorepo mode. */
export interface KanbanEntityFilter {
  /** In the stored pipeline's order. */
  readonly entities:        readonly KanbanEntityFilterEntity[];
  /** The stored choice while it names an entity of the pipeline; `null` shows every entity. */
  readonly chosenEntity:    string | null;
  readonly swimlanes:       KanbanSwimlanes;
  readonly openTicketCount: number;
}

export interface KanbanEntityRailRow {
  /** `null` for the row that shows every entity. */
  readonly entityKey:       string | null;
  readonly name:            string;
  readonly kindText:        string;
  readonly openTicketCount: number;
  readonly selected:        boolean;
  readonly accessibleName:  string;
}

export interface KanbanEntityRailGroup {
  readonly groupKind: PipelineEntityKind;
  readonly label:     string;
  readonly rows:      readonly KanbanEntityRailRow[];
}

export interface KanbanEntityRail {
  readonly allRow:         KanbanEntityRailRow;
  readonly groups:         readonly KanbanEntityRailGroup[];
  readonly nothingMatches: boolean;
}

/** One entity's run of a lane's cards; `entityKey` `null` for the tickets that have no entity yet. */
export interface KanbanSwimlane<Card> {
  readonly entityKey: string | null;
  readonly title:     string;
  readonly cards:     readonly Card[];
}

export type KanbanCrossingStageStatus = 'done' | 'current' | 'upcoming';

export interface KanbanCrossingStage {
  readonly name:      TicketStageName;
  readonly label:     string;
  /** `package`: a stage of the crossed package, which a dashed edge sets apart. */
  readonly owner:     'home' | 'package';
  readonly entityKey: string | null;
  readonly status:    KanbanCrossingStageStatus;
}

/** The stages of a crossing ticket on its card, and the line that says where it is. */
export interface KanbanCrossing {
  readonly stages: readonly KanbanCrossingStage[];
  readonly text:   string;
}

const ALL_ENTITIES_NAME = 'All entities';

const ALL_ENTITIES_KIND_TEXT = 'Every ticket';

export const NO_ENTITY_SWIMLANE_TITLE = 'No entity yet';

const CROSSING_STAGE_ORDER: readonly TicketStageName[] = ['build', 'package-build', 'package-review', 'adapt', 'review'];

const PACKAGE_STAGES: ReadonlySet<TicketStageName> = new Set(['package-build', 'package-review']);

const CROSSING_STAGE_LABELS: Readonly<Record<TicketStageName, string>> = Object.freeze({
  'build':          'Build',
  'package-build':  'Package build',
  'package-review': 'Package review',
  'adapt':          'Adapt',
  'review':         'Review',
});

const CLOSED_STATUSES: ReadonlySet<string> = new Set(['delivered', 'abandoned']);

type PipelineEntities = Readonly<Record<string, KanbanEntityDocument>>;

function entitiesOf(state: Pick<KanbanBoardState, 'pipeline'>): PipelineEntities | null {
  const { pipeline } = state;
  if (pipeline?.readingVerdict !== 'readable') return null;
  const { entities } = pipeline.pipeline;
  return entities === undefined || Object.keys(entities).length === 0 ? null : entities;
}

/** The ticket's own entity, or the package a crossing's package stage runs in. */
function ticketIsInEntity(facts: Pick<KanbanTicketFacts, 'entity' | 'stage'> | undefined, entityKey: string): boolean {
  return facts?.entity === entityKey || facts?.stage?.entity === entityKey;
}

function countedText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** `null` in single mode; the stored entity counts only while the pipeline still names it. */
function entityFilterOf(state: KanbanBoardState, storedEntity: string | null, storedSwimlanes: KanbanSwimlanes): KanbanEntityFilter | null {
  const entities = entitiesOf(state);
  if (entities === null) return null;
  const factsById = new Map(state.page.payload.boardFacts.tickets.map((facts) => [facts.ticketId, facts]));
  const openTickets = state.page.tickets.filter((ticket) => !CLOSED_STATUSES.has(ticket.status));
  return {
    entities: Object.entries(entities).map(([key, entity]) => ({
      key,
      kind:            entity.kind,
      openTicketCount: openTickets.filter((ticket) => ticketIsInEntity(factsById.get(ticket.id), key)).length,
    })),
    chosenEntity:    storedEntity !== null && Object.hasOwn(entities, storedEntity) ? storedEntity : null,
    swimlanes:       storedSwimlanes,
    openTicketCount: openTickets.length,
  };
}

function railRowOf(entity: KanbanEntityFilterEntity, chosenEntity: string | null): KanbanEntityRailRow {
  const kindText = EntityGroupUtil.kindTextOf(entity.kind);
  return {
    entityKey:       entity.key,
    name:            entity.key,
    kindText,
    openTicketCount: entity.openTicketCount,
    selected:        entity.key === chosenEntity,
    accessibleName:  `${entity.key}, ${kindText}, ${countedText(entity.openTicketCount, 'open ticket', 'open tickets')}`,
  };
}

/** The row for every entity leads; the filter text narrows the entities by key or kind, never that row. */
function railOf(filter: KanbanEntityFilter, filterText: string): KanbanEntityRail {
  const rows = filter.entities
    .map((entity) => railRowOf(entity, filter.chosenEntity))
    .filter((row) => EntityGroupUtil.matchesFilter([row.name, row.kindText], filterText));
  const kindByKey = new Map(filter.entities.map((entity) => [entity.key, entity.kind]));
  return {
    allRow: {
      entityKey:       null,
      name:            ALL_ENTITIES_NAME,
      kindText:        ALL_ENTITIES_KIND_TEXT,
      openTicketCount: filter.openTicketCount,
      selected:        filter.chosenEntity === null,
      accessibleName:  `${ALL_ENTITIES_NAME}, ${countedText(filter.openTicketCount, 'open ticket', 'open tickets')}`,
    },
    groups: EntityGroupUtil.groupsOf(rows, (row) => kindByKey.get(row.name) ?? null)
      .map((group) => ({ groupKind: group.groupKind, label: group.label, rows: group.items })),
    nothingMatches: filter.entities.length > 0 && rows.length === 0,
  };
}

/** Each entity's cards in the lane's order, the entities in the rail's order, then the tickets without an entity; an empty run is left out. */
function swimlanesOf<Card>(
  cards: readonly Card[],
  entityKeyOf: (card: Card) => string | null,
  filter: KanbanEntityFilter,
): KanbanSwimlane<Card>[] {
  const kindByKey = new Map(filter.entities.map((entity) => [entity.key, entity.kind]));
  const orderedKeys = EntityGroupUtil.groupsOf(filter.entities.map((entity) => entity.key), (key) => kindByKey.get(key) ?? null)
    .flatMap((group) => group.items);
  const knownKeys = new Set(orderedKeys);
  const swimlanes: KanbanSwimlane<Card>[] = orderedKeys.map((entityKey) => ({ entityKey, title: entityKey, cards: cards.filter((card) => entityKeyOf(card) === entityKey) }));
  const unassignedCards = cards.filter((card) => {
    const entityKey = entityKeyOf(card);
    return entityKey === null || !knownKeys.has(entityKey);
  });
  return [...swimlanes, { entityKey: null, title: NO_ENTITY_SWIMLANE_TITLE, cards: unassignedCards }].filter((swimlane) => swimlane.cards.length > 0);
}

/**
 * The five stages in the order a crossing first runs them: the ones before the current stage done, the rest to come. A return to the
 * package build makes the later stages come again. The package is the current package stage's, else the first package the ticket names.
 */
function crossingOf(stage: TicketStage | undefined, homeEntityKey: string | null, crossedPackages: readonly string[]): KanbanCrossing | null {
  if (stage === undefined) return null;
  const packageKey = PACKAGE_STAGES.has(stage.name) ? stage.entity : crossedPackages[0] ?? null;
  const currentIndex = CROSSING_STAGE_ORDER.indexOf(stage.name);
  const stages = CROSSING_STAGE_ORDER.map((name, index): KanbanCrossingStage => {
    const owner = PACKAGE_STAGES.has(name) ? 'package' : 'home';
    const status: KanbanCrossingStageStatus = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
    return {
      name, label: CROSSING_STAGE_LABELS[name], owner, entityKey: owner === 'package' ? packageKey : homeEntityKey, status
    };
  });
  const runsIn = PACKAGE_STAGES.has(stage.name) ? stage.entity : homeEntityKey ?? stage.entity;
  return {
    stages,
    text: `${CROSSING_STAGE_LABELS[stage.name]} in ${runsIn}, stage ${currentIndex + 1} of ${CROSSING_STAGE_ORDER.length}`,
  };
}

export const KanbanEntityFilterModel = Object.freeze({
  entityFilterOf, ticketIsInEntity, railOf, swimlanesOf, crossingOf
});
