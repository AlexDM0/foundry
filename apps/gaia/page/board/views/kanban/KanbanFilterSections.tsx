/**
 * The filter menu's Kanban sections: Epic, one checkable row per epic holding open work (each pressed epic's roll-up under its row),
 * Order Ready, filed or by wave, shown only on a board with dependencies, and Swimlanes, by entity or none, shown only in monorepo mode.
 */

import { Fragment, useId } from 'react';

import type { BoardEpicDocument } from '../../../@types/board/BoardTicketDocuments.ts';
import {
  MicroCapsLabel,
  SegmentMeter,
  SegmentedControl,
  TextButton
} from '../../../lib/design-system/DesignSystemInterface.ts';
import { CountTextUtil }                                                      from '../../../shared/utils/CountTextUtil.ts';
import { useBoardHrefOf }                                                     from '../../shared/routing/BoardRouteLinks.ts';
import { DetailRoute }                                                        from '../../shared/routing/DetailRoute.ts';
import { EpicRollupUtil }                                                     from '../../utils/EpicRollupUtil.ts';
import { KANBAN_SWIMLANES, type KanbanSwimlanes }                             from './KanbanEntityFilterModel.ts';
import type { KanbanFilterChoices }                                           from './KanbanFilterChoices.ts';
import { KANBAN_READY_ORDERS, type KanbanFilterModel, type KanbanReadyOrder } from './KanbanModel.ts';

export interface KanbanFilterSectionsProps {
  readonly filters:     KanbanFilterModel;
  readonly choices:     KanbanFilterChoices;
  /** The board's epics with their roll-ups, for a pressed epic's bar. */
  readonly epicRollups: readonly BoardEpicDocument[];
}

const READY_ORDER_LABEL: Readonly<Record<KanbanReadyOrder, string>> = { 'filed': 'filed', 'by-wave': 'by wave' };

const SWIMLANES_LABEL: Readonly<Record<KanbanSwimlanes, string>> = { 'by-entity': 'by entity', 'none': 'none' };

const HELD_COUNT_HINT = '↦ N on a card: tickets that wait on it, directly or further down the chain.';

function EpicStripRollup({ epic }: { readonly epic: BoardEpicDocument }) {
  const hrefOf = useBoardHrefOf();
  return (
    <div className="board-epic-strip-rollup" data-epic-slot={String(epic.slot)}>
      <span className="board-epic-strip-meter"><SegmentMeter label={EpicRollupUtil.rollupAriaLabelOf(epic)} segments={EpicRollupUtil.rollupSegmentsOf(epic)} /></span>
      <span>{`${EpicRollupUtil.doneTextOf(epic)} · ${CountTextUtil.shortCountTextOf(epic.tokens)} tokens`}</span>
      <TextButton label={`${epic.title} details`} href={hrefOf({ tab: 'epics', item: DetailRoute.epicItemTextOf(epic.key) })} />
    </div>
  );
}

export function KanbanFilterSections({ filters, choices, epicRollups }: KanbanFilterSectionsProps) {
  const epicLabelId = useId();
  const orderLabelId = useId();
  const swimlanesLabelId = useId();
  const rollupByKey = new Map(epicRollups.map((epic) => [epic.key, epic]));
  return (
    <>
      {filters.epicChips.length === 0
        ? null
        : (
          <section className="board-filter-section">
            <div className="board-filter-section-head">
              <MicroCapsLabel text="Epic" id={epicLabelId} />
              <span className="board-filter-scope">Kanban</span>
            </div>
            <div className="board-chips board-filter-epic-list" role="group" aria-labelledby={epicLabelId}>
              {filters.epicChips.map((chip) => {
                const isPressed = filters.pressedChips.includes(chip.value);
                const rollup = isPressed ? rollupByKey.get(chip.value) : undefined;
                const count = filters.countByChip.get(chip.value) ?? 0;
                return (
                  <Fragment key={chip.value}>
                    <button
                      type="button"
                      className="board-chip"
                      data-chip={chip.value}
                      data-epic-slot={chip.slot === undefined ? undefined : String(chip.slot)}
                      data-empty={count === 0 ? '' : undefined}
                      aria-pressed={isPressed}
                      onClick={() => choices.toggleChip(chip.value, filters.pressedChips)}
                    >
                      {chip.slot === undefined ? null : <span className="board-epic-swatch" aria-hidden="true" />}
                      {chip.label}
                      {' '}
                      <span className="board-chip-count">{count}</span>
                    </button>
                    {rollup === undefined ? null : <EpicStripRollup epic={rollup} />}
                  </Fragment>
                );
              })}
            </div>
          </section>
        )}
      {filters.boardHasDependencies
        ? (
          <section className="board-filter-section">
            <div className="board-filter-section-head">
              <MicroCapsLabel text="Order Ready" id={orderLabelId} />
              <span className="board-filter-scope">Kanban</span>
            </div>
            <SegmentedControl
              labelledBy={orderLabelId}
              options={KANBAN_READY_ORDERS.map((order) => ({ value: order, label: READY_ORDER_LABEL[order] }))}
              selected={filters.readyOrder}
              onSelect={choices.chooseReadyOrder}
            />
            <p className="board-kanban-order-hint">{HELD_COUNT_HINT}</p>
          </section>
        )
        : null}
      {filters.entityFilter === null
        ? null
        : (
          <section className="board-filter-section">
            <div className="board-filter-section-head">
              <MicroCapsLabel text="Swimlanes" id={swimlanesLabelId} />
              <span className="board-filter-scope">Kanban</span>
            </div>
            <SegmentedControl
              labelledBy={swimlanesLabelId}
              options={KANBAN_SWIMLANES.map((swimlanes) => ({ value: swimlanes, label: SWIMLANES_LABEL[swimlanes] }))}
              selected={filters.entityFilter.swimlanes}
              onSelect={choices.chooseSwimlanes}
            />
          </section>
        )}
    </>
  );
}
