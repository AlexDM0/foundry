/**
 * A job's subagents as small squares in served order, filled while one runs and outlined once it ended, each titled with what it does, then
 * the running and done figure. Subagents never take a launch slot, so this column is marked not counted.
 */
import type { DisplayState } from '../../../src/lib/tracker-model/@types/Task.ts';

import type { SubagentSquares as SubagentSquaresFacts } from './AgentsModel.ts';

export interface SubagentSquaresProps extends SubagentSquaresFacts {
  /** The lane state of the job's role, whose fill the squares take. */
  readonly state: DisplayState;
}

export function SubagentSquares({
  squares, figureText, ariaLabel, state
}: SubagentSquaresProps) {
  if (squares.length === 0) return <span className="agents-subagents-figure">{figureText}</span>;
  return (
    <div className="agents-subagents" data-state={state}>
      <span className="agents-subagent-squares" role="img" aria-label={ariaLabel}>
        {squares.map((square) => (
          <span key={square.key} className="agents-subagent-square" data-running={square.running ? '' : undefined} title={square.titleText} />
        ))}
      </span>
      <span className="agents-subagents-figure">{figureText}</span>
    </div>
  );
}
