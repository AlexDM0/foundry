/** An item's epics as chips, up to a limit, then a dashed "+N" naming the rest on hover. */
import { EpicChip }                    from './EpicChip.tsx';
import { EpicChipUtil, type EpicMark } from './EpicChipUtil.ts';

export interface EpicChipsProps {
  readonly epics:  readonly EpicMark[];
  /** How many chips show before "+N"; every epic by default. */
  readonly limit?: number;
}

export function EpicChips({ epics, limit }: EpicChipsProps) {
  const { shown, overflow } = EpicChipUtil.epicChipsOf(epics, limit);
  return (
    <span className="board-epic-chips">
      {shown.map((epic) => <EpicChip key={epic.key} epic={epic} />)}
      {overflow === null ? null : <span className="board-epic-more" title={overflow.title}>{overflow.countText}</span>}
    </span>
  );
}
