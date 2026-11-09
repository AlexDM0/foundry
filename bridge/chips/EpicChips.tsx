/**
 * An item's epics as the static page's chips: each a rounded chip with its epic's colour square, linking to that epic on the Epics tab,
 * up to a limit, then a dashed "+N" naming the rest on hover. A link inside a clickable card or row is its own click, never the card's.
 */
import { DetailRoute }                 from '../shell/DetailRoute.ts';
import { HashRouter }                  from '../shell/HashRouter.ts';
import { EpicChipUtil, type EpicMark } from './EpicChipUtil.ts';

export interface EpicChipsProps {
  readonly epics:  readonly EpicMark[];
  /** How many chips show before "+N"; every epic by default. */
  readonly limit?: number;
}

export function EpicChips({ epics, limit }: EpicChipsProps) {
  const { shown, overflow } = EpicChipUtil.epicChipsOf(epics, limit);
  return (
    <span className="bridge-epic-chips">
      {shown.map((epic) => (
        <a
          key={epic.key}
          className="bridge-epic-chip"
          href={HashRouter.fragmentOf({ tab: 'epics', item: DetailRoute.epicItemTextOf(epic.key) })}
          data-epic-slot={String(epic.slot)}
          title={EpicChipUtil.chipTitleOf(epic)}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="bridge-epic-swatch" aria-hidden="true" />
          <span className="bridge-epic-chip-text">{epic.title}</span>
        </a>
      ))}
      {overflow === null ? null : <span className="bridge-epic-more" title={overflow.title}>{overflow.countText}</span>}
    </span>
  );
}
