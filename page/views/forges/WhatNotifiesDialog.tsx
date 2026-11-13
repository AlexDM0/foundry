/**
 * "What notifies", opened from the Gaia panel over the Forges view: C2's seven kinds, each a checkbox with its line of explanation that
 * sends `settings-set` for `notifications`, the line that says nothing notifies while notifications are off, and the refusal of a change
 * it sent. It closes on Done and on Escape. It takes no hooks.
 */
import { Button }                                                            from '../../design-system/Button.tsx';
import { Dialog }                                                            from '../../design-system/Dialog.tsx';
import { type GaiaPanelHandlers, SettingsCheckboxView, SettingsRefusalLine } from './GaiaPanel.tsx';
import type { WhatNotifiesContent }                                          from './GaiaPanelModel.ts';

export interface WhatNotifiesDialogProps {
  readonly content:  WhatNotifiesContent;
  readonly handlers: Pick<GaiaPanelHandlers, 'onSettingsCheckbox' | 'onDismissFailure'>;
  readonly onClose:  () => void;
}

export function WhatNotifiesDialog({ content, handlers, onClose }: WhatNotifiesDialogProps) {
  return (
    <Dialog title="What notifies" onClose={onClose} actions={<Button label="Done" emphasis="primary" onPress={onClose} />}>
      {content.offLine === null ? null : <p className="gaia-forges-what-notifies-off">{content.offLine}</p>}
      <div className="gaia-forges-what-notifies-kinds">
        {content.kinds.map((checkbox) => <SettingsCheckboxView key={checkbox.label} checkbox={checkbox} handlers={handlers} />)}
      </div>
      <SettingsRefusalLine refusal={content.refusal} handlers={handlers} />
    </Dialog>
  );
}
