/**
 * The gates area under the flow: the Build, Review and Merge tabs with their gate counts and the tab's meaning, then the tab's rows in a
 * reorderable list, prepare steps first. A reorder sends the phase's run order (or the prepare steps' order) and Delete on a focused row
 * takes it out, both as draft edits, first opening an update on a live board. "Add <phase> gate", and "Add prepare step" in the Build
 * tab, ask for an empty Gate dialog; they are hidden on a live board. A phase with no gates shows the empty state.
 */
import type { Ref } from 'react';

import type { GatePhase }                              from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import type { GateProfileRunFacts, PipelineFlowFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { Button }                                      from '../../../design-system/Button.tsx';
import { EmptyState }                                  from '../../../design-system/ListSection.tsx';
import { ReorderableList }                             from '../../../design-system/ReorderableList.tsx';
import { Tabs }                                        from '../../../design-system/Tabs.tsx';
import { usePipelineFlowEditSender }                   from '../flow/PipelineFlowEditSender.ts';
import type { DraftEditTarget }                        from '../flow/PipelineFlowModel.ts';

import { GateRow }                               from './GateRow.tsx';
import { GatesAreaModel, type GatesOpenRequest } from './GatesAreaModel.ts';

export interface GatesAreaProps {
  readonly gateRows:      PipelineFlowFacts['gateRows'];
  readonly stage:         PipelineFlowFacts['toolbarStage'];
  /** The open setup record the edits go to; null on a live board. */
  readonly editTarget:    DraftEditTarget | null;
  readonly profileRuns:   readonly GateProfileRunFacts[];
  readonly phase:         GatePhase;
  readonly onSelectPhase: (phase: GatePhase) => void;
  readonly onOpen:        (request: GatesOpenRequest) => void;
  readonly areaRef?:      Ref<HTMLElement>;
}

export function GatesArea({
  gateRows, stage, editTarget, profileRuns, phase, onSelectPhase, onOpen, areaRef
}: GatesAreaProps) {
  const live = stage === 'live';
  const editSender = usePipelineFlowEditSender(live ? null : editTarget);
  const rows = gateRows[phase];
  const views = GatesAreaModel.rowViewsOf(rows, phase, profileRuns);
  const profileSetupId = live ? null : editTarget?.setupId ?? null;

  const addButtons = live
    ? null
    : (
      <>
        <Button label={GatesAreaModel.addGateLabelOf(phase)} onPress={() => onOpen({ kind: 'new-gate', phase })} />
        {phase === 'build' ? <Button label="Add prepare step" onPress={() => onOpen({ kind: 'new-prepare-step' })} /> : null}
      </>
    );

  return (
    <section className="bridge-pipeline-gates" aria-label="Gates" ref={areaRef}>
      <div className="bridge-pipeline-gates-head">
        <h3 className="bridge-pipeline-gates-title">Gates</h3>
        <Tabs label="Gate phases" items={GatesAreaModel.tabItemsOf(gateRows)} selectedKey={phase} mode="switch" size="section" onSelect={onSelectPhase} />
        <span className="bridge-pipeline-gates-meaning">{GatesAreaModel.meaningOf(phase)}</span>
        {rows.length === 0 ? null : <span className="bridge-pipeline-gates-actions">{addButtons}</span>}
      </div>
      {editSender.refusal === null ? null : <span className="bridge-refusal" role="status">{editSender.refusal}</span>}
      <div className="bridge-pipeline-gates-panel" role="tabpanel" aria-label={GatesAreaModel.tabPanelNameOf(phase)}>
        {rows.length === 0
          ? <EmptyState text={GatesAreaModel.emptyTextOf(gateRows, phase)}>{addButtons}</EmptyState>
          : (
            <>
              <div className="bridge-pipeline-gates-columns" aria-hidden="true">
                <span>#</span>
                <span>Name</span>
                <span>Command</span>
                <span>Also in</span>
                <span>Network</span>
                <span>Profile</span>
              </div>
              <ReorderableList
                label={GatesAreaModel.tabPanelNameOf(phase)}
                announce={(fromIndex, toIndex) => GatesAreaModel.announcementOf(rows, fromIndex, toIndex)}
                onReorder={(fromIndex, toIndex) => {
                  const edits = GatesAreaModel.reorderEditsOf(rows, phase, fromIndex, toIndex);
                  if (edits.length > 0) editSender.sendEdits(edits);
                }}
                items={views.map((view, index) => {
                  const row = rows[index];
                  const openRequest = row === undefined ? null : GatesAreaModel.openRequestOf(row, phase);
                  const deleteEdits = GatesAreaModel.deleteEditsOf(rows, phase, index);
                  return {
                    key:       view.key,
                    band:      view.band,
                    grabLabel: view.grabLabel,
                    content:   (
                      <GateRow
                        view={view}
                        profileCommand={GatesAreaModel.profileStartCommandOf(profileSetupId, view.name, phase)}
                        onOpen={openRequest === null ? null : () => onOpen(openRequest)}
                        onDelete={deleteEdits.length === 0 || !editSender.enabled ? null : () => editSender.sendEdits(deleteEdits)}
                      />
                    ),
                  };
                })}
              />
            </>
          )}
      </div>
    </section>
  );
}
