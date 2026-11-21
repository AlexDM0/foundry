/**
 * A job's subagents as small squares in served order, filled while one runs and outlined once it ended, each titled with what it does, then
 * the running and done figure: under the squares in a table cell, beside them on one line in the job panel. Subagents never take a launch
 * slot, so this column is marked not counted.
 */
import type { BoardDisplayState }                       from '../../../@types/board/BoardVocabulary.ts';
import { StateToneUtil }                                from '../../utils/StateToneUtil.ts';
import type { SubagentSquares as SubagentSquaresFacts } from './AgentsModel.ts';

export interface SubagentSquaresProps extends SubagentSquaresFacts {
  /** The lane state of the job's role, whose fill the squares take. */
  readonly state:    BoardDisplayState;
  /** The figure beside the squares on their line, as the job panel reads it; under them by default. */
  readonly oneLine?: boolean;
}

export function SubagentSquares({
  squares, figureText, ariaLabel, state, oneLine = false
}: SubagentSquaresProps) {
  if (squares.length === 0) return <span className="agents-subagents-figure">{figureText}</span>;
  return (
    <div className="agents-subagents" data-state={state} data-state-tone={StateToneUtil.toneOf(state)} data-one-line={oneLine ? '' : undefined}>
      <span className="agents-subagent-squares" role="img" aria-label={ariaLabel}>
        {squares.map((square) => (
          <span key={square.key} className="agents-subagent-square" data-running={square.running ? '' : undefined} title={square.titleText} />
        ))}
      </span>
      <span className="agents-subagents-figure">{figureText}</span>
    </div>
  );
}
