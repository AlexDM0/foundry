/**
 * The pipeline flow on every stage (proposal, live, editing): the toolbar over a canvas of the left spine with the merge train's frame
 * under it and the right column beside it, the arrows drawn over them from the nodes' measured boxes, and a + wherever the facts name a
 * missing step. A live flow's nodes carry a chip linking to each ticket or draft on them. A double-click or Enter on a node asks for what
 * it opens, or for the question it waits on, which a marker shows; a switch and a + choice send their draft edits, first opening an update
 * on a live board. The zoom scales the canvas and is remembered per board.
 */
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties
} from 'react';

import type { GatePhase }                                from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import type { Pipeline }                                 from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { GateProfileRunFacts, PipelineFlowFacts }   from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { FlowArrows }                                    from '../../../design-system/FlowArrows.tsx';
import { FlowFrame }                                     from '../../../design-system/FlowFrame.tsx';
import { FlowNode }                                      from '../../../design-system/FlowNode.tsx';
import { ModelEffortMeter }                              from '../../../design-system/ModelEffortMeter.tsx';
import { Switch }                                        from '../../../design-system/Switch.tsx';
import { Tag }                                           from '../../../design-system/Tag.tsx';
import type { PreferenceStore }                          from '../../../preferences/PreferenceStore.ts';
import { FlowActivityPanelModel, type OccupantChipView } from '../live/FlowActivityPanelModel.ts';

import { FlowToolbar }                    from './FlowToolbar.tsx';
import { InsertSlot }                     from './InsertSlot.tsx';
import { usePipelineFlowEditSender }      from './PipelineFlowEditSender.ts';
import type { FlowColumn, FlowLayoutBox } from './PipelineFlowLayoutUtil.ts';
import { PipelineFlowLayoutUtil }         from './PipelineFlowLayoutUtil.ts';
import {
  PipelineFlowModel,
  type DraftEditTarget,
  type FlowColumnItem,
  type FlowDraftEdit,
  type FlowNodeView,
  type FlowOpenAction
} from './PipelineFlowModel.ts';

/**
 * What the flow asks its holder to open: a node's dialog or gates tab, the open question a node waits on, or the Gate dialog for a new
 * gate in a phase.
 */
export type FlowOpenRequest =
  | { readonly kind: 'node'; readonly nodeId: string; readonly action: FlowOpenAction }
  | { readonly kind: 'question'; readonly nodeId: string }
  | { readonly kind: 'new-gate'; readonly phase: GatePhase };

/** Reads every node's box relative to the canvas, unscaled; a spec hands in fixed boxes, since happy-dom lays nothing out. */
export type FlowBoxMeasurer = (canvas: HTMLElement, zoomPercent: number) => FlowLayoutBox[];

export interface PipelineFlowProps {
  readonly flow:             PipelineFlowFacts;
  /** The pipeline the flow draws, read for the values a + keeps, such as the review's name. */
  readonly draft:            Pipeline | null;
  /** The open setup record the edits go to; null on a live board. */
  readonly editTarget:       DraftEditTarget | null;
  readonly efforts:          readonly string[];
  readonly profileRuns:      readonly GateProfileRunFacts[];
  readonly boardStore:       PreferenceStore | null;
  readonly selectedNodeId:   string | null;
  /** The setup questions still open; a node whose facts name one shows a question marker and opens on it. */
  readonly openQuestionIds?: readonly string[];
  readonly onOpen:           (request: FlowOpenRequest) => void;
  readonly measureBoxes?:    FlowBoxMeasurer;
}

const ZOOM_CHOICE_NAME = 'pipeline-flow-zoom';

const NODE_CELL_SELECTOR = '[data-flow-node-id]';

function isFlowColumn(text: string | undefined): text is FlowColumn {
  return text === 'spine' || text === 'branch' || text === 'train';
}

/** The boxes as laid out, read back through the canvas's own scale. */
function measuredBoxesOf(canvas: HTMLElement, zoomPercent: number): FlowLayoutBox[] {
  const scale = zoomPercent / 100;
  const canvasBox = canvas.getBoundingClientRect();
  return [...canvas.querySelectorAll<HTMLElement>(NODE_CELL_SELECTOR)].flatMap((cell) => {
    const nodeId = cell.dataset['flowNodeId'];
    const column = cell.dataset['flowColumn'];
    if (nodeId === undefined || !isFlowColumn(column)) return [];
    const cellBox = cell.getBoundingClientRect();
    return [{
      nodeId,
      column,
      left:   (cellBox.left - canvasBox.left) / scale,
      top:    (cellBox.top - canvasBox.top) / scale,
      width:  cellBox.width / scale,
      height: cellBox.height / scale,
    }];
  });
}

function sameBoxes(before: readonly FlowLayoutBox[], after: readonly FlowLayoutBox[]): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}

function useFlowZoom(boardStore: PreferenceStore | null): [number, (zoomPercent: number) => void] {
  const [zoomPercent, setZoomPercent] = useState(() => PipelineFlowModel.storedZoomPercentOf(boardStore?.readChoice(ZOOM_CHOICE_NAME) ?? null));
  const chooseZoom = useCallback((chosen: number) => {
    setZoomPercent(chosen);
    boardStore?.writeChoice(ZOOM_CHOICE_NAME, String(chosen), String(PipelineFlowModel.DEFAULT_ZOOM_PERCENT));
  }, [boardStore]);
  return [zoomPercent, chooseZoom];
}

interface NodeCellProps {
  readonly view:      FlowNodeView;
  /** The tickets and drafts on the node now; only a live flow has any. */
  readonly occupants: readonly OccupantChipView[];
  readonly column:    FlowColumn;
  readonly riseOrder: number;
  readonly selected:  boolean;
  readonly asking:    boolean;
  readonly editable:  boolean;
  readonly onOpen:    (request: FlowOpenRequest) => void;
  readonly onEdits:   (edits: readonly FlowDraftEdit[]) => void;
}

/** A node waiting on a question opens on the question; any other node opens what its facts name, if anything. */
function openPropsOf(view: FlowNodeView, asking: boolean, onOpen: (request: FlowOpenRequest) => void): { onOpen?: () => void; openLabel?: string } {
  if (asking) return { onOpen: () => onOpen({ kind: 'question', nodeId: view.nodeId }), openLabel: PipelineFlowModel.questionOpenLabelOf(view.title) };
  const { openAction, openLabel } = view;
  if (openAction === null || openLabel === null) return {};
  return { onOpen: () => onOpen({ kind: 'node', nodeId: view.nodeId, action: openAction }), openLabel };
}

function NodeCell({
  view, occupants, column, riseOrder, selected, asking, editable, onOpen, onEdits
}: NodeCellProps) {
  const { meter, switchView } = view;
  const gateChips = view.gateChips.map((chip) => (
    <Tag
      key={chip.gateName}
      text={chip.gateName}
      tone="neutral"
      dashed={chip.proposed}
      {...(chip.change === null ? {} : { change: chip.change })}
    />
  ));
  const markers = [
    ...(view.markChip === null ? [] : [<Tag key="mark" text={view.markChip} tone="warn" />]),
    ...(asking ? [<Tag key="question" text="Question" tone="warn" glyph="warning" pops />] : []),
    ...occupants.map((occupant) => <Tag key={occupant.key} text={occupant.text} tone="state" state={occupant.state} href={occupant.href} pops />),
  ];
  const hasChips = view.chipsLead !== null || gateChips.length > 0 || markers.length > 0;
  return (
    <div className="bridge-pipeline-flow-cell" data-flow-node-id={view.nodeId} data-flow-column={column} style={{ '--rise-order': riseOrder } as CSSProperties}>
      <FlowNode
        title={view.title}
        variant={view.variant}
        conditional={view.conditional}
        selected={selected}
        {...(view.tagText === null ? {} : { tag: { text: view.tagText, variant: 'conditional' as const } })}
        {...(view.detail === null ? {} : { detail: view.detail })}
        {...(view.mark === null ? {} : { mark: view.mark })}
        {...(view.highlighted ? { tone: 'highlight' as const } : {})}
        {...(hasChips
          ? {
            chips: (
              <>
                {markers}
                {view.chipsLead === null ? null : <span className="bridge-pipeline-flow-chips-lead">{view.chipsLead}</span>}
                {gateChips}
              </>
            )
          }
          : {})}
        {...(meter === null
          ? {}
          : {
            meter: (
              <ModelEffortMeter
                model={meter.model}
                effort={meter.effort}
                level={meter.level}
                levelCount={meter.levelCount}
                accessibleName={meter.accessibleName}
                size="node"
                {...(meter.derivedNote === null ? {} : { derivedNote: meter.derivedNote })}
              />
            )
          })}
        {...(switchView === null
          ? {}
          : {
            end: (
              <Switch
                accessibleName={switchView.accessibleName}
                checked={switchView.checked}
                disabled={!editable}
                onToggle={() => onEdits([PipelineFlowModel.switchEditOf(switchView)])}
              />
            )
          })}
        {...openPropsOf(view, asking, onOpen)}
      />
    </div>
  );
}

export function PipelineFlow({
  flow, draft, editTarget, efforts, profileRuns, boardStore, selectedNodeId, openQuestionIds = [], onOpen, measureBoxes = measuredBoxesOf
}: PipelineFlowProps) {
  const stage = flow.toolbarStage;
  const editSender = usePipelineFlowEditSender(stage === 'live' ? null : editTarget);
  const [zoomPercent, chooseZoom] = useFlowZoom(boardStore);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [boxes, setBoxes] = useState<readonly FlowLayoutBox[]>([]);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const measured = measureBoxes(canvas, zoomPercent);
    setBoxes((before) => (sameBoxes(before, measured) ? before : measured));
  }, [measureBoxes, zoomPercent]);

  useLayoutEffect(() => {
    measure();
    const canvas = canvasRef.current;
    if (canvas === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [measure, flow]);

  const columns = PipelineFlowModel.columnsOf(flow);
  const viewById = new Map(PipelineFlowModel.nodeViewsOf(flow.nodes, efforts).map((view) => [view.nodeId, view]));
  const riseOrderById = new Map(flow.nodes.map((node, i) => [node.nodeId, i]));
  const layerSize = PipelineFlowLayoutUtil.layerSizeOf(boxes);
  const arrows = PipelineFlowLayoutUtil.arrowsOf(PipelineFlowModel.layoutEdgesOf(flow.edges), boxes);

  const fit = (): void => {
    const viewport = viewportRef.current;
    const viewportSize = { width: viewport?.clientWidth ?? 0, height: viewport?.clientHeight ?? 0 };
    chooseZoom(PipelineFlowModel.fitPercentOf(viewportSize, layerSize));
  };

  const itemsOf = (items: readonly FlowColumnItem[], column: FlowColumn) => items.map((item) => {
    if (item.kind === 'slot') {
      return (
        <InsertSlot
          key={`slot-${item.slot.slotId}`}
          slot={PipelineFlowModel.slotViewOf(item.slot, item.place, draft)}
          disabled={!editSender.enabled}
          onEdits={editSender.sendEdits}
          onNewGate={(phase) => onOpen({ kind: 'new-gate', phase })}
        />
      );
    }
    const view = viewById.get(item.node.nodeId);
    if (view === undefined) return null;
    return (
      <NodeCell
        key={item.node.nodeId}
        view={view}
        occupants={FlowActivityPanelModel.occupantChipsOf(flow, item.node.nodeId)}
        column={column}
        riseOrder={riseOrderById.get(item.node.nodeId) ?? 0}
        selected={selectedNodeId === item.node.nodeId}
        asking={PipelineFlowModel.nodeAsksQuestion(item.node, openQuestionIds)}
        editable={editSender.enabled}
        onOpen={onOpen}
        onEdits={editSender.sendEdits}
      />
    );
  });

  return (
    <section className="bridge-pipeline-flow" aria-label="Pipeline flow" data-stage={stage}>
      <FlowToolbar
        stage={stage}
        note={PipelineFlowModel.toolbarNoteOf(stage, flow.changeList.length, profileRuns)}
        zoomPercent={zoomPercent}
        onZoom={chooseZoom}
        onFit={fit}
      />
      {editSender.refusal === null ? null : <span className="bridge-refusal" role="status">{editSender.refusal}</span>}
      <div className="bridge-pipeline-flow-viewport" ref={viewportRef}>
        <div className="bridge-pipeline-flow-canvas" ref={canvasRef} style={{ '--flow-zoom': zoomPercent / 100 } as CSSProperties}>
          <FlowArrows width={layerSize.width} height={layerSize.height} arrows={arrows} />
          <div className="bridge-pipeline-flow-column" data-column="spine">
            {itemsOf(columns.spine, 'spine')}
            {columns.trainLabel === null
              ? null
              : (
                <div className="bridge-pipeline-flow-train">
                  <FlowFrame label={columns.trainLabel}>{itemsOf(columns.train, 'train')}</FlowFrame>
                </div>
              )}
          </div>
          <div className="bridge-pipeline-flow-column" data-column="branch">{itemsOf(columns.branch, 'branch')}</div>
        </div>
      </div>
    </section>
  );
}
