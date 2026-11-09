/**
 * The filter menu's two Kanban sections: Epic, one checkable row per epic holding open work (each pressed epic's roll-up under its row),
 * and Order Ready, filed or by wave, shown only on a board with dependencies.
 */
import { Fragment, useId } from 'react';

import { TokenCountUtil }                                                     from '../../../src/lib/token-count/TokenCountUtil.ts';
import type { EpicRollupDocument }                                            from '../../@types/BoardStateDocument.ts';
import { DetailRoute }                                                        from '../../shell/DetailRoute.ts';
import { HashRouter }                                                         from '../../shell/HashRouter.ts';
import { EpicRollupUtil }                                                     from '../../utils/EpicRollupUtil.ts';
import type { KanbanFilterChoices }                                           from './KanbanFilterChoices.ts';
import { KANBAN_READY_ORDERS, type KanbanFilterModel, type KanbanReadyOrder } from './KanbanModel.ts';

export interface KanbanFilterSectionsProps {
  readonly filters:     KanbanFilterModel;
  readonly choices:     KanbanFilterChoices;
  /** The board's epics with their roll-ups, for a pressed epic's bar. */
  readonly epicRollups: readonly EpicRollupDocument[];
}

const READY_ORDER_LABEL: Readonly<Record<KanbanReadyOrder, string>> = { 'filed': 'filed', 'by-wave': 'by wave' };

const HELD_COUNT_HINT = '↦ N on a card: tickets that wait on it, directly or further down the chain.';

function EpicStripRollup({ epic }: { readonly epic: EpicRollupDocument }) {
  return (
    <div className="bridge-epic-strip-rollup" data-epic-slot={String(epic.slot)}>
      <div className="bridge-epic-progress" role="img" aria-label={EpicRollupUtil.rollupAriaLabelOf(epic)}>
        {EpicRollupUtil.rollupSegmentsOf(epic).map((segment) => (
          <span
            key={segment.state}
            className="bridge-epic-segment"
            data-state={segment.state}
            style={{ flexGrow: segment.count }}
            title={`${segment.label}: ${segment.count}`}
          />
        ))}
      </div>
      <span>{`${EpicRollupUtil.doneTextOf(epic)} · ${TokenCountUtil.formatTokenCount(epic.tokens)} tokens`}</span>
      <a className="bridge-link-button" href={HashRouter.fragmentOf({ tab: 'epics', item: DetailRoute.epicItemTextOf(epic.key) })}>{`${epic.title} details`}</a>
    </div>
  );
}

export function KanbanFilterSections({ filters, choices, epicRollups }: KanbanFilterSectionsProps) {
  const epicLabelId = useId();
  const orderLabelId = useId();
  const rollupByKey = new Map(epicRollups.map((epic) => [epic.key, epic]));
  return (
    <>
      {filters.epicChips.length === 0
        ? null
        : (
          <section className="bridge-filter-section">
            <div className="bridge-filter-section-head">
              <span className="bridge-range-label" id={epicLabelId}>Epic</span>
              <span className="bridge-filter-scope">Kanban</span>
            </div>
            <div className="bridge-chips bridge-filter-epic-list" role="group" aria-labelledby={epicLabelId}>
              {filters.epicChips.map((chip) => {
                const isPressed = filters.pressedChips.includes(chip.value);
                const rollup = isPressed ? rollupByKey.get(chip.value) : undefined;
                const count = filters.countByChip.get(chip.value) ?? 0;
                return (
                  <Fragment key={chip.value}>
                    <button
                      type="button"
                      className="bridge-chip"
                      data-chip={chip.value}
                      data-epic-slot={chip.slot === undefined ? undefined : String(chip.slot)}
                      data-empty={count === 0 ? '' : undefined}
                      aria-pressed={isPressed}
                      onClick={() => choices.toggleChip(chip.value, filters.pressedChips)}
                    >
                      {chip.slot === undefined ? null : <span className="bridge-epic-swatch" aria-hidden="true" />}
                      {chip.label}
                      {' '}
                      <span className="bridge-chip-count">{count}</span>
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
          <section className="bridge-filter-section">
            <div className="bridge-filter-section-head">
              <span className="bridge-range-label" id={orderLabelId}>Order Ready</span>
              <span className="bridge-filter-scope">Kanban</span>
            </div>
            <div className="bridge-segments" role="group" aria-labelledby={orderLabelId}>
              {KANBAN_READY_ORDERS.map((order) => (
                <button key={order} type="button" aria-pressed={filters.readyOrder === order} onClick={() => choices.chooseReadyOrder(order)}>
                  {READY_ORDER_LABEL[order]}
                </button>
              ))}
            </div>
            <p className="bridge-kanban-order-hint">{HELD_COUNT_HINT}</p>
          </section>
        )
        : null}
    </>
  );
}
