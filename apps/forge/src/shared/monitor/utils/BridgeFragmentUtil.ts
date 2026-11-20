/**
 * How a Bridge route is written: `#<tab>` or `#<tab>/<item>`, and a detail form's item `<form>/<id>`. The Bridge's router and the monitor
 * snapshot write a route alike, so a monitor's link opens what the Bridge's own link opens.
 */

/** A thing on the board a link opens. */
export type FragmentSubject = 'decision' | 'ticket' | 'draft' | 'job' | 'incident';

/** The tab each subject opens, and the detail form its id is written in there; `null` writes the id itself, and an incident opens the tab alone. */
const PLACE_OF_SUBJECT: Readonly<Record<FragmentSubject, { tab: string; detailForm: string | null; namesItem: boolean }>> = {
  decision: { tab: 'questions', detailForm: null, namesItem: true },
  ticket:   { tab: 'kanban', detailForm: 'ticket', namesItem: true },
  draft:    { tab: 'kanban', detailForm: 'draft', namesItem: true },
  job:      { tab: 'agents', detailForm: null, namesItem: true },
  incident: { tab: 'assistant', detailForm: null, namesItem: false },
};

/** Each segment of the item is encoded on its own, so an item's own `/` reads as a separator in the address bar. */
function fragmentOf(tab: string, item: string | null): string {
  return item === null ? `#${tab}` : `#${tab}/${item.split('/').map(encodeURIComponent).join('/')}`;
}

function detailItemTextOf(form: string, id: string): string {
  return `${form}/${id}`;
}

/** The route that opens the subject: its question, its ticket or draft on the Kanban, its job, or the Assistant for an incident. */
function subjectFragmentOf(subject: FragmentSubject, id: string): string {
  const { tab, detailForm, namesItem } = PLACE_OF_SUBJECT[subject];
  if (!namesItem) return fragmentOf(tab, null);
  return fragmentOf(tab, detailForm === null ? id : detailItemTextOf(detailForm, id));
}

export const BridgeFragmentUtil = Object.freeze({ fragmentOf, detailItemTextOf, subjectFragmentOf });
