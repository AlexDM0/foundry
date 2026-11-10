/**
 * Which detail the hash route opens in place over a board tab, and the fragment that opens it. The panel opens over Kanban, Waves,
 * Progress, Epics and Tickets alike, so a route keeps its tab and names the item after it: `#<tab>/<form>/<id>`. A second click on what
 * is open closes it; an epic is no detail form but a place on the Epics tab, `#epics/epic/<key>`. The ticket form opens on a section,
 * `#<tab>/ticket/<id>/<section>`, Overview with none; the section is where the form stands, never which item it is.
 */
import type { BridgeRoute, BridgeTab } from './HashRouter.ts';

export const DETAIL_TABS = ['kanban', 'waves', 'progress', 'epics', 'tickets'] as const;

export type DetailTab = typeof DETAIL_TABS[number];

export const TICKET_SECTIONS = ['overview', 'timeline', 'activity', 'description'] as const;

export type TicketSection = typeof TICKET_SECTIONS[number];

export const DEFAULT_TICKET_SECTION: TicketSection = 'overview';

/**
 * The detail panel's forms: `ticket` (its sections Overview, Timeline, Activity and Description; Overview without `section`) from a
 * Kanban or wave card; the row form (Task, Phases, Ticket, Log) from a Gantt row, `task-row` by the row's id, or from a ticket-table line,
 * `ticket-row` by the ticket whose own row it shows; `draft` a filing draft, read-only.
 */
export type DetailItem =
  | { readonly form: 'ticket'; readonly ticketId: string; readonly section?: TicketSection }
  | { readonly form: 'task-row'; readonly taskId: number }
  | { readonly form: 'ticket-row'; readonly ticketId: string }
  | { readonly form: 'draft'; readonly draftId: string };

export type DetailForm = DetailItem['form'];

const EPIC_ITEM_FORM = 'epic';

const TASK_ID_PATTERN = /^\d+$/;

function isDetailTab(tab: BridgeTab): tab is DetailTab {
  return (DETAIL_TABS as readonly string[]).includes(tab);
}

function isTicketSection(text: string): text is TicketSection {
  return (TICKET_SECTIONS as readonly string[]).includes(text);
}

/** The item's identity, which a section never changes: what an opener toggles and what the panel cross-fades on. */
function itemTextOf(item: DetailItem): string {
  switch (item.form) {
    case 'ticket':
    case 'ticket-row':
      return `${item.form}/${item.ticketId}`;
    case 'task-row':
      return `${item.form}/${String(item.taskId)}`;
    case 'draft':
      return `${item.form}/${item.draftId}`;
    default:
      return '';
  }
}

/** The route's item text: the identity, then a ticket form's section unless it is Overview. */
function routeItemTextOf(item: DetailItem): string {
  if (item.form !== 'ticket' || item.section === undefined || item.section === DEFAULT_TICKET_SECTION) return itemTextOf(item);
  return `${itemTextOf(item)}/${item.section}`;
}

/** The route a section tab of the ticket form links to, over the tab the panel is on. */
function sectionRouteOf(tab: DetailTab, ticketId: string, section: TicketSection): BridgeRoute {
  return { tab, item: routeItemTextOf({ form: 'ticket', ticketId, section }) };
}

/** An unknown or empty section reads as Overview, so a stale link still opens the ticket; a further segment opens nothing. */
function ticketItemOf(identifier: string): DetailItem | null {
  const [ticketId = '', sectionText, ...further] = identifier.split('/');
  if (ticketId === '' || further.length > 0) return null;
  if (sectionText === undefined || !isTicketSection(sectionText) || sectionText === DEFAULT_TICKET_SECTION) return { form: 'ticket', ticketId };
  return { form: 'ticket', ticketId, section: sectionText };
}

/** The detail a route's item names, or `null` for none, an unknown form or an id that cannot be the form's. */
function detailItemOf(itemText: string | null): DetailItem | null {
  if (itemText === null) return null;
  const separator = itemText.indexOf('/');
  if (separator < 0) return null;
  const form = itemText.slice(0, separator);
  const identifier = itemText.slice(separator + 1);
  if (identifier === '') return null;
  if (form === 'ticket') return ticketItemOf(identifier);
  if (form === 'ticket-row') return { form, ticketId: identifier };
  if (form === 'draft') return { form, draftId: identifier };
  if (form === 'task-row' && TASK_ID_PATTERN.test(identifier)) return { form, taskId: Number(identifier) };
  return null;
}

/** The detail open over a board tab; a Bridge-only tab's item (`#agents/J12`, `#kanban/merge-queue`) is never one. */
function openDetailOf(route: BridgeRoute): DetailItem | null {
  return isDetailTab(route.tab) ? detailItemOf(route.item) : null;
}

/** The same item, whatever section each stands on. */
function detailItemsAreEqual(first: DetailItem | null, second: DetailItem): boolean {
  return first !== null && itemTextOf(first) === itemTextOf(second);
}

/** The route that opens `item` over `tab`; the same route with the panel closed when `item` is the one already open there. */
function openerRouteOf(tab: DetailTab, openItem: DetailItem | null, item: DetailItem): BridgeRoute {
  return { tab, item: detailItemsAreEqual(openItem, item) ? null : itemTextOf(item) };
}

function epicItemTextOf(epicKey: string): string {
  return `${EPIC_ITEM_FORM}/${epicKey}`;
}

/** The epic a route on the Epics tab points at, or `null`. */
function pointedEpicKeyOf(route: BridgeRoute): string | null {
  if (route.tab !== 'epics' || route.item === null || !route.item.startsWith(`${EPIC_ITEM_FORM}/`)) return null;
  const epicKey = route.item.slice(EPIC_ITEM_FORM.length + 1);
  return epicKey === '' ? null : epicKey;
}

export const DetailRoute = Object.freeze({
  isDetailTab,
  itemTextOf,
  routeItemTextOf,
  sectionRouteOf,
  detailItemOf,
  openDetailOf,
  detailItemsAreEqual,
  openerRouteOf,
  epicItemTextOf,
  pointedEpicKeyOf,
});
