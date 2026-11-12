/**
 * The flow's toolbar: the stage's mark and note, Update pipeline on a live board, and the zoom with Fit on every stage.
 */
import type { PipelineFlowStage } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { ZoomControl }            from '../../../design-system/ZoomControl.tsx';
import { CommandButton }          from '../../../shell/CommandButton.tsx';

import { UPDATE_START_COMMAND } from './PipelineFlowEditSender.ts';
import { PipelineFlowModel }    from './PipelineFlowModel.ts';

export interface FlowToolbarProps {
  readonly stage:       PipelineFlowStage;
  readonly note:        string;
  readonly zoomPercent: number;
  readonly onZoom:      (zoomPercent: number) => void;
  readonly onFit:       () => void;
}

export function FlowToolbar({
  stage, note, zoomPercent, onZoom, onFit
}: FlowToolbarProps) {
  return (
    <div className="bridge-pipeline-flow-toolbar" role="toolbar" aria-label="Flow">
      <span className="bridge-pipeline-flow-note">
        <span className="bridge-pipeline-flow-stage-mark" data-stage={stage} aria-hidden="true" />
        {note}
      </span>
      {stage === 'live' ? <CommandButton label="Update pipeline" command={UPDATE_START_COMMAND} /> : null}
      <ZoomControl
        zoomText={PipelineFlowModel.zoomTextOf(zoomPercent)}
        onZoomOut={() => onZoom(PipelineFlowModel.zoomedPercentOf(zoomPercent, 'out'))}
        onZoomIn={() => onZoom(PipelineFlowModel.zoomedPercentOf(zoomPercent, 'in'))}
        onFit={onFit}
        zoomOutLabel="Zoom out"
        zoomInLabel="Zoom in"
        fitLabel="Fit"
        canZoomOut={PipelineFlowModel.canZoom(zoomPercent, 'out')}
        canZoomIn={PipelineFlowModel.canZoom(zoomPercent, 'in')}
      />
    </div>
  );
}
