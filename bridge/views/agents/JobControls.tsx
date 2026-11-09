/**
 * A job's controls, each a `ControlCommand`: Message, Answer (only while one of the job's decisions is open), Wind down, Stop and Fresh
 * agent. Each is offered only in the states the job's facts allow and refused by the Overseer anyway, its refusal shown verbatim; a
 * watch-only Watcher takes nothing but Stop.
 */
import { useState } from 'react';

import { CommandButton }                              from '../../shell/CommandButton.tsx';
import type { AgentJobDocument, JobDecisionDocument } from './AgentJobDocument.ts';
import { AgentsModel }                                from './AgentsModel.ts';

export interface JobControlsProps {
  readonly job:          AgentJobDocument;
  readonly openDecision: JobDecisionDocument | null;
}

export function JobControls({ job, openDecision }: JobControlsProps) {
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState('');
  const trimmedMessage = message.trim();
  const trimmedAnswer = answer.trim();
  if (AgentsModel.isStopping(job)) return <p className="agents-muted">Stopping.</p>;
  const stopControl = <CommandButton label="Stop" command={{ kind: 'job-stop', jobId: job.id, mode: 'stop' }} answeredWhileInstallHeld />;
  if (job.live.watchOnly) return <div className="agents-controls">{stopControl}</div>;
  return (
    <div className="agents-controls">
      {job.role === null
        ? null
        : (
          <div className="agents-field">
            <textarea className="bridge-textarea" aria-label="Message" placeholder="Message" value={message} onChange={(event) => setMessage(event.target.value)} />
            <CommandButton
              label="Send message"
              command={trimmedMessage === '' ? null : { kind: 'job-message', jobId: job.id, text: trimmedMessage }}
              onApplied={() => setMessage('')}
            />
          </div>
        )}
      {openDecision === null
        ? null
        : (
          <div className="agents-field">
            <textarea className="bridge-textarea" aria-label="Answer" placeholder="Answer" value={answer} onChange={(event) => setAnswer(event.target.value)} />
            <CommandButton
              label="Send answer"
              command={trimmedAnswer === '' ? null : { kind: 'decision-answer', decisionId: openDecision.id, answer: { form: 'text', text: trimmedAnswer } }}
              onApplied={() => setAnswer('')}
            />
          </div>
        )}
      <CommandButton label="Wind down" command={{ kind: 'job-stop', jobId: job.id, mode: 'wind-down' }} answeredWhileInstallHeld />
      {stopControl}
      {AgentsModel.offersFreshAgent(job) ? <CommandButton label="Fresh agent" command={{ kind: 'job-fresh', jobId: job.id }} /> : null}
    </div>
  );
}
