/**
 * An epic's chip on a card, a row or the detail panel: a rounded chip with the colour square of the epic's stored slot, linking to that
 * epic on the Epics tab. A link inside a clickable card or row is its own click, never the card's.
 */
import { useBoardHrefOf }              from '../shared/routing/BoardRouteLinks.ts';
import { DetailRoute }                 from '../shared/routing/DetailRoute.ts';
import { EpicChipUtil, type EpicMark } from './EpicChipUtil.ts';

export function EpicChip({ epic }: { readonly epic: EpicMark }) {
  const hrefOf = useBoardHrefOf();
  return (
    <a
      className="board-epic-chip"
      href={hrefOf({ tab: 'epics', item: DetailRoute.epicItemTextOf(epic.key) })}
      data-epic-slot={String(epic.slot)}
      title={EpicChipUtil.chipTitleOf(epic)}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="board-epic-swatch" aria-hidden="true" />
      <span className="board-epic-chip-text">{epic.title}</span>
    </a>
  );
}
