/** Which of an item's epics show as chips on a card or a line, and what the "+N" for the rest reads. */

export interface EpicMark {
  readonly key:   string;
  readonly title: string;
  readonly slot:  number;
}

/** A Kanban card and a table line show this many epic chips, then "+N" for the rest. */
export const CARD_EPIC_CHIP_LIMIT = 2;

export interface EpicChipsModel {
  readonly shown:    readonly EpicMark[];
  /** `null` when every epic shows; otherwise "+N", naming the rest on hover. */
  readonly overflow: { readonly countText: string; readonly title: string } | null;
}

function epicChipsOf(epics: readonly EpicMark[], limit: number = Number.POSITIVE_INFINITY): EpicChipsModel {
  const rest = epics.slice(limit);
  return {
    shown:    epics.slice(0, limit),
    overflow: rest.length === 0 ? null : { countText: `+${rest.length}`, title: `Also in ${rest.map((epic) => epic.title).join(', ')}` },
  };
}

function chipTitleOf(epic: Pick<EpicMark, 'title'>): string {
  return `Epic: ${epic.title}`;
}

export const EpicChipUtil = Object.freeze({ epicChipsOf, chipTitleOf });
