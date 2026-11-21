/**
 * The gate dialog (A2bGateModal): a gate's command, fix command, folder, phases and network, with its profile box; the same dialog empty
 * adds a gate, its phase ticked; and its prepare variant edits or adds a prepare step, a command alone. Save sends the definition and the
 * phase orders it changes; Remove gate takes the gate out of every phase, Remove prepare step drops the step. Nothing is sent on Esc, × or
 * Cancel, and a gate with no phase ticked cannot be saved. At an entity's level of a monorepo screen, its profile measures that entity's gate.
 */

import { Button }                                                            from 'design-system/Button';
import { Dialog }                                                            from 'design-system/Dialog';
import { Switch }                                                            from 'design-system/Switch';
import { Text }                                                              from 'design-system/Text';
import { View }                                                              from 'design-system/View';
import { useId, useState }                                                   from 'react';
import type { BoardGateProfileRunDocument, BoardPipelineDefinitionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { BOARD_GATE_PHASES, type BoardPipelineNodeMark }                     from '../../../../@types/board/BoardVocabulary.ts';
import type { ProfileLogFollower }                                           from '../../../@types/BoardServices.ts';
import { entityKeyOfScope, useMonorepoLevelScope }                           from '../entities/MonorepoLevelContext.ts';
import type { PipelineFlowEditSender }                                       from '../flow/PipelineFlowEditSender.ts';
import { GatesAreaModel }                                                    from '../gates/GatesAreaModel.ts';

import { GateDialogModel, type GateDialogSubject, type GateForm } from './GateDialogModel.ts';
import { ProfileBox }                                             from './ProfileBox.tsx';
import { StepDialogFoot }                                         from './StepDialogFoot.tsx';

export interface GateDialogProps {
  readonly subject:     GateDialogSubject;
  readonly draft:       BoardPipelineDefinitionDocument | null;
  /** The gate's mark in the subject's phase, for the kicker. */
  readonly mark:        BoardPipelineNodeMark;
  readonly profileRuns: readonly BoardGateProfileRunDocument[];
  /** The open setup record a profile runs for; null on a live board. */
  readonly setupId:     string | null;
  readonly editSender:  PipelineFlowEditSender;
  readonly followLog?:  ProfileLogFollower;
  readonly onClose:     () => void;
}

interface TextFieldProps {
  readonly label:       string;
  /** A quiet clause after the label, such as who runs the command. */
  readonly labelAside?: string;
  readonly value:       string;
  readonly placeholder: string;
  readonly isMono:      boolean;
  readonly onChange:    (value: string) => void;
}

function TextField({
  label, labelAside, value, placeholder, isMono, onChange
}: TextFieldProps) {
  const inputId = useId();
  return (
    <span className="board-pipeline-dialog-field">
      <label className="board-pipeline-dialog-label" htmlFor={inputId}>
        {label}
        {labelAside === undefined ? null : <span className="board-pipeline-dialog-label-aside">{` · ${labelAside}`}</span>}
      </label>
      <input
        id={inputId}
        className="board-pipeline-dialog-input"
        data-mono={isMono ? '' : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  );
}

export function GateDialog({
  subject, draft, mark, profileRuns, setupId, editSender, followLog, onClose
}: GateDialogProps) {
  const [form, setForm] = useState<GateForm>(() => GateDialogModel.formOf(subject, draft));
  const profileEntity = entityKeyOfScope(useMonorepoLevelScope());
  const networkLabelId = useId();
  const isPrepare = subject.rowKind === 'prepare';
  const isNew = subject.name === null;
  const change = (changes: Partial<GateForm>): void => setForm({ ...form, ...changes });
  const removeLabel = isPrepare ? 'Remove prepare step' : 'Remove gate';
  const remove = (): void => editSender.sendEdits(GateDialogModel.removeEditsOf(subject));
  return (
    <Dialog
      title={GateDialogModel.titleOf(subject)}
      kicker={GateDialogModel.kickerOf(subject, draft, mark)}
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="widest"
      foot={(
        <StepDialogFoot
          start={isNew ? null : <Button label={removeLabel} emphasis="danger" disabled={!editSender.enabled} onPress={remove} />}
          saveLabel={isPrepare ? 'Save prepare step' : 'Save gate'}
          canSave={editSender.enabled && GateDialogModel.canSave(subject, form)}
          refusal={editSender.refusal}
          onCancel={onClose}
          onSave={() => editSender.sendEdits(GateDialogModel.saveEditsOf(subject, form, draft))}
        />
      )}
    >
      <View gap="eighteen">
        {isNew ? <TextField label="Name" value={form.name} placeholder={isPrepare ? 'install' : 'typecheck'} isMono onChange={(name) => change({ name })} /> : null}
        <TextField label="Command" value={form.run} placeholder="bun run typecheck" isMono onChange={(run) => change({ run })} />
        {isPrepare
          ? null
          : (
            <>
              <div className="board-pipeline-dialog-columns">
                <TextField
                  label="Fix command"
                  labelAside="the builder runs it first"
                  value={form.fix}
                  placeholder="None"
                  isMono
                  onChange={(fix) => change({ fix })}
                />
                <TextField label="Runs in" value={form.runsIn} placeholder="The worktree root" isMono onChange={(runsIn) => change({ runsIn })} />
              </div>
              <div className="board-pipeline-dialog-columns">
                <fieldset className="board-pipeline-dialog-phases">
                  <legend className="board-pipeline-dialog-label">Phases</legend>
                  <span className="board-pipeline-dialog-checks">
                    {BOARD_GATE_PHASES.map((phase) => (
                      <label key={phase} className="board-pipeline-dialog-check">
                        <input
                          type="checkbox"
                          checked={form.phases[phase]}
                          onChange={() => change({ phases: { ...form.phases, [phase]: !form.phases[phase] } })}
                        />
                        {GateDialogModel.PHASE_WORDS[phase]}
                      </label>
                    ))}
                  </span>
                </fieldset>
                <span className="board-pipeline-dialog-field">
                  <span className="board-pipeline-dialog-label" id={networkLabelId}>Network</span>
                  <span className="board-pipeline-dialog-switch-line">
                    <Switch labelledBy={networkLabelId} accessibleName="Network" checked={form.networkIsOn} onToggle={() => change({ networkIsOn: !form.networkIsOn })} />
                    <Text muted>{GateDialogModel.networkHintOf(form.networkIsOn)}</Text>
                  </span>
                </span>
              </div>
              {form.networkIsOn
                ? (
                  <TextField
                    label="Domains the gate may reach"
                    value={form.networkText}
                    placeholder="registry.example.com"
                    isMono
                    onChange={(networkText) => change({ networkText })}
                  />
                )
                : null}
              {subject.name === null
                ? null
                : (
                  <ProfileBox
                    view={GateDialogModel.profileBoxViewOf(subject.name, subject.phase, profileRuns)}
                    lead={GateDialogModel.profileLeadOf(subject.phase)}
                    startCommand={GatesAreaModel.profileStartCommandOf(setupId, subject.name, subject.phase, profileEntity)}
                    {...(followLog === undefined ? {} : { followLog })}
                  />
                )}
            </>
          )}
      </View>
    </Dialog>
  );
}
