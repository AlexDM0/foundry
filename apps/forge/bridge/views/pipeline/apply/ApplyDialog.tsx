/**
 * A4Confirm, the first Apply: the board starts using the pipeline as the flow shows it. "Resume the board" (on by default) says how many
 * pending tickets start building and how many at a time, and Apply sends it with `pipeline-apply`; a refusal shows verbatim and the
 * dialog stays open. While Apply commits `CONSTITUTION.md` first, the dialog shows the pending state from the facts, and Cancel becomes
 * Cancel apply. Once the pipeline is applied, the setup record closes and the view shows the live flow.
 * Over entities (MonoApply) it lists what is stored per level, the constitutions the one commit holds, the entities worth a look, which
 * never block Apply, and the pending tickets the product owner gives an entity after Apply. Only in update mode over a stored pipeline
 * without entities does it show that tickets in flight refuse Apply (E94), each a link to its detail, with Apply disabled.
 */
import { Callout }  from 'design-system/Callout';
import { Dialog }   from 'design-system/Dialog';
import { Text }     from 'design-system/Text';
import { View }     from 'design-system/View';
import { useState } from 'react';

import type { EntityKey }                                from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { AppliedPipelineFacts, PipelineSetupFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { ApplyDialogModel, type EntitiesRefusalView }    from './ApplyDialogModel.ts';
import { ApplyFoot, ApplyPendingState }                  from './ApplyPendingState.tsx';
import { ConstitutionCommitList }                        from './ConstitutionCommitList.tsx';
import { ConstitutionCommitListModel }                   from './ConstitutionCommitListModel.ts';
import { LevelSummaryList }                              from './LevelSummaryList.tsx';

export interface ApplyDialogProps {
  readonly setup:                            PipelineSetupFacts;
  readonly pendingTicketCount:               number;
  /** Null when the facts carry no concurrency. */
  readonly concurrencyLimit:                 number | null;
  readonly onClose:                          () => void;
  /** Called with the board's resume choice once the Overseer took the Apply. */
  readonly onApplySent?:                     (resumesBoard: boolean) => void;
  /** The stored pipeline, which says over entities whether Apply turns it into entities. */
  readonly storedPipeline?:                  AppliedPipelineFacts;
  /** The tickets in progress, in review or reviewed. */
  readonly ticketIdsInFlight?:               readonly string[];
  /** The pending tickets that name no entity yet. */
  readonly pendingTicketWithoutEntityCount?: number;
  /** Where an entity's level opens, for the entities worth a look; absent, they show no link. */
  readonly entityHrefOf?:                    (entityKey: EntityKey) => string;
}

function EntitiesRefusal({ refusal }: { readonly refusal: EntitiesRefusalView }) {
  return (
    <div role="alert">
      <Callout tone="error" title={refusal.title} titleElement="h3">
        <View gap="six">
          <Text element="p">{refusal.text}</Text>
          <span className="bridge-pipeline-apply-ticket-links">
            {refusal.ticketLinks.map((link) => <a key={link.ticketId} href={link.href}>{link.text}</a>)}
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
      <ul className="bridge-pipeline-apply-worth-a-look" aria-label="Worth a look">
        {items.map((item) => (
          <li key={`${item.reason}-${item.entityKey}`} className="bridge-pipeline-apply-worth-a-look-item">
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
  setup, pendingTicketCount, concurrencyLimit, onClose, onApplySent, storedPipeline, ticketIdsInFlight = [], pendingTicketWithoutEntityCount = 0,
  entityHrefOf
}: ApplyDialogProps) {
  const { record, applyState } = setup;
  const [resumesBoard, setResumesBoard] = useState(applyState?.resumesBoard ?? true);
  const constitutionNote = ApplyDialogModel.constitutionNoteOf(record);
  const choosesResume = applyState === null || applyState.state === 'refused';
  const overEntities = ApplyDialogModel.draftHasEntities(record);
  const refusal = ApplyDialogModel.entitiesRefusalOf(record, { storedPipeline, ticketIdsInFlight });
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
        {refusal === null ? null : <EntitiesRefusal refusal={refusal} />}
        {constitutionNote === null ? null : <Text element="p" muted>{constitutionNote}</Text>}
        {overEntities ? <LevelSummaryList draft={record.draft} /> : null}
        {overEntities ? <ConstitutionCommitList record={record} /> : null}
        {overEntities ? <WorthALook setup={setup} {...(entityHrefOf === undefined ? {} : { entityHrefOf })} /> : null}
        {choosesResume && refusal === null
          ? (
            <View gap="eight">
              <Text typeRole="small" subtle>What starts</Text>
              <label className="bridge-pipeline-apply-resume">
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
