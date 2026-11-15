/**
 * An epic's chip on a card, a row or the detail panel: a rounded chip with the colour square of the epic's stored slot, linking to that
 * epic on the Epics tab. A link inside a clickable card or row is its own click, never the card's.
 */
import { DetailRoute }                 from '../shell/DetailRoute.ts';
import { HashRouter }                  from '../shell/HashRouter.ts';
import { EpicChipUtil, type EpicMark } from './EpicChipUtil.ts';

export function EpicChip({ epic }: { readonly epic: EpicMark }) {
  return (
    <a
      className="bridge-epic-chip"
      href={HashRouter.fragmentOf({ tab: 'epics', item: DetailRoute.epicItemTextOf(epic.key) })}
      data-epic-slot={String(epic.slot)}
      title={EpicChipUtil.chipTitleOf(epic)}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="bridge-epic-swatch" aria-hidden="true" />
      <span className="bridge-epic-chip-text">{epic.title}</span>
    </a>
  );
}
