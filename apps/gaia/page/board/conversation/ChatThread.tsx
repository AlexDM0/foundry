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
import type { BoardDisplayState } from '../../@types/board/BoardVocabulary.ts';
import {
  Stamp,
  type StampProps,
  StateDot,
  Tag,
  type TagProps,
  TextButton
} from '../../lib/design-system/DesignSystemInterface.ts';
import { useFlintHabitat } from '../../lib/flint/FlintInterface.ts';

import { useCueOnChange }                          from '../flint/UseCueOnChange.ts';
import { presenceAttributeOf, useItemPresence }    from '../shell/ItemPresence.ts';
import type { ItemPresence }                       from '../utils/ItemPresenceUtil.ts';
import { StateToneUtil }                           from '../utils/StateToneUtil.ts';
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
      <section className="board-chat" aria-label={label} data-flint-workplace="">{children}</section>
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
  readonly state:       BoardDisplayState;
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
  /** The transcript's `historyKey` (`useTranscript`): the turns its history brings are no happening, so they cue nothing and rise in no turn. */
  readonly historyKey:     string | null;
}

/** A turn and whether it arrived after the history, so it rises in. */
interface TurnProps<Turn> {
  readonly turn:     Turn;
  readonly presence: ItemPresence;
}

function SystemLine({ turn, presence }: TurnProps<SystemChatTurn>) {
  const [isRevealed, setIsRevealed] = useState(false);
  return (
    <li className="board-chat-system" data-presence={presenceAttributeOf(presence)}>
      <span>{turn.text}</span>
      {turn.revealText === null ? null : <TextButton label={isRevealed ? 'Hide prompt' : 'Show prompt'} onPress={() => setIsRevealed(!isRevealed)} />}
      {turn.stamp === null ? null : <span className="board-chat-stamp"><Stamp {...turn.stamp} /></span>}
      {turn.revealText !== null && isRevealed ? <p className="board-chat-system-text">{turn.revealText}</p> : null}
    </li>
  );
}

function AgentTurn({ turn, presence }: TurnProps<AgentChatTurn>) {
  return (
    <li className="board-chat-turn" data-speaker="agent" data-presence={presenceAttributeOf(presence)}>
      <div className="board-chat-who" data-state={turn.state} data-state-tone={StateToneUtil.toneOf(turn.state)}>
        <StateDot {...StateToneUtil.dotOf(turn.state)} small />
        <span>{turn.speaker}</span>
        {turn.stamp === null ? null : <span className="board-chat-stamp"><Stamp {...turn.stamp} /></span>}
        {turn.workingText === null ? null : <span className="board-chat-working">{turn.workingText}</span>}
      </div>
      {turn.toolUse === null ? null : <ToolUseFold toolUse={turn.toolUse} />}
      {turn.prose === '' ? null : <p className="board-chat-prose">{turn.prose}</p>}
    </li>
  );
}

function UserTurn({ turn, presence }: TurnProps<UserChatTurn>) {
  return (
    <li className="board-chat-turn" data-speaker="user" data-presence={presenceAttributeOf(presence)}>
      <div className="board-chat-who">
        <span>{turn.speaker}</span>
        {turn.stamp === null
          ? null
          : (
            <>
              <span aria-hidden="true">·</span>
              <span className="board-chat-stamp"><Stamp {...turn.stamp} /></span>
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
      {turn.pictures === null || turn.pictures === undefined ? null : <div className="board-chat-pictures">{turn.pictures}</div>}
      {turn.text === '' ? null : <p className="board-chat-bubble" data-queued={turn.queued === null ? undefined : ''}>{turn.text}</p>}
      {turn.queued === null ? null : <Tag {...turn.queued} />}
    </li>
  );
}

export function ChatThread({
  label, turns, renderDecision, historyKey
}: ChatThreadProps) {
  const threadElement = useRef<HTMLOListElement>(null);
  const sendCue = useFlintHabitat(threadElement, CHAT_SPRITE_HABITAT);
  useCueOnChange(sendCue, chatCueOccasionOf(turns), historyKey);
  const cueRelay = useContext(ChatCueRelayContext);
  useEffect(() => cueRelay?.connect(sendCue), [cueRelay, sendCue]);
  // A turn that goes is replaced at once, such as a queued message by the delivered one, so no turn lingers as it leaves.
  const presentTurns = useItemPresence(turns, ({ key }) => key, historyKey).filter(({ presence }) => presence !== 'leaving');
  return (
    <ol className="board-chat-thread" aria-label={label} ref={threadElement}>
      {presentTurns.map(({ item: turn, presence }) => {
        switch (turn.kind) {
          case 'system':
            return <SystemLine key={turn.key} turn={turn} presence={presence} />;
          case 'agent':
            return <AgentTurn key={turn.key} turn={turn} presence={presence} />;
          case 'user':
            return <UserTurn key={turn.key} turn={turn} presence={presence} />;
          case 'decision':
            return (
              <li key={turn.key} className="board-chat-turn" data-speaker="decision" data-presence={presenceAttributeOf(presence)}>
                {renderDecision(turn.decisionId)}
              </li>
            );
        }
      })}
    </ol>
  );
}
