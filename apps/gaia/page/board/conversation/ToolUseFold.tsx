/**
 * A turn's tool calls, folded: closed it says how many tools ran, which and how many failed; open it lists each call with its input and
 * its result. A running call ticks its elapsed time on the board clock. User's open or close outlasts every later entry of the turn and
 * its end; until User chooses, the fold follows the caller.
 */
import { StateDot }            from 'design-system/StateDot';
import { useEffect, useState } from 'react';

import { useBoardClock }   from '../shell/BoardClock.ts';
import { ElapsedTimeUtil } from '../utils/ElapsedTimeUtil.ts';
import { StateToneUtil }   from '../utils/StateToneUtil.ts';

export type ToolCallOutcome = 'ok' | 'error' | 'running';

export interface ToolCallLine {
  readonly key:        string;
  readonly toolName:   string;
  readonly inputText:  string;
  readonly outcome:    ToolCallOutcome;
  /** What a finished call shows as its result; a running call shows its elapsed time instead. */
  readonly resultText: string | null;
  /** When a running call started; `null` shows no time rather than an invented one. */
  readonly startedAt:  string | null;
}

export interface ToolUse {
  /** "Used 6 tools", or "Using tools · 4 so far" on the working turn. */
  readonly summaryText: string;
  /** "Bash ×4 · Read · Grep". */
  readonly namesText:   string;
  readonly errorText:   string | null;
  readonly calls:       readonly ToolCallLine[];
  /** Whether the fold is open until User opens or closes it: the live turn's fold is open and closes once the turn ends. */
  readonly openAtFirst: boolean;
}

/** The state whose ink and dot a running call takes. */
const RUNNING_CALL_STATE = 'in-progress';

function RunningCallResult({ startedAt }: { readonly startedAt: string | null }) {
  const clock = useBoardClock();
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => clock.everySecond(() => setNow(clock.now())), [clock]);
  const elapsedText = ElapsedTimeUtil.elapsedSinceText(startedAt, now);
  return (
    <span className="board-tool-call-result" data-state={RUNNING_CALL_STATE} data-state-tone={StateToneUtil.toneOf(RUNNING_CALL_STATE)}>
      <StateDot {...StateToneUtil.dotOf(RUNNING_CALL_STATE)} tiny />
      {elapsedText === null ? 'running' : `running ${elapsedText}`}
    </span>
  );
}

function ToolCallItem({ call }: { readonly call: ToolCallLine }) {
  return (
    <li className="board-tool-call" data-outcome={call.outcome}>
      <span className="board-tool-call-name">{call.toolName}</span>
      <span className="board-tool-call-input" title={call.inputText}>{call.inputText}</span>
      {call.outcome === 'running'
        ? <RunningCallResult startedAt={call.startedAt} />
        : <span className="board-tool-call-result">{call.resultText}</span>}
    </li>
  );
}

export function ToolUseFold({ toolUse }: { readonly toolUse: ToolUse }) {
  const [openChosenByUser, setOpenChosenByUser] = useState<boolean | null>(null);
  const isOpen = openChosenByUser ?? toolUse.openAtFirst;
  return (
    <details className="board-tool-fold" open={isOpen}>
      <summary
        className="board-tool-fold-summary"
        onClick={(event) => {
          event.preventDefault();
          setOpenChosenByUser(!isOpen);
        }}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4 2.5 7.5 6 4 9.5" />
        </svg>
        <strong>{toolUse.summaryText}</strong>
        <span className="board-tool-fold-names">{toolUse.namesText}</span>
        {toolUse.errorText === null ? null : <span className="board-tool-fold-errors">{toolUse.errorText}</span>}
      </summary>
      <ol className="board-tool-calls">
        {toolUse.calls.map((call) => <ToolCallItem key={call.key} call={call} />)}
      </ol>
    </details>
  );
}
