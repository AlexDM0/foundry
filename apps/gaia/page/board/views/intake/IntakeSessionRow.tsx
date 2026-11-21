/**
 * One row of the Intake list, a link to its session's chat: the job id and title on one line, then its state, an asks-User tag per open
 * decision and what it filed, then its last line. The new chat's row stands first while it is open.
 */
import { MonoId, StateBadge, Tag } from '../../../lib/design-system/DesignSystemInterface.ts';

import { useBoardHrefOf }                                            from '../../shell/BoardRouteLinks.ts';
import { StateToneUtil }                                             from '../../utils/StateToneUtil.ts';
import { INTAKE_NEW_CHAT_ITEM, IntakeModelUtil, type IntakeSession } from './IntakeModel.ts';

export function IntakeSessionRow({ session, selected }: { readonly session: IntakeSession; readonly selected: boolean }) {
  const facts = IntakeModelUtil.sessionFactsOf(session);
  const hrefOf = useBoardHrefOf();
  return (
    <li>
      <a
        className="board-intake-session"
        href={hrefOf({ tab: 'intake', item: session.jobId })}
        aria-current={selected ? 'true' : undefined}
        aria-label={`Intake ${session.jobId}`}
        data-closed={session.ended ? '' : undefined}
      >
        <span className="board-intake-session-top">
          <MonoId text={session.jobId} tone="strong" weight="bold" />
          <span className="board-intake-session-title">{session.title}</span>
        </span>
        <span className="board-intake-session-facts">
          <StateBadge {...StateToneUtil.lookOf(facts.pill.state)} label={facts.pill.label} size="compact" />
          {facts.askTexts.map((text) => <Tag key={text} text={text} tone="warn" />)}
          {facts.ticketsText === null ? null : <span>{facts.ticketsText}</span>}
          {facts.resumeText === null ? null : <span>{facts.resumeText}</span>}
        </span>
        {session.lastLine === null ? null : <span className="board-intake-session-last">{session.lastLine}</span>}
      </a>
    </li>
  );
}

export function NewChatRow() {
  const hrefOf = useBoardHrefOf();
  return (
    <li>
      <a className="board-intake-session" href={hrefOf({ tab: 'intake', item: INTAKE_NEW_CHAT_ITEM })} aria-current="true" data-new="">
        <span className="board-intake-session-top">
          <span className="board-intake-session-title">New chat</span>
        </span>
        <span className="board-intake-session-last">its first message starts a session</span>
      </a>
    </li>
  );
}
