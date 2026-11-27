/**
 * A new product-owner session before it exists: only a composer, whose first message, with or without pictures, starts the session
 * (`intake-start`); once the forge applied it the route follows the job it started. What User typed is this pane's own until then.
 */

import { PAGE_CONTRACT_VERSIONS }          from '../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardPictureLimitsDocument } from '../../../@types/board/BoardFactDocuments.ts';
import { Tag, Text }                       from '../../../lib/design-system/DesignSystemInterface.ts';
import { useBoardNavigation }              from '../../shared/routing/BoardRouteLinks.ts';
import { IntakeChat }                      from './IntakeChat.tsx';
import { IntakeModelUtil }                 from './IntakeModel.ts';
import { IntakePane }                      from './IntakePane.tsx';

const FIRST_MESSAGE_PLACEHOLDER = 'Describe a request, for example: shoppers lose their basket when they switch devices';

export interface NewChatPaneProps {
  readonly pictureLimits: BoardPictureLimitsDocument | null;
  /** Told the new job before the route follows it, so the view shows it starting until a board names it. */
  readonly onStarted:     (jobId: string) => void;
}

export function NewChatPane({ pictureLimits, onStarted }: NewChatPaneProps) {
  const navigateTo = useBoardNavigation();
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
        commandOf={(text, pictures) => ({
          boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'intake-start', text, pictures
        })}
        onApplied={({ startedJobId }) => {
          if (startedJobId === null) return;
          onStarted(startedJobId);
          navigateTo({ tab: 'intake', item: startedJobId });
        }}
      />
    </IntakePane>
  );
}
