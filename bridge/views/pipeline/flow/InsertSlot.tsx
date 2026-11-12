/**
 * A + where the pipeline misses a step: an insert trigger on the flow's line whose menu offers each missing step that fits there. A choice
 * either sends its draft edit or asks for a new gate's dialog in its phase.
 */
import type { GatePhase } from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import { Menu, MenuItem } from '../../../design-system/Menu.tsx';

import type { FlowDraftEdit, FlowSlotView } from './PipelineFlowModel.ts';

export interface InsertSlotProps {
  readonly slot:      FlowSlotView;
  readonly disabled:  boolean;
  readonly onEdits:   (edits: readonly FlowDraftEdit[]) => void;
  readonly onNewGate: (phase: GatePhase) => void;
}

export function InsertSlot({
  slot, disabled, onEdits, onNewGate
}: InsertSlotProps) {
  return (
    <div className="bridge-pipeline-flow-slot" data-disabled={disabled ? '' : undefined}>
      <Menu label="Add a step" trigger="insert" insertStyle={slot.insertStyle} heading={slot.heading} align="start" triggerName={slot.triggerName}>
        {slot.choices.map((choice) => (
          <MenuItem
            key={choice.step}
            label={choice.label}
            description={choice.description}
            closing={choice.action.kind === 'new-gate' ? 'keep-focus' : 'return-focus'}
            onChoose={() => {
              if (disabled) return;
              if (choice.action.kind === 'new-gate') onNewGate(choice.action.phase);
              else onEdits(choice.action.edits);
            }}
          />
        ))}
      </Menu>
    </div>
  );
}
