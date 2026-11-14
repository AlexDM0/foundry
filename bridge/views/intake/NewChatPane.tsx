/**
 * A new product-owner session before it exists: only a composer, whose first message, with or without pictures, starts the session
 * (`intake-start`); once the Overseer applied it the route follows the new job. What User typed is this pane's own until then.
 */
import { Tag }  from 'design-system/Tag';
import { Text } from 'design-system/Text';

import type { PictureLimitsDocument } from '../../@types/ConversationDocuments.ts';
import { HashRouter }                 from '../../shell/HashRouter.ts';
import { IntakeChat }                 from './IntakeChat.tsx';
import { IntakeModelUtil }            from './IntakeModel.ts';
import { IntakePane }                 from './IntakePane.tsx';

const FIRST_MESSAGE_PLACEHOLDER = 'Describe a request, for example: shoppers lose their basket when they switch devices';

export interface NewChatPaneProps {
  readonly pictureLimits: PictureLimitsDocument | null;
  /** Told the new job before the route follows it, so the view shows it starting until a board names it. */
  readonly onStarted:     (jobId: string) => void;
}

export function NewChatPane({ pictureLimits, onStarted }: NewChatPaneProps) {
  return (
    <IntakePane
      label="New chat"
      title="New chat"
      headEnd={(
        <>
          <Text typeRole="tab" muted>product-owner · no job yet</Text>
          <Tag text="not started" tone="neutral" />
        </>
      )}
    >
      <IntakeChat
        label="Chat to start a session"
        thread={null}
        composerLabel="First message"
        recipientLabel="New product-owner session"
        recipientJobId={null}
        status={IntakeModelUtil.composerTagOf(null)}
        placeholder={FIRST_MESSAGE_PLACEHOLDER}
        sendLabel="Start session"
        pictureLimits={pictureLimits}
        commandOf={(text, pictures) => ({ kind: 'intake-start', text, ...(pictures.length === 0 ? {} : { pictures }) })}
        onApplied={(result) => {
          const jobId = IntakeModelUtil.newJobIdOf(result);
          if (jobId === null) return;
          onStarted(jobId);
          HashRouter.navigateTo({ tab: 'intake', item: jobId });
        }}
      />
    </IntakePane>
  );
}
