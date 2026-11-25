/**
 * The board's routes: its menu in its order, the tabs a route can open, and a route as the tab and the item it opens. A route is written
 * into Gaia's address as `#forge/<trackerId>/<place>[/<item segments>]`, each segment encoded, so a link survives a reload and needs no
 * server route. The Progress views are places under `progress/` (`progress/kanban`, `progress/waves`, `progress/gantt`); a link written
 * before they were grouped (`kanban`, `waves`, `progress`) reads as the view it named, and `kanban/ticket/<id>` and `kanban/draft/<id>` as
 * the detail on Tickets, so an old link keeps working (`docs/design/board-menu.md`). A path naming no place falls back to the stored tab, then
 * the first; a tab the board does not show (Waves without a dependency, Epics without an epic, every tab but Pipeline on a board with no
 * readable pipeline) falls back to the first tab it shows. A route-only page, such as a ticket's documents, is reached only by its route with
 * an item, never from the menu or the stored tab. The router reads and writes no address bar: whoever mounts the board hands it the path
 * and the way to go.
 */
import type { BoardTargetDocument }                         from '../../@types/board/BoardTargetDocument.ts';
import type { BoardTargetSubject, BoardTicketDocumentKind } from '../../@types/board/BoardVocabulary.ts';

/** The tabs a route opens, in the menu's order with the Progress views in its place, then the pages reached only by a route. */
export const BOARD_TABS = ['tickets', 'kanban', 'waves', 'gantt', 'epics', 'agents', 'questions', 'assistant', 'intake', 'pipeline', 'documents'] as const;

export type BoardTab = typeof BOARD_TABS[number];

/** The views the Progress entry of the menu groups, the Kanban its default. */
export const PROGRESS_VIEWS = ['kanban', 'waves', 'gantt'] as const satisfies readonly BoardTab[];

export type ProgressView = typeof PROGRESS_VIEWS[number];

export const [DEFAULT_PROGRESS_VIEW] = PROGRESS_VIEWS;

/** The board's menu in its order: each entry a tab, but Progress, which opens one of its views. */
export const BOARD_MENU_ENTRIES = ['tickets', 'progress', 'epics', 'agents', 'questions', 'assistant', 'intake', 'pipeline'] as const;

export type BoardMenuEntry = typeof BOARD_MENU_ENTRIES[number];

const PROGRESS_PLACE = 'progress';

/** A ticket's spec and plan, at `documents/ticket/<ticketId>/<spec|plan>`: never in the menu, never stored as the tab to open. */
const ROUTE_ONLY_TABS: ReadonlySet<BoardTab> = new Set<BoardTab>(['documents']);

const DOCUMENTS_ITEM_FORM = 'ticket';

const DOCUMENT_KINDS: readonly BoardTicketDocumentKind[] = ['spec', 'plan'];

/** The detail forms an old `kanban/<form>/<id>` link opened, which open on Tickets now. */
const DETAIL_FORMS_MOVED_TO_TICKETS: ReadonlySet<string> = new Set(['ticket', 'draft']);

export interface BoardRoute {
  readonly tab:  BoardTab;
  /** The item the route opens in its tab, `null` for the tab alone. */
  readonly item: string | null;
}

export const TAB_CHOICE_NAME = 'tab';
export const [DEFAULT_TAB] = BOARD_TABS;

/** The board's preference holding the Progress view this viewer opened last. */
export const PROGRESS_VIEW_CHOICE_NAME = 'progress-view';

const ITEM_SEGMENT_SEPARATOR = '/';

/** The tab each subject opens, and the detail form its id is written in there; `null` writes the id itself, and an incident opens the tab alone. */
const PLACE_OF_SUBJECT: Readonly<Record<BoardTargetSubject, { readonly tab: BoardTab; readonly detailForm: string | null; readonly namesItem: boolean }>> = {
  decision: { tab: 'questions', detailForm: null, namesItem: true },
  ticket:   { tab: 'tickets', detailForm: 'ticket', namesItem: true },
  draft:    { tab: 'tickets', detailForm: 'draft', namesItem: true },
  job:      { tab: 'agents', detailForm: null, namesItem: true },
  incident: { tab: 'assistant', detailForm: null, namesItem: false },
};

function isProgressView(name: string | null | undefined): name is ProgressView {
  return (PROGRESS_VIEWS as readonly (string | null | undefined)[]).includes(name);
}

/** A tab written as the first segment of a path: every tab but a Progress view, which is written under `progress/`. */
function isTopLevelTab(name: string): name is Exclude<BoardTab, ProgressView> {
  return (BOARD_TABS as readonly string[]).includes(name) && !isProgressView(name);
}

function itemOf(itemSegments: readonly string[]): string | null {
  const item = itemSegments.join(ITEM_SEGMENT_SEPARATOR);
  return item === '' ? null : item;
}

/** An old `kanban` link: a ticket's or a draft's detail opens on Tickets, anything else on the Kanban. */
function oldKanbanRouteOf(itemSegments: readonly string[]): BoardRoute {
  const [form] = itemSegments;
  const tab = form !== undefined && DETAIL_FORMS_MOVED_TO_TICKETS.has(form) && itemSegments.length > 1 ? 'tickets' : 'kanban';
  return { tab, item: itemOf(itemSegments) };
}

/**
 * The route a place and its decoded item segments name, `null` for a place that is none: a tab, `progress/<view>`, or an old link's
 * place, `progress` alone for the Gantt, `kanban` and `waves`.
 */
function routeOfPlace(placeName: string, itemSegments: readonly string[]): BoardRoute | null {
  if (placeName === PROGRESS_PLACE) {
    const [viewName, ...viewItemSegments] = itemSegments;
    if (isProgressView(viewName)) return { tab: viewName, item: itemOf(viewItemSegments) };
    return { tab: 'gantt', item: itemOf(itemSegments) };
  }
  if (placeName === 'kanban') return oldKanbanRouteOf(itemSegments);
  if (placeName === 'waves') return { tab: 'waves', item: itemOf(itemSegments) };
  return isTopLevelTab(placeName) ? { tab: placeName, item: itemOf(itemSegments) } : null;
}

/** Whether a place and its item segments are written as an old link does, which the address replaces by the route's own fragment. */
function placeIsOld(placeName: string, itemSegments: readonly string[]): boolean {
  if (placeName === 'kanban' || placeName === 'waves') return true;
  return placeName === PROGRESS_PLACE && !isProgressView(itemSegments[0]);
}

/** A pasted or cut-short link can carry a malformed escape; its segment stays as written, so the route never throws. */
function decodedSegmentOf(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** A stored tab, written before the Progress views were grouped or after, as the tab it names; `null` for none. */
function storedTabOf(storedTab: string | null): BoardTab | null {
  if (storedTab === null) return null;
  const tab = isProgressView(storedTab) ? storedTab : routeOfPlace(storedTab, [])?.tab ?? null;
  return tab === null || ROUTE_ONLY_TABS.has(tab) ? null : tab;
}

/** The route of the board's part of the address, `<place>[/<item segments>]` after the tracker id; `null` or a path naming no place is the stored tab. */
function routeOf(boardPath: string | null, storedTab: string | null): BoardRoute {
  const [placeName = '', ...itemParts] = (boardPath ?? '').split(ITEM_SEGMENT_SEPARATOR);
  const route = routeOfPlace(placeName, itemParts.map(decodedSegmentOf));
  return route ?? { tab: storedTabOf(storedTab) ?? DEFAULT_TAB, item: null };
}

function placePathOf(tab: BoardTab): string {
  return isProgressView(tab) ? `${PROGRESS_PLACE}${ITEM_SEGMENT_SEPARATOR}${tab}` : tab;
}

function fragmentOf(trackerId: string, route: BoardRoute): string {
  const trackerPath = `#forge/${encodeURIComponent(trackerId)}/${placePathOf(route.tab)}`;
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

/** The menu entry a tab stands under: Progress for its views, and Tickets for a ticket's documents, which a draft opens into. */
function menuEntryOf(tab: BoardTab): BoardMenuEntry {
  if (isProgressView(tab)) return 'progress';
  return tab === 'documents' ? 'tickets' : tab;
}

/** The menu entries of the shown tabs, in the menu's order: Progress while any of its views shows. */
function shownMenuEntriesOf(shownTabs: readonly BoardTab[]): BoardMenuEntry[] {
  const shownEntries = new Set(shownTabs.map(menuEntryOf));
  return BOARD_MENU_ENTRIES.filter((entry) => shownEntries.has(entry));
}

/** The Progress views the board shows, in their order. */
function shownProgressViewsOf(shownTabs: readonly BoardTab[]): ProgressView[] {
  return PROGRESS_VIEWS.filter((view) => shownTabs.includes(view));
}

/** The view the Progress entry opens: the one open now, else the stored one while the board shows it, else the Kanban. */
function progressViewToOpenOf(shownTab: BoardTab, storedView: string | null, shownTabs: readonly BoardTab[]): ProgressView {
  if (isProgressView(shownTab)) return shownTab;
  return isProgressView(storedView) && shownTabs.includes(storedView) ? storedView : DEFAULT_PROGRESS_VIEW;
}

/** The route a menu entry opens: its tab, or for Progress the view it opens. */
function routeOfMenuEntry(entry: BoardMenuEntry, progressViewToOpen: ProgressView): BoardRoute {
  return { tab: entry === 'progress' ? progressViewToOpen : entry, item: null };
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

/** The route that opens a served target: its question, its ticket or draft on Tickets, its job, or the Assistant for an incident. */
function routeOfTarget(target: BoardTargetDocument): BoardRoute {
  const { tab, detailForm, namesItem } = PLACE_OF_SUBJECT[target.subject];
  if (!namesItem) return { tab, item: null };
  return { tab, item: detailForm === null ? target.id : `${detailForm}${ITEM_SEGMENT_SEPARATOR}${target.id}` };
}

export const BoardRouter = Object.freeze({
  routeOf,
  routeOfPlace,
  placeIsOld,
  fragmentOf,
  shownTabsOf,
  shownRouteOf,
  menuEntryOf,
  shownMenuEntriesOf,
  shownProgressViewsOf,
  progressViewToOpenOf,
  routeOfMenuEntry,
  routeOfTarget,
  documentsRouteOf,
  documentOfRoute,
  isProgressView,
});
