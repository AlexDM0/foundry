/**
 * A job's controls, each a `ControlCommand`: Answer (only while one of the job's decisions is open), Wind down, Stop and Fresh agent. Each is
 * offered only in the states the job's facts allow and refused by the Overseer anyway, its refusal shown verbatim; a watch-only Watcher
 * takes nothing but Stop. A message to the job is the panel foot's `JobMessageBox`.
 */
import { useState } from 'react';

import { CommandButton }                              from '../../shell/CommandButton.tsx';
import { JobStateUtil }                               from '../../utils/JobStateUtil.ts';
import type { AgentJobDocument, JobDecisionDocument } from './AgentJobDocument.ts';
import { AgentsModel }                                from './AgentsModel.ts';

export interface JobControlsProps {
  readonly job:          AgentJobDocument;
  readonly openDecision: JobDecisionDocument | null;
}

const CONTROLS_LABEL = 'Job controls';

export function JobControls({ job, openDecision }: JobControlsProps) {
  const [answer, setAnswer] = useState('');
  const trimmedAnswer = answer.trim();
  if (AgentsModel.isStopping(job)) return <p className="agents-muted">Stopping.</p>;
  const stopControl = <CommandButton label="Stop" command={{ kind: 'job-stop', jobId: job.id, mode: 'stop' }} answeredWhileInstallHeld compact />;
  if (job.live.watchOnly) return <div className="agents-controls" role="group" aria-label={CONTROLS_LABEL}>{stopControl}</div>;
  return (
    <div className="agents-controls" role="group" aria-label={CONTROLS_LABEL}>
      {openDecision === null
        ? null
        : (
          <div className="agents-field">
            <textarea className="bridge-textarea" aria-label="Answer" placeholder="Answer" value={answer} onChange={(event) => setAnswer(event.target.value)} />
            <CommandButton
              label="Send answer"
              command={trimmedAnswer === '' ? null : { kind: 'decision-answer', decisionId: openDecision.id, answer: { form: 'text', text: trimmedAnswer } }}
              onApplied={() => setAnswer('')}
              compact
            />
          </div>
        )}
      <CommandButton label="Wind down" command={{ kind: 'job-stop', jobId: job.id, mode: 'wind-down' }} answeredWhileInstallHeld compact />
      {stopControl}
      {JobStateUtil.offersFreshAgent(job.kind) ? <CommandButton label="Fresh agent" command={{ kind: 'job-fresh', jobId: job.id }} compact /> : null}
    </div>
  );
}
