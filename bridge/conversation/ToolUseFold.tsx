/**
 * A turn's tool calls, folded: closed it says how many tools ran, which and how many failed; open it lists each call with its input and
 * its result. A running call ticks its elapsed time on the Bridge clock. User's open or close outlasts every later entry of the turn.
 */
import { useEffect, useState } from 'react';

import { StateDot }        from '../design-system/StateDot.tsx';
import { useBridgeClock }  from '../shell/BridgeClock.ts';
import { ElapsedTimeUtil } from '../utils/ElapsedTimeUtil.ts';

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
  readonly openAtFirst: boolean;
}

/** The state whose ink and dot a running call takes. */
const RUNNING_CALL_STATE = 'in-progress';

function RunningCallResult({ startedAt }: { readonly startedAt: string | null }) {
  const clock = useBridgeClock();
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => clock.everySecond(() => setNow(clock.now())), [clock]);
  const elapsedText = ElapsedTimeUtil.elapsedSinceText(startedAt, now);
  return (
    <span className="bridge-tool-call-result" data-state={RUNNING_CALL_STATE}>
      <StateDot state={RUNNING_CALL_STATE} />
      {elapsedText === null ? 'running' : `running ${elapsedText}`}
    </span>
  );
}

function ToolCallItem({ call }: { readonly call: ToolCallLine }) {
  return (
    <li className="bridge-tool-call" data-outcome={call.outcome}>
      <span className="bridge-tool-call-name">{call.toolName}</span>
      <span className="bridge-tool-call-input" title={call.inputText}>{call.inputText}</span>
      {call.outcome === 'running'
        ? <RunningCallResult startedAt={call.startedAt} />
        : <span className="bridge-tool-call-result">{call.resultText}</span>}
    </li>
  );
}

export function ToolUseFold({ toolUse }: { readonly toolUse: ToolUse }) {
  const [isOpen, setIsOpen] = useState(toolUse.openAtFirst);
  return (
    <details className="bridge-tool-fold" open={isOpen}>
      <summary
        className="bridge-tool-fold-summary"
        onClick={(event) => {
          event.preventDefault();
          setIsOpen(!isOpen);
        }}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4 2.5 7.5 6 4 9.5" />
        </svg>
        <strong>{toolUse.summaryText}</strong>
        <span className="bridge-tool-fold-names">{toolUse.namesText}</span>
        {toolUse.errorText === null ? null : <span className="bridge-tool-fold-errors">{toolUse.errorText}</span>}
      </summary>
      <ol className="bridge-tool-calls">
        {toolUse.calls.map((call) => <ToolCallItem key={call.key} call={call} />)}
      </ol>
    </details>
  );
}
