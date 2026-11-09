/** An epic's chip on a card, a row or the detail panel: its title in the colour of the epic's stored slot. */
export interface EpicChipFacts {
  readonly key:   string;
  readonly title: string;
  readonly slot:  number;
}

export function EpicChip({ epic }: { readonly epic: EpicChipFacts }) {
  return <span className="bridge-epic-chip" data-epic-slot={String(epic.slot)}>{epic.title}</span>;
}
