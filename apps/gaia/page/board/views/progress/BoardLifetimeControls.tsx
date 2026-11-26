/**
 * The Progress tab's board-wide controls under the chart: the range shown saved as the board's default axis, which `range` stores, and
 * Clear…, which asks first and then clears the task rows and the log, keeping the tickets or deleting them too, as `clear` does.
 */
import { useState } from 'react';

import { PAGE_CONTRACT_VERSIONS }    from '../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument } from '../../../@types/board/BoardCommandDocument.ts';
import { Button, ConfirmStrip }      from '../../../lib/design-system/DesignSystemInterface.ts';
import { CommandButton }             from '../../shared/commands/CommandButton.tsx';
import { ProgressModel }             from './ProgressModel.ts';
import type { StoredViewOverride }   from './utils/ChartPreferenceUtil.ts';

const CLEAR_ROWS_AND_LOG: BoardCommandDocument = { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'tracker-clear', scope: 'tasks-and-log' };
const CLEAR_EVERYTHING: BoardCommandDocument = { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'tracker-clear', scope: 'everything' };

function ClearBoard() {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <Button label="Clear…" onPress={() => setConfirming(true)} />;
  return (
    <ConfirmStrip
      label="Confirm clearing the board"
      question="Clear the board?"
      consequence="Every task row and the log go, and the clock starts again. Refused while a job other than the Assistant is live."
      tone="danger"
      confirm={(
        <>
          <CommandButton label="Clear rows and log" command={CLEAR_ROWS_AND_LOG} danger onApplied={() => setConfirming(false)} />
          <CommandButton
            label="Clear everything"
            accessibleName="Clear everything: also delete every ticket, epic and picture"
            command={CLEAR_EVERYTHING}
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
    <div className="board-progress-board-controls" role="group" aria-label="Board range and clear">
      <CommandButton label="Save as the board's range" command={ProgressModel.boardRangeCommandOf(override)} />
      <ClearBoard />
    </div>
  );
}
