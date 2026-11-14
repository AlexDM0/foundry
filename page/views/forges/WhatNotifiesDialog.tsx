/**
 * "What notifies", opened from the Gaia panel over the Forges view: C2's seven kinds, each a checkbox with its line of explanation that
 * sends `settings-set` for `notifications`, the line that says nothing notifies while notifications are off, and the refusal of a change
 * it sent. It closes on Done, on its close button and on Escape, never on a stray click beside it. The package's dialog holds the hooks;
 * its body and foot take none, so a spec unfolds them whole.
 */
import { Button } from 'design-system/Button';
import { Dialog } from 'design-system/Dialog';

import { type GaiaPanelHandlers, SettingsCheckboxView, SettingsRefusalLine } from './GaiaPanel.tsx';
import type { WhatNotifiesContent }                                          from './GaiaPanelModel.ts';
import { FormDialogUtil }                                                    from './utils/FormDialogUtil.ts';

export interface WhatNotifiesDialogProps {
  readonly content:  WhatNotifiesContent;
  readonly handlers: Pick<GaiaPanelHandlers, 'onSettingsCheckbox' | 'onDismissFailure'>;
  readonly onClose:  () => void;
}

export function WhatNotifiesBody({ content, handlers }: Omit<WhatNotifiesDialogProps, 'onClose'>) {
  return (
    <>
      {content.offLine === null ? null : <p className="gaia-forges-what-notifies-off">{content.offLine}</p>}
      <div className="gaia-forges-what-notifies-kinds">
        {content.kinds.map((checkbox) => <SettingsCheckboxView key={checkbox.label} checkbox={checkbox} handlers={handlers} />)}
      </div>
      <SettingsRefusalLine refusal={content.refusal} handlers={handlers} />
    </>
  );
}

export function WhatNotifiesFoot({ onClose }: Pick<WhatNotifiesDialogProps, 'onClose'>) {
  return <Button label="Done" emphasis="primary" compact onPress={onClose} />;
}

export function WhatNotifiesDialog({ content, handlers, onClose }: WhatNotifiesDialogProps) {
  return (
    <Dialog
      title="What notifies"
      isOpen
      onDismiss={FormDialogUtil.dismissalOf(onClose)}
      closeLabel="Close What notifies"
      width={FormDialogUtil.WIDTH}
      foot={<WhatNotifiesFoot onClose={onClose} />}
    >
      <WhatNotifiesBody content={content} handlers={handlers} />
    </Dialog>
  );
}
