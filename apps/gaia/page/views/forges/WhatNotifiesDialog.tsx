/**
 * "What notifies", opened from the Gaia panel: the seven kinds in a card, each a checkbox sending `settings-set` for `notifications`, the
 * count on at the head, and the refusal of a change it sent. It closes on Done, its close button or Escape, never on a stray click beside it. The
 * package's dialog holds the hooks; its body and foot take none, so a spec unfolds them whole.
 */
import {
  Button,
  Card,
  Dialog,
  Text,
  View
} from '../../lib/design-system/DesignSystemInterface.ts';

import { formDialogDismissalOf }                                             from './FormDialogDismissal.ts';
import { type GaiaPanelHandlers, SettingsCheckboxView, SettingsRefusalLine } from './GaiaPanel.tsx';
import type { WhatNotifiesContent }                                          from './GaiaPanelModel.ts';

export interface WhatNotifiesDialogProps {
  readonly content:  WhatNotifiesContent;
  readonly handlers: Pick<GaiaPanelHandlers, 'onSettingsCheckbox' | 'onDismissFailure'>;
  readonly onClose:  () => void;
}

/** "5 of 7 on": the kinds checked, out of every kind the list shows. */
export function kindsOnLineOf(content: Pick<WhatNotifiesContent, 'kinds'>): string {
  const kindsOn = content.kinds.filter((checkbox) => checkbox.checked).length;
  return `${kindsOn} of ${content.kinds.length} on`;
}

export function WhatNotifiesCount({ content }: Pick<WhatNotifiesDialogProps, 'content'>) {
  return (
    <span className="gaia-forges-what-notifies-count">
      <Text typeRole="small" muted>{kindsOnLineOf(content)}</Text>
    </span>
  );
}

export function WhatNotifiesBody({ content, handlers }: Omit<WhatNotifiesDialogProps, 'onClose'>) {
  return (
    <View gap="twelve">
      {content.offLine === null ? null : <p className="gaia-forges-what-notifies-off">{content.offLine}</p>}
      <Card paddingVertical="four" paddingHorizontal="sixteen" divider>
        {content.kinds.map((checkbox) => (
          <View key={checkbox.label} paddingVertical="eight">
            <SettingsCheckboxView checkbox={checkbox} handlers={handlers} />
          </View>
        ))}
      </Card>
      <SettingsRefusalLine refusal={content.refusal} handlers={handlers} />
    </View>
  );
}

export function WhatNotifiesFoot({ onClose }: Pick<WhatNotifiesDialogProps, 'onClose'>) {
  return <Button label="Done" emphasis="primary" compact onPress={onClose} />;
}

export function WhatNotifiesDialog({ content, handlers, onClose }: WhatNotifiesDialogProps) {
  return (
    <Dialog
      title="What notifies"
      headEnd={<WhatNotifiesCount content={content} />}
      isOpen
      onDismiss={formDialogDismissalOf(onClose)}
      closeLabel="Close What notifies"
      // The package's wide dialog is the one whose list comes closest to the width the screen design draws.
      width="wide"
      foot={<WhatNotifiesFoot onClose={onClose} />}
    >
      <WhatNotifiesBody content={content} handlers={handlers} />
    </Dialog>
  );
}
