/**
 * The pipeline flow with what it opens: the flow beside an optional aside, the gates area under them, and the dialog a node, a gate row
 * or a + asks for. Its selection is a hook, so the screen holding it can also show a step on the flow: select the node, and for a gate
 * select its phase's tab and scroll to the gates area.
 */
import {
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';

import type { GatePhase } from '../../../src/lib/tracker-model/@types/GatePhase.ts';

import type { PreferenceStore }               from '../../preferences/PreferenceStore.ts';
import type { PipelineViewFacts }             from './PipelineViewModel.ts';
import { PipelineAgentPanelModel }            from './agent-panel/PipelineAgentPanelModel.ts';
import { PipelineDialogs }                    from './dialogs/PipelineDialogs.tsx';
import { PipelineFlow, type FlowOpenRequest } from './flow/PipelineFlow.tsx';
import { GatesArea }                          from './gates/GatesArea.tsx';
import type { GatesOpenRequest }              from './gates/GatesAreaModel.ts';

const NODE_CELL_SELECTOR = '[data-flow-node-id]';

/** A step to show on the flow: its node, and for a gate or a prepare step the phase whose tab lists it. */
export interface FlowShowTarget {
  readonly nodeId: string;
  readonly phase:  GatePhase | null;
}

/** What the workspace scrolls into view next: the gates area, or a node's cell; `serial` makes a repeated ask scroll again. */
type FlowScrollRequest =
  | { readonly target: 'gates'; readonly serial: number }
  | { readonly target: 'node'; readonly nodeId: string; readonly serial: number };

export interface FlowSelection {
  readonly openRequest:   FlowOpenRequest | GatesOpenRequest | null;
  readonly shownNodeId:   string | null;
  readonly gatesPhase:    GatePhase;
  readonly scrollRequest: FlowScrollRequest | null;
  readonly open:          (request: FlowOpenRequest | GatesOpenRequest) => void;
  readonly close:         () => void;
  readonly selectPhase:   (phase: GatePhase) => void;
  readonly showOnFlow:    (target: FlowShowTarget) => void;
}

function nodeCellIn(workspace: HTMLElement | null, nodeId: string): HTMLElement | null {
  return [...workspace?.querySelectorAll<HTMLElement>(NODE_CELL_SELECTOR) ?? []].find((cell) => cell.dataset['flowNodeId'] === nodeId) ?? null;
}

export function useFlowSelection(): FlowSelection {
  const [openRequest, setOpenRequest] = useState<FlowOpenRequest | GatesOpenRequest | null>(null);
  const [shownNodeId, setShownNodeId] = useState<string | null>(null);
  const [gatesPhase, setGatesPhase] = useState<GatePhase>('build');
  const [scrollRequest, setScrollRequest] = useState<FlowScrollRequest | null>(null);
  const nextSerial = (): number => (scrollRequest?.serial ?? 0) + 1;
  const showPhase = (phase: GatePhase): void => {
    setGatesPhase(phase);
    setScrollRequest({ target: 'gates', serial: nextSerial() });
  };
  return {
    openRequest,
    shownNodeId,
    gatesPhase,
    scrollRequest,
    open: (request) => {
      setOpenRequest(request);
      setShownNodeId(null);
      if (request.kind === 'node' && request.action.kind === 'gates-tab') showPhase(request.action.phase);
    },
    close:       () => setOpenRequest(null),
    selectPhase: setGatesPhase,
    showOnFlow:  (target) => {
      setShownNodeId(target.nodeId);
      if (target.phase === null) setScrollRequest({ target: 'node', nodeId: target.nodeId, serial: nextSerial() });
      else showPhase(target.phase);
    },
  };
}

function selectedNodeIdOf(selection: FlowSelection): string | null {
  const request = selection.openRequest;
  if (request?.kind === 'node' || request?.kind === 'question') return request.nodeId;
  return selection.shownNodeId;
}

export interface FlowWorkspaceProps {
  readonly facts:      PipelineViewFacts;
  readonly boardStore: PreferenceStore | null;
  readonly selection:  FlowSelection;
  /** What stands beside the flow, such as the smallest pipeline's note. */
  readonly flowAside?: ReactNode;
}

export function FlowWorkspace({
  facts, boardStore, selection, flowAside = null
}: FlowWorkspaceProps) {
  const gatesAreaRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const { scrollRequest } = selection;
  useEffect(() => {
    if (scrollRequest === null) return;
    const element = scrollRequest.target === 'gates' ? gatesAreaRef.current : nodeCellIn(workspaceRef.current, scrollRequest.nodeId);
    element?.scrollIntoView({ block: 'nearest' });
  }, [scrollRequest]);
  const flow = facts.pipelineFlow ?? null;
  if (flow === null) return null;
  const record = facts.pipelineSetup?.record ?? null;
  const editTarget = record === null ? null : { setupId: record.setupId, draftRevision: record.draftRevision };
  const livePipeline = facts.pipeline?.readingVerdict === 'readable' ? facts.pipeline.pipeline : null;
  return (
    <div className="bridge-pipeline-flow-workspace" ref={workspaceRef}>
      <div className="bridge-pipeline-flow-screen">
        <PipelineFlow
          flow={flow}
          draft={record?.draft ?? livePipeline}
          editTarget={editTarget}
          efforts={facts.pipelineChoices?.efforts ?? []}
          profileRuns={facts.profileRuns ?? []}
          boardStore={boardStore}
          selectedNodeId={selectedNodeIdOf(selection)}
          openQuestionIds={PipelineAgentPanelModel.openQuestionIdsOf(record?.questions ?? [])}
          onOpen={selection.open}
        />
        {flowAside}
      </div>
      <GatesArea
        gateRows={flow.gateRows}
        stage={flow.toolbarStage}
        editTarget={editTarget}
        profileRuns={facts.profileRuns ?? []}
        phase={selection.gatesPhase}
        onSelectPhase={selection.selectPhase}
        onOpen={selection.open}
        areaRef={gatesAreaRef}
      />
      <PipelineDialogs facts={facts} request={selection.openRequest} onClose={selection.close} />
    </div>
  );
}
