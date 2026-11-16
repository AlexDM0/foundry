/**
 * Flint's brain's own card in the Agents view, outside the worker card and its slot meter, since the brain is no job and takes no slot:
 * one row of its state behind the brain's diamond, its model, tokens and calls, the time a running brain has left or the forge's words for
 * one that ended or was refused, and Stop while it starts or runs.
 */
import { Pane }                             from 'design-system/Pane';
import { StateBadge, type StateBadgeProps } from 'design-system/StateBadge';

import { CommandButton }                          from '../../shell/CommandButton.tsx';
import type { FlintBrainRow, FlintBrainRowState } from './AgentsModel.ts';

type BrainBadgeLook = Pick<StateBadgeProps, 'tone' | 'dashed' | 'pulsing'>;

/** Orange is work, so a running brain; a starting one waits, dashed; crimson only for a run whose session failed. */
const BADGE_LOOK_OF_STATE: Readonly<Record<FlintBrainRowState, BrainBadgeLook>> = {
  starting: { tone: 'accent', dashed: true },
  running:  { tone: 'accent', pulsing: true },
  ended:    { tone: 'neutral' },
  refused:  { tone: 'neutral' },
};

const FAILED_BADGE_LOOK: BrainBadgeLook = { tone: 'error' };

const FLINT_BRAIN_STOP = { kind: 'flint-brain-stop' } as const;

export function FlintBrainCard({ row }: { readonly row: FlintBrainRow }) {
  const look = row.endedInFailure ? FAILED_BADGE_LOOK : BADGE_LOOK_OF_STATE[row.state];
  return (
    <Pane label="Flint's brain" title="Flint's brain" subtitle="Flint's director, run by the Overseer · never takes a place" body="padded">
      <div className="agents-brain-row" data-state={row.state}>
        <StateBadge {...look} label={row.stateLabel} dotShape="diamond" fitted />
        {row.modelText === null ? null : <span className="agents-brain-model">{row.modelText}</span>}
        {row.tokensText === null ? null : <span className="agents-figure">{row.tokensText}</span>}
        {row.callsText === null ? null : <span className="agents-muted">{row.callsText}</span>}
        {row.countdownText === null ? null : <span className="agents-brain-countdown">{row.countdownText}</span>}
        {row.sentence === null ? null : <span className="agents-muted">{row.sentence}</span>}
        {row.stopOffered
          ? <CommandButton label="Stop" accessibleName="Stop Flint's brain" command={FLINT_BRAIN_STOP} answeredWhileInstallHeld compact />
          : null}
      </div>
    </Pane>
  );
}
