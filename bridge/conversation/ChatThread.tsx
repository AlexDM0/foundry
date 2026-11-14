/**
 * A conversation as a chat: the card around a thread and its composer, and the thread of turns a conversation view words from its model.
 * A system line sits between two rules and can reveal the text it stands for; an agent turn leads with its speaker, folds its tool calls
 * and then speaks; User's message is a bubble, dashed while it waits in a queue; a decision is placed by the caller. The thread is the
 * chat habitat of Flint: it cues what its newest turn shows, and the card relays the composer's cue to it.
 */
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';

import { useFlintHabitat }                         from '../../flint/react/UseFlintHabitat.ts';
import type { DisplayState }                       from '../../src/lib/tracker-model/@types/Task.ts';
import { TextButton }                              from '../design-system/Button.tsx';
import { Stamp, type StampProps }                  from '../design-system/Stamp.tsx';
import { StateDot }                                from '../design-system/StateDot.tsx';
import { Tag, type TagProps }                      from '../design-system/Tag.tsx';
import { useCueOnChange }                          from '../flint/UseCueOnChange.ts';
import { chatCueOccasionOf }                       from './ChatCueOccasion.ts';
import { ChatCueRelayContext, createChatCueRelay } from './ChatCueRelay.ts';
import { CHAT_SPRITE_HABITAT }                     from './ChatSpriteHabitat.ts';
import { ToolUseFold, type ToolUse }               from './ToolUseFold.tsx';

export interface ChatCardProps {
  readonly label:    string;
  readonly children: ReactNode;
}

/** The card around a thread and its composer. */
export function ChatCard({ label, children }: ChatCardProps) {
  const [cueRelay] = useState(createChatCueRelay);
  return (
    <ChatCueRelayContext.Provider value={cueRelay}>
      <section className="bridge-chat" aria-label={label} data-flint-workplace="">{children}</section>
    </ChatCueRelayContext.Provider>
  );
}

export interface SystemChatTurn {
  readonly kind:       'system';
  readonly key:        string;
  readonly text:       string;
  readonly stamp:      StampProps | null;
  /** The text the line stands for, such as a boot prompt, shown whole on User's ask. */
  readonly revealText: string | null;
}

export interface AgentChatTurn {
  readonly kind:        'agent';
  readonly key:         string;
  readonly speaker:     string;
  readonly state:       DisplayState;
  readonly stamp:       StampProps | null;
  /** Said in place of a stamp while the turn is still working. */
  readonly workingText: string | null;
  readonly toolUse:     ToolUse | null;
  readonly prose:       string;
}

export interface UserChatTurn {
  readonly kind:        'user';
  readonly key:         string;
  readonly speaker:     string;
  readonly stamp:       StampProps | null;
  /** Said after the stamp, such as "1 picture". */
  readonly stampSuffix: string | null;
  readonly text:        string;
  /** The tag of a message that waits in a queue; its bubble is then dashed. */
  readonly queued:      TagProps | null;
  readonly pictures:    ReactNode;
}

export interface DecisionChatTurn {
  readonly kind:       'decision';
  readonly key:        string;
  readonly decisionId: string;
}

export type ChatTurn = SystemChatTurn | AgentChatTurn | UserChatTurn | DecisionChatTurn;

export interface ChatThreadProps {
  readonly label:          string;
  readonly turns:          readonly ChatTurn[];
  readonly renderDecision: (decisionId: string) => ReactNode;
}

function SystemLine({ turn }: { readonly turn: SystemChatTurn }) {
  const [isRevealed, setIsRevealed] = useState(false);
  return (
    <li className="bridge-chat-system">
      <span>{turn.text}</span>
      {turn.revealText === null ? null : <TextButton label={isRevealed ? 'Hide prompt' : 'Show prompt'} onPress={() => setIsRevealed(!isRevealed)} />}
      {turn.stamp === null ? null : <Stamp {...turn.stamp} />}
      {turn.revealText !== null && isRevealed ? <p className="bridge-chat-system-text">{turn.revealText}</p> : null}
    </li>
  );
}

function AgentTurn({ turn }: { readonly turn: AgentChatTurn }) {
  return (
    <li className="bridge-chat-turn" data-speaker="agent">
      <div className="bridge-chat-who" data-state={turn.state}>
        <StateDot state={turn.state} />
        <span>{turn.speaker}</span>
        {turn.stamp === null ? null : <Stamp {...turn.stamp} />}
        {turn.workingText === null ? null : <span className="bridge-chat-working">{turn.workingText}</span>}
      </div>
      {turn.toolUse === null ? null : <ToolUseFold toolUse={turn.toolUse} />}
      {turn.prose === '' ? null : <p className="bridge-chat-prose">{turn.prose}</p>}
    </li>
  );
}

function UserTurn({ turn }: { readonly turn: UserChatTurn }) {
  return (
    <li className="bridge-chat-turn" data-speaker="user">
      <div className="bridge-chat-who">
        <span>{turn.speaker}</span>
        {turn.stamp === null
          ? null
          : (
            <>
              <span aria-hidden="true">·</span>
              <Stamp {...turn.stamp} />
            </>
          )}
        {turn.stampSuffix === null
          ? null
          : (
            <>
              <span aria-hidden="true">·</span>
              <span>{turn.stampSuffix}</span>
            </>
          )}
      </div>
      {turn.pictures === null || turn.pictures === undefined ? null : <div className="bridge-chat-pictures">{turn.pictures}</div>}
      {turn.text === '' ? null : <p className="bridge-chat-bubble" data-queued={turn.queued === null ? undefined : ''}>{turn.text}</p>}
      {turn.queued === null ? null : <Tag {...turn.queued} />}
    </li>
  );
}

export function ChatThread({ label, turns, renderDecision }: ChatThreadProps) {
  const threadElement = useRef<HTMLOListElement>(null);
  const sendCue = useFlintHabitat(threadElement, CHAT_SPRITE_HABITAT);
  useCueOnChange(sendCue, chatCueOccasionOf(turns));
  const cueRelay = useContext(ChatCueRelayContext);
  useEffect(() => cueRelay?.connect(sendCue), [cueRelay, sendCue]);
  return (
    <ol className="bridge-chat-thread" aria-label={label} ref={threadElement}>
      {turns.map((turn) => {
        switch (turn.kind) {
          case 'system':
            return <SystemLine key={turn.key} turn={turn} />;
          case 'agent':
            return <AgentTurn key={turn.key} turn={turn} />;
          case 'user':
            return <UserTurn key={turn.key} turn={turn} />;
          case 'decision':
            return <li key={turn.key} className="bridge-chat-turn" data-speaker="decision">{renderDecision(turn.decisionId)}</li>;
        }
      })}
    </ol>
  );
}
