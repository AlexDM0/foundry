/**
 * A job's controls, each a board command: Answer while one of its decisions is open, and Resume, Wind down, Stop and Fresh agent as the
 * forge offers them; a refusal shows verbatim. A half-typed answer belongs to the decision it was typed for, so it goes once the job opens
 * another. A message to the job is the panel foot's `JobMessageBox`.
 */
import { useState } from 'react';

import { PAGE_CONTRACT_VERSIONS }                     from '../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardJobStopMode }                      from '../../../@types/board/BoardVocabulary.ts';
import { CommandButton }                              from '../../shared/commands/CommandButton.tsx';
import type { AgentJobDocument, JobDecisionDocument } from './AgentJobDocument.ts';
import { AgentsModel }                                from './AgentsModel.ts';

export interface JobControlsProps {
  readonly job:          AgentJobDocument;
  readonly openDecision: JobDecisionDocument | null;
}

const CONTROLS_LABEL = 'Job controls';

const COMMAND_VERSION = { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand } as const;

/** In the order the controls stand: the gentler stop first. */
const STOP_MODE_LABELS: readonly (readonly [BoardJobStopMode, string])[] = [['wind-down', 'Wind down'], ['stop', 'Stop']];

interface AnswerDraft {
  readonly decisionId: string | null;
  readonly text:       string;
}

export function JobControls({ job, openDecision }: JobControlsProps) {
  const openDecisionId = openDecision?.id ?? null;
  const [answerDraft, setAnswerDraft] = useState<AnswerDraft>({ decisionId: openDecisionId, text: '' });
  const answer = answerDraft.decisionId === openDecisionId ? answerDraft.text : '';
  const trimmedAnswer = answer.trim();
  if (AgentsModel.isStopping(job)) return <p className="agents-muted">Stopping.</p>;
  return (
    <div className="agents-controls" role="group" aria-label={CONTROLS_LABEL}>
      {openDecision === null
        ? null
        : (
          <div className="agents-field">
            <textarea
              className="board-textarea"
              aria-label="Answer"
              placeholder="Answer"
              value={answer}
              onChange={(event) => setAnswerDraft({ decisionId: openDecision.id, text: event.target.value })}
            />
            <CommandButton
              label="Send answer"
              command={trimmedAnswer === '' ? null : {
                ...COMMAND_VERSION, kind: 'decision-answer', decisionId: openDecision.id, answer: { form: 'text', text: trimmedAnswer }
              }}
              onApplied={() => setAnswerDraft({ decisionId: openDecision.id, text: '' })}
              compact
            />
          </div>
        )}
      {job.waitsFor === 'instruction'
        ? <CommandButton label="Resume" command={{ ...COMMAND_VERSION, kind: 'interrupted-work-resume', target: { jobId: job.id } }} primary compact />
        : null}
      {STOP_MODE_LABELS.filter(([mode]) => job.offers.stopModes.includes(mode)).map(([mode, label]) => (
        <CommandButton key={mode} label={label} command={{
          ...COMMAND_VERSION, kind: 'job-stop', jobId: job.id, mode
        }} answeredWhileInstallHeld compact />
      ))}
      {job.offers.takesFresh
        ? <CommandButton label="Fresh agent" command={{
          ...COMMAND_VERSION, kind: 'job-fresh', jobId: job.id, incidentId: null
        }} compact />
        : null}
    </div>
  );
}
