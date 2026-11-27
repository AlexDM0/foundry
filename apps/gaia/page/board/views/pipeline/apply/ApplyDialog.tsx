/**
 * The first Apply: the board starts using the pipeline as the flow shows it, resuming if "Resume the board" stays on. While Apply commits
 * `CONSTITUTION.md` first the dialog shows the pending state. Only in update mode over a pipeline without entities do tickets in flight
 * refuse Apply, each a link to its detail.
 */
import { useState }                                                      from 'react';
import type { BoardAppliedPipelineDocument, BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  Callout,
  Dialog,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useBoardHrefOf }                          from '../../../shared/routing/BoardRouteLinks.ts';
import type { ApprovalDefaults }                   from '../entities/ForgeLevelPageModel.ts';
import { ApplyDialogModel, type ApplyRefusalView } from './ApplyDialogModel.ts';
import { ApplyFoot, ApplyPendingState }            from './ApplyPendingState.tsx';
import { ConstitutionCommitList }                  from './ConstitutionCommitList.tsx';
import { ConstitutionCommitListModel }             from './ConstitutionCommitListModel.ts';
import { LevelSummaryList }                        from './LevelSummaryList.tsx';

export interface ApplyDialogProps {
  readonly setup:                            BoardPipelineSetupDocument;
  readonly pendingTicketCount:               number;
  /** Null when the facts carry no concurrency. */
  readonly concurrencyLimit:                 number | null;
  readonly onClose:                          () => void;
  /** Called with the board's resume choice once Hephaestus took the Apply. */
  readonly onApplySent?:                     (resumesBoard: boolean) => void;
  /** The stored pipeline, which says over entities whether Apply turns it into entities. */
  readonly storedPipeline?:                  BoardAppliedPipelineDocument;
  /** The committed tickets that name no entity yet. */
  readonly pendingTicketWithoutEntityCount?: number;
  /** Where an entity's level opens, for the entities worth a look; absent, they show no link. */
  readonly entityHrefOf?:                    (entityKey: string) => string;
  /** What an approval or a route the draft leaves out reads as, as the forge serves it. */
  readonly defaults:                         ApprovalDefaults;
}

function ApplyRefusal({ refusal }: { readonly refusal: ApplyRefusalView }) {
  const hrefOf = useBoardHrefOf();
  return (
    <div role="alert">
      <Callout tone="error" title={refusal.title} titleElement="h3">
        <View gap="six">
          <Text element="p">{refusal.text}</Text>
          <span className="board-pipeline-apply-ticket-links">
            {refusal.ticketLinks.map((link) => <a key={link.ticketId} href={hrefOf(link.route)}>{link.text}</a>)}
          </span>
        </View>
      </Callout>
    </div>
  );
}

function WorthALook({ setup, entityHrefOf }: Pick<ApplyDialogProps, 'setup' | 'entityHrefOf'>) {
  const items = ApplyDialogModel.worthALookOf(setup.record);
  if (items.length === 0) return null;
  return (
    <View gap="eight">
      <Text typeRole="small" subtle>Worth a look</Text>
      <ul className="board-pipeline-apply-worth-a-look" aria-label="Worth a look">
        {items.map((item) => (
          <li key={`${item.reason}-${item.entityKey}`} className="board-pipeline-apply-worth-a-look-item">
            <Callout
              tone="warn"
              title={item.title}
              titleElement="h4"
              {...(entityHrefOf === undefined ? {} : { actions: <a href={entityHrefOf(item.entityKey)}>{item.linkText}</a> })}
            >
              <Text muted>{item.text}</Text>
            </Callout>
          </li>
        ))}
      </ul>
    </View>
  );
}

export function ApplyDialog({
  setup, pendingTicketCount, concurrencyLimit, onClose, onApplySent, storedPipeline, pendingTicketWithoutEntityCount = 0,
  entityHrefOf, defaults
}: ApplyDialogProps) {
  const { record, applyState } = setup;
  const [resumesBoard, setResumesBoard] = useState(applyState?.resumesBoard ?? true);
  const constitutionNote = ApplyDialogModel.constitutionNoteOf(record);
  const choosesResume = applyState === null || applyState.state === 'refused';
  const overEntities = ApplyDialogModel.draftHasEntities(record);
  const refusal = ApplyDialogModel.applyRefusalOf(setup.applyRefusal);
  const withoutEntityText = ApplyDialogModel.pendingWithoutEntityTextOf(record, storedPipeline, pendingTicketWithoutEntityCount);
  const entityConstitutionCount = overEntities ? ConstitutionCommitListModel.commitOf(record).committedKeys.length : null;
  return (
    <Dialog
      title="Apply the pipeline?"
      description={ApplyDialogModel.descriptionOf(record, storedPipeline)}
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="standard"
      foot={(
        <ApplyFoot
          setupId={record.setupId}
          applyState={applyState}
          closeLabel="Cancel"
          onClose={onClose}
          applyLabel="Apply"
          applyCommand={ApplyDialogModel.applyCommandOf(record, resumesBoard)}
          {...(onApplySent === undefined ? {} : { onApplySent: () => onApplySent(resumesBoard) })}
          {...(refusal === null ? {} : { applyWaitsFor: refusal.disabledReason })}
        />
      )}
    >
      <View gap="eighteen">
        {refusal === null ? null : <ApplyRefusal refusal={refusal} />}
        {constitutionNote === null ? null : <Text element="p" muted>{constitutionNote}</Text>}
        {overEntities ? <LevelSummaryList draft={record.draft} defaults={defaults} /> : null}
        {overEntities ? <ConstitutionCommitList record={record} /> : null}
        {overEntities ? <WorthALook setup={setup} {...(entityHrefOf === undefined ? {} : { entityHrefOf })} /> : null}
        {choosesResume && refusal === null
          ? (
            <View gap="eight">
              <Text typeRole="small" subtle>What starts</Text>
              <label className="board-pipeline-apply-resume">
                <input type="checkbox" checked={resumesBoard} onChange={(event) => setResumesBoard(event.currentTarget.checked)} />
                <View>
                  <Text bold>Resume the board</Text>
                  <Text muted>{ApplyDialogModel.resumeTextOf(pendingTicketCount, concurrencyLimit, ApplyDialogModel.resumePaceOf(record))}</Text>
                </View>
              </label>
              {withoutEntityText === null ? null : <Text muted element="p">{withoutEntityText}</Text>}
            </View>
          )
          : null}
        {applyState === null
          ? null
          : (
            <ApplyPendingState
              applyState={applyState}
              constitutionMarkdown={record.constitution?.markdown ?? null}
              entityConstitutionCount={entityConstitutionCount}
            />
          )}
      </View>
    </Dialog>
  );
}
