/** The board's notice about its agent over every tab: why a job is not launched, or that no agent is chosen, with the way to fix it. */
import { Banner, Button, Row } from '../../lib/design-system/DesignSystemInterface.ts';

import { AgentChoiceModel }     from '../views/pipeline/agent/AgentChoiceModel.ts';
import type { AgentNoticeView } from './AgentNoticeModel.ts';
import { useBoardHrefOf }       from './BoardRouteLinks.ts';
import { CommandButton }        from './CommandButton.tsx';

export function AgentNotice({ notice }: { readonly notice: AgentNoticeView }) {
  const hrefOf = useBoardHrefOf();
  return (
    <div className="board-agent-notice">
      <Banner
        tone={notice.tone}
        role="status"
        text={notice.text}
        action={(
          <Row centerY gap="eight">
            <Button label={notice.actionLabel} compact href={hrefOf(notice.actionRoute)} />
            {notice.offersLookAgain ? <CommandButton label="Look again" command={AgentChoiceModel.lookAgainCommand()} compact /> : null}
          </Row>
        )}
      />
    </div>
  );
}
