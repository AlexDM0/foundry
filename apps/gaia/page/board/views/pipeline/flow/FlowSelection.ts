/**
 * The Focus layout's selection: the open phase, what is shown selected in it, the dialog a step, a gate row or an add choice asked for,
 * and what to scroll into view next. It is a hook, so the screen holding the layout can also show a step: "Show <step>" opens the phase
 * that holds it, selects its card or gate row and scrolls it into view. The selection also holds the screen's Apply dialog, asked for one
 * setup record: one modal dialog is open at a time, and an Apply asked for an earlier record never opens over a later one.
 */
import { createContext, useContext, useState } from 'react';

import type { GatesOpenRequest }                  from '../gates/GatesAreaModel.ts';
import type { FlowOpenRequest }                   from './PipelineFlowModel.ts';
import { PipelinePhaseModel, type PipelinePhase } from './PipelinePhaseModel.ts';

/** What a phase shows selected: a step card, a gate row by its key, or the phase's gates table. */
export type FlowShownItem =
  | { readonly kind: 'step'; readonly nodeId: string }
  | { readonly kind: 'gate-row'; readonly rowKey: string }
  | { readonly kind: 'gates' };

/** A step to show on the flow: the phase that holds it and what to select there. */
export interface FlowShowTarget {
  readonly phase: PipelinePhase;
  readonly item:  FlowShownItem;
}

/** What the layout scrolls into view next; `serial` makes a repeated ask scroll again. */
export interface FlowScrollRequest {
  readonly item:   FlowShownItem;
  readonly serial: number;
}

export type FlowWorkspaceOpenRequest = FlowOpenRequest | GatesOpenRequest;

export interface FlowSelection {
  readonly openRequest:     FlowWorkspaceOpenRequest | null;
  readonly openPhase:       PipelinePhase;
  readonly shownItem:       FlowShownItem | null;
  readonly scrollRequest:   FlowScrollRequest | null;
  readonly open:            (request: FlowWorkspaceOpenRequest) => void;
  readonly close:           () => void;
  readonly openPhaseOf:     (phase: PipelinePhase) => void;
  readonly showOnFlow:      (target: FlowShowTarget) => void;
  /** Whether the Apply dialog is open for this setup record. */
  readonly applyIsAskedFor: (setupId: string) => boolean;
  /** Opens the Apply dialog for a setup record, and closes the dialog a step, a gate row or an add choice opened. */
  readonly askApply:        (setupId: string) => void;
  readonly closeApply:      () => void;
}

/** The phase the boards open on; a painted screen of the visual pass sets the phase its artboard draws open. */
export const FirstOpenPhaseContext = createContext<PipelinePhase>('build');

/** `applyAskedFor` opens the Apply dialog at once, for a record whose Apply is still pending. */
export function useFlowSelection(applyAskedFor: string | null = null): FlowSelection {
  const [openRequest, setOpenRequest] = useState<FlowWorkspaceOpenRequest | null>(null);
  const [applySetupId, setApplySetupId] = useState<string | null>(applyAskedFor);
  const firstOpenPhase = useContext(FirstOpenPhaseContext);
  const [openPhase, setOpenPhase] = useState<PipelinePhase>(firstOpenPhase);
  const [shownItem, setShownItem] = useState<FlowShownItem | null>(null);
  const [scrollRequest, setScrollRequest] = useState<FlowScrollRequest | null>(null);
  const scrollTo = (item: FlowShownItem): void => setScrollRequest({ item, serial: (scrollRequest?.serial ?? 0) + 1 });
  return {
    openRequest,
    openPhase,
    shownItem,
    scrollRequest,
    open: (request) => {
      setApplySetupId(null);
      setOpenRequest(request);
      setShownItem(null);
      if (request.kind !== 'node' || request.action.kind !== 'gates-tab') return;
      setOpenPhase(PipelinePhaseModel.phaseOfGatePhase(request.action.phase));
      scrollTo({ kind: 'gates' });
    },
    close:       () => setOpenRequest(null),
    openPhaseOf: (phase) => {
      setOpenPhase(phase);
      setShownItem(null);
    },
    showOnFlow: (target) => {
      setOpenPhase(target.phase);
      setShownItem(target.item);
      scrollTo(target.item);
    },
    applyIsAskedFor: (setupId) => applySetupId === setupId,
    askApply:        (setupId) => {
      setOpenRequest(null);
      setApplySetupId(setupId);
    },
    closeApply: () => setApplySetupId(null),
  };
}

/** The step a dialog or a question is open on, else the step shown. */
export function selectedStepNodeIdOf(selection: Pick<FlowSelection, 'openRequest' | 'shownItem'>): string | null {
  const request = selection.openRequest;
  if (request?.kind === 'node' || request?.kind === 'question') return request.nodeId;
  return selection.shownItem?.kind === 'step' ? selection.shownItem.nodeId : null;
}

/** The gate row a Gate dialog is open on, else the gate row shown; keyed as the gates model keys its rows. */
export function selectedGateRowKeyOf(selection: Pick<FlowSelection, 'openRequest' | 'shownItem'>): string | null {
  const request = selection.openRequest;
  if (request?.kind === 'gate') return `gate:${request.gateName}`;
  if (request?.kind === 'prepare-step') return `prepare:${request.name}`;
  return selection.shownItem?.kind === 'gate-row' ? selection.shownItem.rowKey : null;
}
