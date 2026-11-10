/**
 * The words a chat view gives the items `ChatThreadModelUtil` reads from a session's transcript, the same for every session: a stamp in
 * local time with seconds, a system line, and a turn's tool fold. Each view names its own speaker and its own boot line.
 */
import type { StampProps }                          from '../design-system/Stamp.tsx';
import { TimeUtil }                                 from '../utils/TimeUtil.ts';
import type { SystemLineFacts, ToolCall, ToolFold } from './ChatThreadModel.ts';
import type { ToolCallLine, ToolUse }               from './ToolUseFold.tsx';

const CLIENT_ACT_TEXT: Readonly<Record<Extract<SystemLineFacts, { form: 'client-act' }>['act'], string>> = {
  'answer':      'answered a question',
  'interrupt':   'interrupted the turn',
  'close-input': 'closed the session\'s input',
  'stop':        'stopped the session',
};

const CALL_RESULT_TEXT: Readonly<Record<Exclude<ToolCall['state'], 'running'>, string>> = {
  ok:         'ok',
  error:      'error',
  unanswered: 'no result',
};

/** "1 turn", "3 turns". */
function countTextOf(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** A chat stamp in the viewer's local time with seconds, the full date on hover; none for an entry with no stamp. */
function stampOf(at: string | null, todayCalendarDate: string): StampProps | null {
  const epochMilliseconds = TimeUtil.epochMillisecondsOf(at);
  if (epochMilliseconds === null) return null;
  return { shortText: TimeUtil.secondsClockText(epochMilliseconds, todayCalendarDate), fullText: TimeUtil.fullInstantText(epochMilliseconds), element: 'time' };
}

/** A system line's text; the boot line is the view's own, followed by its chat number when it has one. */
function systemLineTextOf(facts: SystemLineFacts, bootLineText: string): string {
  const chatText = (chatSequence: number | null): string[] => (chatSequence === null ? [] : [`chat ${chatSequence}`]);
  switch (facts.form) {
    case 'boot':
      return [bootLineText, ...chatText(facts.chatSequence)].join(' · ');
    case 'incident-delivery':
      return [`Overseer delivered ${facts.incidentIds.join(', ')}`, ...chatText(facts.chatSequence)].join(' · ');
    case 'overseer-chat':
      return 'Overseer sent a message';
    case 'standing-reply':
      return 'Watcher sent a standing reply';
    case 'client-act':
      return `${facts.sender === 'assistant' ? 'The Assistant' : 'Overseer'} ${CLIENT_ACT_TEXT[facts.act]}`;
  }
}

function toolCallLineOf(call: ToolCall): ToolCallLine {
  return {
    key:        call.key,
    toolName:   call.toolName,
    inputText:  call.inputText,
    outcome:    call.state === 'unanswered' ? 'error' : call.state,
    resultText: call.state === 'running' ? null : CALL_RESULT_TEXT[call.state],
    startedAt:  call.startedAt,
  };
}

/** "Used 6 tools · Bash ×4 · Read · Grep · 1 error"; the working turn's fold says how many so far and starts open. */
function toolUseOf(fold: ToolFold, working: boolean): ToolUse {
  const callCount = fold.calls.length;
  return {
    summaryText: working ? `Using tools · ${callCount} so far` : `Used ${countTextOf(callCount, 'tool', 'tools')}`,
    namesText:   fold.toolCounts.map(({ toolName, count }) => (count === 1 ? toolName : `${toolName} ×${count}`)).join(' · '),
    errorText:   fold.errorCount === 0 ? null : countTextOf(fold.errorCount, 'error', 'errors'),
    calls:       fold.calls.map(toolCallLineOf),
    openAtFirst: working,
  };
}

export const ChatTurnWordingUtil = Object.freeze({
  countTextOf, stampOf, systemLineTextOf, toolUseOf
});
