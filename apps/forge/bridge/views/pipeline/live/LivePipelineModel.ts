/**
 * The live pipeline's footer and toast, pure: the applied version with its time and who applied it, the content hash and the commit
 * that the newest Apply landed `CONSTITUTION.md` in; the Apply this view sent counts as landed once the facts show a newer applied
 * version, and its toast says "Board resumed" only when that Apply resumed the board.
 */
import type { AppliedPipelineFacts, PipelineApplication } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { ControlCommandBody }                        from '../../../api/CommandClient.ts';
import { TimeUtil }                                       from '../../../utils/TimeUtil.ts';
import { ApplyChangesDialogModel }                        from '../apply/ApplyChangesDialogModel.ts';
import type { StampFormat }                               from './FlowActivityPanelModel.ts';

const SHORT_HASH_LENGTH = 8;

const SHORT_COMMIT_LENGTH = 7;

const APPLIER_WORDS: Readonly<Record<PipelineApplication['appliedBy'], string>> = Object.freeze({ user: 'User' });

export interface LiveFooterView {
  readonly versionText: string;
  readonly hashText:    string;
  /** Null when the newest Apply made no constitution commit. */
  readonly commitText:  string | null;
  readonly fileText:    string;
}

export interface LiveToastView {
  readonly title: string;
  readonly text:  string;
}

const ADVISE_COMMAND: ControlCommandBody = Object.freeze({ kind: 'pipeline-agent-advise' });

/** "Version 2 · applied 10:30 by User"; the time is left out when the page carries no stamp slices. */
function versionTextOf(application: PipelineApplication | null, stampFormat: StampFormat | null): string {
  if (application === null) return 'Set with the gate verbs, never applied here';
  const applier = APPLIER_WORDS[application.appliedBy];
  const time = stampFormat === null ? '' : ` ${TimeUtil.shortStampText(application.appliedAt, stampFormat.todayCalendarDate, stampFormat.slices)}`;
  return `Version ${String(application.appliedRevision)} · applied${time} by ${applier}`;
}

/** The footer of a readable pipeline; null for any other reading. */
function footerOf(pipeline: AppliedPipelineFacts | undefined, stampFormat: StampFormat | null): LiveFooterView | null {
  if (pipeline?.readingVerdict !== 'readable') return null;
  const constitutionCommit = pipeline.application?.constitutionCommit ?? null;
  return {
    versionText: versionTextOf(pipeline.application, stampFormat),
    hashText:    `content hash ${pipeline.contentHash.slice(0, SHORT_HASH_LENGTH)}`,
    commitText:  constitutionCommit === null ? null : `CONSTITUTION.md ${constitutionCommit.slice(0, SHORT_COMMIT_LENGTH)}`,
    fileText:    pipeline.fileText,
  };
}

/** The applied version once it is newer than the one before the Apply was sent; null while the Apply has not landed. */
function landedRevisionOf(revisionBefore: number | null, pipeline: AppliedPipelineFacts | undefined): number | null {
  const revision = ApplyChangesDialogModel.appliedRevisionOf(pipeline);
  if (revision === null) return null;
  return revisionBefore === null || revision > revisionBefore ? revision : null;
}

function toastOf(resumesBoard: boolean, appliedRevision: number): LiveToastView {
  const version = `Version ${String(appliedRevision)} is live.`;
  return { title: 'Pipeline applied', text: resumesBoard ? `Board resumed · ${version}` : version };
}

export const LivePipelineModel = Object.freeze({
  adviseCommand: ADVISE_COMMAND,
  footerOf,
  landedRevisionOf,
  toastOf,
});
