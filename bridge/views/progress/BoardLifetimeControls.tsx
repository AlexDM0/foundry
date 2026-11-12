/**
 * The Progress tab's board-wide controls under the chart: the range shown saved as the board's default axis, which `range` stores, and
 * Clear…, which asks first and then clears the task rows and the log, keeping the tickets or deleting them too, as `clear` does.
 */
import { useState } from 'react';

import { Button }                  from '../../design-system/Button.tsx';
import { ConfirmStrip }            from '../../design-system/ConfirmStrip.tsx';
import { CommandButton }           from '../../shell/CommandButton.tsx';
import { ProgressModel }           from './ProgressModel.ts';
import type { StoredViewOverride } from './utils/ChartPreferenceUtil.ts';

function ClearBoard() {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <Button label="Clear…" onPress={() => setConfirming(true)} />;
  return (
    <ConfirmStrip
      label="Confirm clearing the board"
      question="Clear the board?"
      consequence="Every task row and the log go, and the clock starts again. Refused while a job is live."
      tone="danger"
      confirm={(
        <>
          <CommandButton label="Clear rows and log" command={{ kind: 'tracker-clear', scope: 'tasks-and-log' }} danger onApplied={() => setConfirming(false)} />
          <CommandButton
            label="Clear everything"
            accessibleName="Clear everything: also delete every ticket, epic and picture"
            command={{ kind: 'tracker-clear', scope: 'everything' }}
            danger
            onApplied={() => setConfirming(false)}
          />
        </>
      )}
      cancelLabel="Cancel"
      onCancel={() => setConfirming(false)}
    />
  );
}

export function BoardLifetimeControls({ override }: { readonly override: StoredViewOverride }) {
  return (
    <div className="bridge-progress-board-controls" role="group" aria-label="Board range and clear">
      <CommandButton label="Save as the board's range" command={ProgressModel.boardRangeCommandOf(override)} />
      <ClearBoard />
    </div>
  );
}
