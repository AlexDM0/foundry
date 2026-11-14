/**
 * One row of the Intake list, a link to its session's chat: the job id and title on one line, then its state, an asks-User tag per open
 * decision and what it filed, then its last line. The new chat's row stands first while it is open.
 */
import { MonoId }     from 'design-system/MonoId';
import { StateBadge } from 'design-system/StateBadge';
import { Tag }        from 'design-system/Tag';

import { HashRouter }                                                from '../../shell/HashRouter.ts';
import { StateToneUtil }                                             from '../../utils/StateToneUtil.ts';
import { INTAKE_NEW_CHAT_ITEM, IntakeModelUtil, type IntakeSession } from './IntakeModel.ts';

export function IntakeSessionRow({ session, selected }: { readonly session: IntakeSession; readonly selected: boolean }) {
  const facts = IntakeModelUtil.sessionFactsOf(session);
  return (
    <li>
      <a
        className="bridge-intake-session"
        href={HashRouter.fragmentOf({ tab: 'intake', item: session.jobId })}
        aria-current={selected ? 'true' : undefined}
        aria-label={`Intake ${session.jobId}`}
        data-closed={session.closed ? '' : undefined}
      >
        <span className="bridge-intake-session-top">
          <MonoId text={session.jobId} tone="strong" weight="bold" />
          <span className="bridge-intake-session-title">{session.title}</span>
        </span>
        <span className="bridge-intake-session-facts">
          <StateBadge {...StateToneUtil.lookOf(facts.pill.state)} label={facts.pill.label} size="compact" />
          {facts.askTexts.map((text) => <Tag key={text} text={text} tone="warn" />)}
          {facts.ticketsText === null ? null : <span>{facts.ticketsText}</span>}
          {facts.resumeText === null ? null : <span>{facts.resumeText}</span>}
        </span>
        {session.lastLine === null ? null : <span className="bridge-intake-session-last">{session.lastLine}</span>}
      </a>
    </li>
  );
}

export function NewChatRow() {
  return (
    <li>
      <a className="bridge-intake-session" href={HashRouter.fragmentOf({ tab: 'intake', item: INTAKE_NEW_CHAT_ITEM })} aria-current="true" data-new="">
        <span className="bridge-intake-session-top">
          <span className="bridge-intake-session-title">New chat</span>
        </span>
        <span className="bridge-intake-session-last">its first message starts a session</span>
      </a>
    </li>
  );
}
