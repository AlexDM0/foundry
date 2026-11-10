/**
 * A new product-owner session before it exists: only a composer, whose first message, with or without pictures, starts the session
 * (`intake-start`); once the Overseer applied it the route follows the new job. What User typed is this pane's own until then.
 */
import type { PictureLimitsDocument } from '../../@types/ConversationDocuments.ts';
import { Pane }                       from '../../design-system/Pane.tsx';
import { Tag }                        from '../../design-system/Tag.tsx';
import { HashRouter }                 from '../../shell/HashRouter.ts';
import { IntakeChat }                 from './IntakeChat.tsx';
import { IntakeModelUtil }            from './IntakeModel.ts';

const FIRST_MESSAGE_PLACEHOLDER = 'Describe a request, for example: shoppers lose their basket when they switch devices';

export function NewChatPane({ pictureLimits }: { readonly pictureLimits: PictureLimitsDocument | null }) {
  return (
    <Pane label="New chat" title="New chat" subtitle="product-owner · no job yet" headEnd={<Tag text="not started" tone="neutral" />} body="flush">
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
          if (jobId !== null) HashRouter.navigateTo({ tab: 'intake', item: jobId });
        }}
      />
    </Pane>
  );
}
