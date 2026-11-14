/**
 * "What notifies", opened from the Gaia panel over the Forges view: C2's seven kinds in a card, a hairline between each two, each a checkbox
 * with its line of explanation that sends `settings-set` for `notifications`, how many are on at the head, the line that says nothing
 * notifies while notifications are off, and the refusal of a change it sent. It closes on Done, on its close button and on Escape, never on
 * a stray click beside it. The package's dialog holds the hooks; its body and foot take none, so a spec unfolds them whole.
 */
import { Button }                   from 'design-system/Button';
import { Card }                     from 'design-system/Card';
import { Dialog, type DialogWidth } from 'design-system/Dialog';
import { Text }                     from 'design-system/Text';
import { View }                     from 'design-system/View';

import { type GaiaPanelHandlers, SettingsCheckboxView, SettingsRefusalLine } from './GaiaPanel.tsx';
import type { WhatNotifiesContent }                                          from './GaiaPanelModel.ts';
import { FormDialogUtil }                                                    from './utils/FormDialogUtil.ts';

export interface WhatNotifiesDialogProps {
  readonly content:  WhatNotifiesContent;
  readonly handlers: Pick<GaiaPanelHandlers, 'onSettingsCheckbox' | 'onDismissFailure'>;
  readonly onClose:  () => void;
}

/** C2 draws the list 536 px wide; the package's 600 px dialog leaves it 552 px inside its padding. */
const WHAT_NOTIFIES_WIDTH: DialogWidth = 'wide';

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
      <div className="gaia-forges-what-notifies-kinds">
        <Card paddingVertical="four" paddingHorizontal="sixteen" divider>
          {content.kinds.map((checkbox) => <SettingsCheckboxView key={checkbox.label} checkbox={checkbox} handlers={handlers} />)}
        </Card>
      </div>
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
      onDismiss={FormDialogUtil.dismissalOf(onClose)}
      closeLabel="Close What notifies"
      width={WHAT_NOTIFIES_WIDTH}
      foot={<WhatNotifiesFoot onClose={onClose} />}
    >
      <WhatNotifiesBody content={content} handlers={handlers} />
    </Dialog>
  );
}
