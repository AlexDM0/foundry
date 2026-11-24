/**
 * The board's routes: its tabs in their order, and a route as the tab and the item it opens. A route is written into Gaia's address as
 * `#forge/<trackerId>/<tab>[/<item segments>]`, each segment encoded, so a link survives a reload and needs no server route. A path naming no
 * tab falls back to the stored tab, then the first; a tab the board does not show (Waves without a dependency, Epics without an epic, every
 * tab but Pipeline on a board with no readable pipeline) falls back to the first tab it shows. A route-only page, such as a ticket's
 * documents, is reached only by its route with an item, never from the tab bar or the stored tab. The router reads and writes no address
 * bar: whoever mounts the board hands it the path and the way to go.
 */
import type { BoardTargetDocument }                         from '../../@types/board/BoardTargetDocument.ts';
import type { BoardTargetSubject, BoardTicketDocumentKind } from '../../@types/board/BoardVocabulary.ts';

/** The board tabs in their order, then the others, Pipeline last, then the pages reached only by a route. */
export const BOARD_TABS = ['kanban', 'waves', 'progress', 'epics', 'tickets', 'agents', 'questions', 'assistant', 'intake', 'pipeline', 'documents'] as const;

export type BoardTab = typeof BOARD_TABS[number];

/** A ticket's spec and plan, at `documents/ticket/<ticketId>/<spec|plan>`: never in the tab bar, never stored as the tab to open. */
const ROUTE_ONLY_TABS: ReadonlySet<BoardTab> = new Set<BoardTab>(['documents']);

const DOCUMENTS_ITEM_FORM = 'ticket';

const DOCUMENT_KINDS: readonly BoardTicketDocumentKind[] = ['spec', 'plan'];

export interface BoardRoute {
  readonly tab:  BoardTab;
  /** The item the route opens in its tab, `null` for the tab alone. */
  readonly item: string | null;
}

export const TAB_CHOICE_NAME = 'tab';
export const [DEFAULT_TAB] = BOARD_TABS;

const ITEM_SEGMENT_SEPARATOR = '/';

/** The tab each subject opens, and the detail form its id is written in there; `null` writes the id itself, and an incident opens the tab alone. */
const PLACE_OF_SUBJECT: Readonly<Record<BoardTargetSubject, { readonly tab: BoardTab; readonly detailForm: string | null; readonly namesItem: boolean }>> = {
  decision: { tab: 'questions', detailForm: null, namesItem: true },
  ticket:   { tab: 'kanban', detailForm: 'ticket', namesItem: true },
  draft:    { tab: 'kanban', detailForm: 'draft', namesItem: true },
  job:      { tab: 'agents', detailForm: null, namesItem: true },
  incident: { tab: 'assistant', detailForm: null, namesItem: false },
};

function isBoardTab(name: string | null): name is BoardTab {
  return (BOARD_TABS as readonly (string | null)[]).includes(name);
}

/** A pasted or cut-short link can carry a malformed escape; its segment stays as written, so the route never throws. */
function decodedSegmentOf(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The route of the board's part of the address, `<tab>[/<item segments>]` after the tracker id; `null` or a path naming no tab is the stored tab. */
function routeOf(boardPath: string | null, storedTab: string | null): BoardRoute {
  const [tabName = '', ...itemParts] = (boardPath ?? '').split(ITEM_SEGMENT_SEPARATOR);
  const item = itemParts.map(decodedSegmentOf).join(ITEM_SEGMENT_SEPARATOR);
  if (isBoardTab(tabName)) return { tab: tabName, item: item === '' ? null : item };
  return { tab: isBoardTab(storedTab) && !ROUTE_ONLY_TABS.has(storedTab) ? storedTab : DEFAULT_TAB, item: null };
}

function fragmentOf(trackerId: string, route: BoardRoute): string {
  const trackerPath = `#forge/${encodeURIComponent(trackerId)}/${route.tab}`;
  if (route.item === null) return trackerPath;
  return `${trackerPath}/${route.item.split(ITEM_SEGMENT_SEPARATOR).map(encodeURIComponent).join(ITEM_SEGMENT_SEPARATOR)}`;
}

/** The route itself while its tab is shown, or while it is a route-only page with its item, else the first shown tab alone. */
function shownRouteOf(route: BoardRoute, shownTabs: readonly BoardTab[]): BoardRoute {
  const [firstShownTab = DEFAULT_TAB] = shownTabs;
  if (ROUTE_ONLY_TABS.has(route.tab)) return route.item === null ? { tab: firstShownTab, item: null } : route;
  return shownTabs.includes(route.tab) ? route : { tab: firstShownTab, item: null };
}

/**
 * Every tab but Waves on a board where no ticket depends on another, and Epics on one without epics; `null` is unknown, before the first
 * board. A board with no readable pipeline shows only Pipeline, and Pipeline shows only once the board says it has a readable one.
 */
function shownTabsOf(boardHasWaves: boolean | null, boardHasEpics: boolean | null, boardHasPipeline: boolean | null): BoardTab[] {
  if (boardHasPipeline === false) return ['pipeline'];
  return BOARD_TABS.filter((tab) => !ROUTE_ONLY_TABS.has(tab) && !(tab === 'waves' && boardHasWaves === false) && !(tab === 'epics' && boardHasEpics === false)
    && !(tab === 'pipeline' && boardHasPipeline === null));
}

/** The page of a ticket's document. */
function documentsRouteOf(ticketId: string, document: BoardTicketDocumentKind): BoardRoute {
  return { tab: 'documents', item: [DOCUMENTS_ITEM_FORM, ticketId, document].join(ITEM_SEGMENT_SEPARATOR) };
}

/** The ticket and document a documents route names, `null` for an item of another form. */
function documentOfRoute(route: BoardRoute): { readonly ticketId: string; readonly document: BoardTicketDocumentKind } | null {
  if (route.tab !== 'documents' || route.item === null) return null;
  const [form, ticketId, document, ...rest] = route.item.split(ITEM_SEGMENT_SEPARATOR);
  const kind = DOCUMENT_KINDS.find((candidate) => candidate === document);
  if (form !== DOCUMENTS_ITEM_FORM || ticketId === undefined || ticketId === '' || kind === undefined || rest.length > 0) return null;
  return { ticketId, document: kind };
}

/** The route that opens a served target: its question, its ticket or draft on the Kanban, its job, or the Assistant for an incident. */
function routeOfTarget(target: BoardTargetDocument): BoardRoute {
  const { tab, detailForm, namesItem } = PLACE_OF_SUBJECT[target.subject];
  if (!namesItem) return { tab, item: null };
  return { tab, item: detailForm === null ? target.id : `${detailForm}${ITEM_SEGMENT_SEPARATOR}${target.id}` };
}

export const BoardRouter = Object.freeze({
  routeOf, fragmentOf, shownTabsOf, shownRouteOf, routeOfTarget, documentsRouteOf, documentOfRoute,
});
