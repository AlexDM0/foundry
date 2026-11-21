/**
 * The Kanban's choices the filter menu and the entity rail set and the board reads: the pressed epic rows, the Ready order, and in monorepo
 * mode the chosen entity and the swimlanes, kept per board. The shell holds them, so the menu, the rail and the board share one value and
 * "Reset filters" clears them all.
 */
import { useMemo, useState } from 'react';

import { ChipFilterUtil }       from '../../chips/ChipFilterUtil.ts';
import type { PreferenceStore } from '../../preferences/PreferenceStore.ts';
import {
  DEFAULT_KANBAN_SWIMLANES,
  KANBAN_ENTITY_CHOICE_NAME,
  KANBAN_SWIMLANES_CHOICE_NAME,
  type KanbanSwimlanes
} from './KanbanEntityFilterModel.ts';
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
  /** As stored; `null` shows every entity, and the model drops an entity the pipeline no longer names. */
  readonly storedEntity:       string | null;
  readonly storedSwimlanes:    KanbanSwimlanes;
  /** `null` shows every entity. */
  readonly chooseEntity:       (entityKey: string | null) => void;
  readonly chooseSwimlanes:    (swimlanes: KanbanSwimlanes) => void;
  /** No row pressed, the Ready lane filed, every entity shown and the swimlanes by entity, all stored. */
  readonly reset:              () => void;
}

/** The stored text of "every entity", which the store keeps as no text at all. */
const EVERY_ENTITY_CHOICE = '';

function readyOrderFrom(stored: string | null): KanbanReadyOrder {
  return stored === 'by-wave' ? 'by-wave' : DEFAULT_KANBAN_READY_ORDER;
}

function swimlanesFrom(stored: string | null): KanbanSwimlanes {
  return stored === 'none' ? 'none' : DEFAULT_KANBAN_SWIMLANES;
}

function entityFrom(stored: string | null): string | null {
  return stored === null || stored === EVERY_ENTITY_CHOICE ? null : stored;
}

export function useKanbanFilterChoices(boardStore: PreferenceStore | null): KanbanFilterChoices {
  const [pressedChipsChoice, setPressedChipsChoice] = useState<readonly string[] | null>(null);
  const [readyOrderChoice, setReadyOrderChoice] = useState<KanbanReadyOrder | null>(null);
  const [entityChoice, setEntityChoice] = useState<{ readonly entityKey: string | null } | null>(null);
  const [swimlanesChoice, setSwimlanesChoice] = useState<KanbanSwimlanes | null>(null);
  // Read once per store, so the model built from it keeps its identity across renders.
  const storedPressedChips = useMemo(() => boardStore?.readTextList(KANBAN_EPIC_FILTER_CHOICE_NAME) ?? [], [boardStore]);
  const chooseReadyOrder = (order: KanbanReadyOrder): void => {
    setReadyOrderChoice(order);
    boardStore?.writeChoice(KANBAN_READY_ORDER_CHOICE_NAME, order, DEFAULT_KANBAN_READY_ORDER);
  };
  const chooseEntity = (entityKey: string | null): void => {
    setEntityChoice({ entityKey });
    boardStore?.writeChoice(KANBAN_ENTITY_CHOICE_NAME, entityKey ?? EVERY_ENTITY_CHOICE, EVERY_ENTITY_CHOICE);
  };
  const chooseSwimlanes = (swimlanes: KanbanSwimlanes): void => {
    setSwimlanesChoice(swimlanes);
    boardStore?.writeChoice(KANBAN_SWIMLANES_CHOICE_NAME, swimlanes, DEFAULT_KANBAN_SWIMLANES);
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
    storedEntity:       entityChoice === null ? entityFrom(boardStore?.readChoice(KANBAN_ENTITY_CHOICE_NAME) ?? null) : entityChoice.entityKey,
    storedSwimlanes:    swimlanesChoice ?? swimlanesFrom(boardStore?.readChoice(KANBAN_SWIMLANES_CHOICE_NAME) ?? null),
    chooseEntity,
    chooseSwimlanes,
    reset:              () => {
      choosePressedChips([]);
      chooseReadyOrder(DEFAULT_KANBAN_READY_ORDER);
      chooseEntity(null);
      chooseSwimlanes(DEFAULT_KANBAN_SWIMLANES);
    },
  };
}
