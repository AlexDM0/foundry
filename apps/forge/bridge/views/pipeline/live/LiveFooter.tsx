/**
 * The live flow's footer bar (A5Live), as FlowLive draws it: the green Applied pill, the applied version with its time and who applied
 * it, the content hash and the constitution commit the newest Apply made (each entity's constitutions over entities); View stored pipeline
 * opens the stored text, and Update pipeline opens an update of it with `pipeline-update-start` and moves to `#pipeline/edit`.
 */
import { ActionBar } from 'design-system/ActionBar';
import { Button }    from 'design-system/Button';
import { Tag }       from 'design-system/Tag';
import { Text }      from 'design-system/Text';
import { useState }  from 'react';

import { CommandButton }        from '../../../shell/CommandButton.tsx';
import { HashRouter }           from '../../../shell/HashRouter.ts';
import { StateToneUtil }        from '../../../utils/StateToneUtil.ts';
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
            <Tag text="Applied" {...StateToneUtil.tagLookOf('reviewed')} />
            <Text bold>{footer.versionText}</Text>
            <Text typeRole="small" mono subtle>{footer.hashText}</Text>
            {footer.commitText === null ? null : <Text typeRole="small" mono subtle>{footer.commitText}</Text>}
          </>
        )}
        end={(
          <>
            <Button label="View stored pipeline" expanded={fileIsShown} onPress={() => setFileIsShown(true)} />
            <CommandButton label="Update pipeline" command={UPDATE_START_COMMAND} primary onApplied={() => HashRouter.navigateTo(EDIT_ROUTE)} />
          </>
        )}
      />
      {fileIsShown ? <PipelineFileDialog fileText={footer.fileText} onClose={() => setFileIsShown(false)} /> : null}
    </>
  );
}
