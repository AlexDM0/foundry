/** The Intake list: every product-owner session, the selected one marked, under a head that counts them and opens a new chat. */
import { Button } from 'design-system/Button';
import { Tag }    from 'design-system/Tag';

import { ChatTurnWordingUtil }                      from '../../conversation/ChatTurnWordingUtil.ts';
import { useBoardHrefOf }                           from '../../shell/BoardRouteLinks.ts';
import { INTAKE_NEW_CHAT_ITEM, type IntakeSession } from './IntakeModel.ts';
import { IntakePane }                               from './IntakePane.tsx';
import { IntakeSessionRow, NewChatRow }             from './IntakeSessionRow.tsx';

export interface IntakeSessionListProps {
  readonly sessions:      readonly IntakeSession[];
  readonly selectedJobId: string | null;
  readonly newChatIsOpen: boolean;
}

const NEW_CHAT_GLYPH = (
  <svg className="board-intake-new-chat-glyph" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M6 2v8M2 6h8" />
  </svg>
);

export function IntakeSessionList({ sessions, selectedJobId, newChatIsOpen }: IntakeSessionListProps) {
  const hrefOf = useBoardHrefOf();
  return (
    <IntakePane
      label="Product-owner sessions"
      title="Intake"
      besideTitle={<Tag tone="neutral" text={ChatTurnWordingUtil.countTextOf(sessions.length, 'session', 'sessions')} />}
      headEnd={(
        <Button
          label="New chat"
          emphasis="primary"
          compact
          leading={NEW_CHAT_GLYPH}
          href={hrefOf({ tab: 'intake', item: INTAKE_NEW_CHAT_ITEM })}
        />
      )}
    >
      <ul className="board-intake-sessions" aria-label="Sessions">
        {newChatIsOpen ? <NewChatRow /> : null}
        {sessions.map((session) => <IntakeSessionRow key={session.jobId} session={session} selected={session.jobId === selectedJobId} />)}
      </ul>
    </IntakePane>
  );
}
