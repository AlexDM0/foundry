/**
 * The Kanban's choices the filter menu sets and the board reads: the pressed epic rows and the Ready order, kept per board. The shell
 * holds them, so the menu and the board share one value and "Reset filters" clears both.
 */
import { useMemo, useState } from 'react';

import { ChipFilterUtil }       from '../../chips/ChipFilterUtil.ts';
import type { PreferenceStore } from '../../preferences/PreferenceStore.ts';
import {
  DEFAULT_KANBAN_READY_ORDER,
  KANBAN_EPIC_FILTER_CHOICE_NAME,
  KANBAN_READY_ORDER_CHOICE_NAME,
  type KanbanReadyOrder
} from './KanbanModel.ts';

export interface KanbanFilterChoices {
  /** As stored; the model drops a row whose epic went. */
  readonly storedPressedChips: readonly string[];
  readonly storedReadyOrder:   KanbanReadyOrder;
  /** Presses or releases `chip` among the rows the board shows pressed now. */
  readonly toggleChip:         (chip: string, shownPressedChips: readonly string[]) => void;
  readonly chooseReadyOrder:   (order: KanbanReadyOrder) => void;
  /** No row pressed and the Ready lane filed, both stored. */
  readonly reset:              () => void;
}

function readyOrderFrom(stored: string | null): KanbanReadyOrder {
  return stored === 'by-wave' ? 'by-wave' : DEFAULT_KANBAN_READY_ORDER;
}

export function useKanbanFilterChoices(boardStore: PreferenceStore | null): KanbanFilterChoices {
  const [pressedChipsChoice, setPressedChipsChoice] = useState<readonly string[] | null>(null);
  const [readyOrderChoice, setReadyOrderChoice] = useState<KanbanReadyOrder | null>(null);
  // Read once per store, so the model built from it keeps its identity across renders.
  const storedPressedChips = useMemo(() => boardStore?.readTextList(KANBAN_EPIC_FILTER_CHOICE_NAME) ?? [], [boardStore]);
  const chooseReadyOrder = (order: KanbanReadyOrder): void => {
    setReadyOrderChoice(order);
    boardStore?.writeChoice(KANBAN_READY_ORDER_CHOICE_NAME, order, DEFAULT_KANBAN_READY_ORDER);
  };
  const choosePressedChips = (pressedChips: readonly string[]): void => {
    setPressedChipsChoice(pressedChips);
    boardStore?.writeTextList(KANBAN_EPIC_FILTER_CHOICE_NAME, pressedChips);
  };
  return {
    storedPressedChips: pressedChipsChoice ?? storedPressedChips,
    storedReadyOrder:   readyOrderChoice ?? readyOrderFrom(boardStore?.readChoice(KANBAN_READY_ORDER_CHOICE_NAME) ?? null),
    toggleChip:         (chip, shownPressedChips) => choosePressedChips(ChipFilterUtil.toggledChips(shownPressedChips, chip)),
    chooseReadyOrder,
    reset:              () => {
      choosePressedChips([]);
      chooseReadyOrder(DEFAULT_KANBAN_READY_ORDER);
    },
  };
}
