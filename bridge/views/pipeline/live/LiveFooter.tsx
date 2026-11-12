/**
 * The live flow's footer (A5Live): the Applied mark, the applied version with its time and who applied it, the content hash and the
 * constitution commit the newest Apply made; View pipeline.json opens the stored text, and Update pipeline opens an update of it with
 * `pipeline-update-start` and moves to `#pipeline/edit`.
 */
import { useState } from 'react';

import { ActionBar }            from '../../../design-system/ActionBar.tsx';
import { Button }               from '../../../design-system/Button.tsx';
import { Tag }                  from '../../../design-system/Tag.tsx';
import { CommandButton }        from '../../../shell/CommandButton.tsx';
import { HashRouter }           from '../../../shell/HashRouter.ts';
import { UPDATE_START_COMMAND } from '../flow/PipelineFlowEditSender.ts';
import type { LiveFooterView }  from './LivePipelineModel.ts';
import { PipelineFileDialog }   from './PipelineFileDialog.tsx';

const EDIT_ROUTE = Object.freeze({ tab: 'pipeline', item: 'edit' } as const);

export interface LiveFooterProps {
  readonly footer: LiveFooterView;
}

export function LiveFooter({ footer }: LiveFooterProps) {
  const [fileIsShown, setFileIsShown] = useState(false);
  return (
    <>
      <ActionBar
        label="Applied pipeline"
        start={(
          <>
            <Tag text="Applied" tone="state" state="delivered" />
            <span className="bridge-pipeline-live-version">{footer.versionText}</span>
            <span className="bridge-pipeline-live-hash">{footer.hashText}</span>
            {footer.commitText === null ? null : <span className="bridge-pipeline-live-hash">{footer.commitText}</span>}
          </>
        )}
        end={(
          <>
            <Button label="View pipeline.json" expanded={fileIsShown} onPress={() => setFileIsShown(true)} />
            <CommandButton label="Update pipeline" command={UPDATE_START_COMMAND} primary onApplied={() => HashRouter.navigateTo(EDIT_ROUTE)} />
          </>
        )}
      />
      {fileIsShown ? <PipelineFileDialog fileText={footer.fileText} onClose={() => setFileIsShown(false)} /> : null}
    </>
  );
}
