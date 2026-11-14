/**
 * Makes the Agents view the agent panel habitat of Flint: it registers the view's element, cues an agent that appears and a change between
 * some agent working and all idle, and gives Flint the job cell of the row it copies, found by the row's `data-job-id`. The rows differ
 * only in height and Flint walks the bottom edge, so it stands below the job column for every job.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react';

import type { SpriteCopyTarget }                       from '../../../flint/SpriteHabitat.ts';
import { useFlintHabitat }                             from '../../../flint/react/UseFlintHabitat.ts';
import type { IdentifiedRecord }                       from '../../@types/BoardStateDocument.ts';
import { useCueOnChange }                              from '../../flint/UseCueOnChange.ts';
import { AGENT_PANEL_CUES, agentPanelSpriteHabitatOf } from './AgentPanelSpriteHabitat.ts';
import { AgentPanelSpriteModel, type CopiedJob }       from './AgentPanelSpriteModel.ts';
import { AgentsModel }                                 from './AgentsModel.ts';

/** The attribute `JobRow` puts on a job's row. */
const JOB_ROW_ID_ATTRIBUTE = 'data-job-id';
/** The cell of a job's row that `JobRow` gives the job's id and role. */
const JOB_CELL_SELECTOR = 'td[data-column="job"]';

interface CopyTargetSource {
  /** Called in an effect after each render, with what Flint should copy now. */
  readonly follow:        (viewElement: HTMLElement | null, copiedJob: CopiedJob | null) => void;
  readonly copyTargetFor: () => SpriteCopyTarget | null;
}

function createCopyTargetSource(): CopyTargetSource {
  let followedView: HTMLElement | null = null;
  let followedJob: CopiedJob | null = null;
  return {
    follow: (viewElement, copiedJob) => {
      followedView = viewElement;
      followedJob = copiedJob;
    },
    copyTargetFor: () => {
      if (followedView === null || followedJob === null) return null;
      const { jobId, intent } = followedJob;
      const row = [...followedView.querySelectorAll(`[${JOB_ROW_ID_ATTRIBUTE}]`)].find((element) => element.getAttribute(JOB_ROW_ID_ATTRIBUTE) === jobId);
      return row === undefined ? null : { element: row.querySelector(JOB_CELL_SELECTOR) ?? row, intent };
    },
  };
}

export function useAgentPanelHabitat(viewElement: RefObject<HTMLElement | null>, jobs: readonly IdentifiedRecord[], selectedJobId: string | null): void {
  const agentJobs = useMemo(() => jobs.filter(AgentsModel.isAgentJob), [jobs]);
  const copiedJob = useMemo(() => AgentPanelSpriteModel.copiedJobOf(agentJobs, selectedJobId), [agentJobs, selectedJobId]);
  const [copyTargetSource] = useState(createCopyTargetSource);
  useEffect(() => copyTargetSource.follow(viewElement.current, copiedJob), [copyTargetSource, viewElement, copiedJob]);
  const habitat = useMemo(() => agentPanelSpriteHabitatOf(copyTargetSource.copyTargetFor), [copyTargetSource]);
  const sendCue = useFlintHabitat(viewElement, habitat);

  const previousJobIds = useRef(agentJobs.map((job) => job.id));
  useEffect(() => {
    const jobIds = agentJobs.map((job) => job.id);
    const appearedJobIds = AgentPanelSpriteModel.appearedJobIdsOf(previousJobIds.current, jobIds);
    previousJobIds.current = jobIds;
    if (appearedJobIds.length > 0) sendCue(AGENT_PANEL_CUES.AGENT_APPEARS);
  }, [agentJobs, sendCue]);
  // After the appearance, so the newest cue, which the director answers, is that the agent works.
  useCueOnChange(sendCue, AgentPanelSpriteModel.activityOccasionOf(agentJobs));
}
