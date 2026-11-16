/**
 * The form that adds a repository and starts its forge, on B4 and in A4's dialog alike: the folder with "Choose a folder", the project name
 * with its hint, then under a hairline what "Add and start" does, or why it waits, beside it; a refusal of either under them; and, when no
 * forge program is known, the dashed line that says so with a way to choose one. `AddRepositoryFields` and `ForgeProgramMissingLine` take
 * no hooks; `useAddRepositoryForm` keeps the form and sends its commands: a folder chosen through `path-choose`, `forge-add`, and the
 * program's path chosen and kept through `settings-set`. Both choosers share `path-choose`, and other screens send `settings-set`, so the
 * form keeps the result of each send it made and shows a refusal of those subjects only beside the button whose send it was.
 */
import { Button }                      from 'design-system/Button';
import { TextField }                   from 'design-system/TextField';
import { useEffect, useRef, useState } from 'react';

import type { CommandBody } from '../../@types/CommandDocument.ts';
import {
  CommandSender,
  type CommandResult,
  type CommandStates,
  type CommandSubject
} from '../../api/CommandSender.ts';
import { ConditionDot }          from '../../design-system/ConditionDot.tsx';
import { CommandFailureRefusal } from '../CommandFailureRefusal.tsx';
import { AddRepositoryForm }     from './AddRepositoryForm.ts';

/** The result of the form's own last send behind each chooser, so a failure shows beside the button that caused it and nowhere else. */
export interface AddRepositorySentResults {
  readonly folderChoice:        CommandResult | null;
  readonly forgeProgramChoice:  CommandResult | null;
  readonly forgeProgramKeeping: CommandResult | null;
}

export const NOTHING_SENT: AddRepositorySentResults = { folderChoice: null, forgeProgramChoice: null, forgeProgramKeeping: null };

export interface AddRepositoryHandlers {
  readonly onFolderTyped:        (folder: string) => void;
  readonly onProjectTyped:       (project: string) => void;
  readonly onChooseFolder:       () => void;
  readonly onAddAndStart:        () => void;
  readonly onChooseForgeProgram: () => void;
}

export interface AddRepositoryFieldsProps {
  readonly form:                  AddRepositoryForm;
  readonly sentResults:           AddRepositorySentResults;
  readonly forgeProgramIsMissing: boolean;
  readonly commandStates:         CommandStates;
  readonly handlers:              AddRepositoryHandlers;
  readonly onDismissFailure:      (subject: CommandSubject) => void;
}

export interface ForgeProgramMissingLineProps {
  readonly forgeProgramIsMissing: boolean;
  readonly sentResults:           AddRepositorySentResults;
  readonly commandStates:         CommandStates;
  readonly onChooseForgeProgram:  () => void;
  readonly onDismissFailure:      (subject: CommandSubject) => void;
}

const PATH_CHOOSE: CommandSubject = { fleetCommand: 'path-choose' };
const FORGE_ADD: CommandSubject = { fleetCommand: 'forge-add' };
const SETTINGS_SET: CommandSubject = { fleetCommand: 'settings-set' };

const ADD_AND_START_SENTENCE = 'Gaia sets up the board in that repository and starts its Overseer.';
const ADD_AND_START_WAITS_SENTENCE = 'Add and start waits for the forge program. Choose it below.';

function isOnItsWay(commandStates: CommandStates, subject: CommandSubject): boolean {
  return CommandSender.stateOf(commandStates, subject).onItsWay !== null;
}

/** Whether the subject's failure is the result of this send, the very object the sender answered. */
function failureCameFrom(commandStates: CommandStates, subject: CommandSubject, sentResult: CommandResult | null): boolean {
  const { failure } = CommandSender.stateOf(commandStates, subject);
  return failure !== null && failure.result === sentResult;
}

export function AddRepositoryFields({
  form, sentResults, forgeProgramIsMissing, commandStates, handlers, onDismissFailure
}: AddRepositoryFieldsProps) {
  const addAndStartCanBeSent = AddRepositoryForm.addAndStartCanBeSent(form, { forgeProgramIsMissing, addIsOnItsWay: isOnItsWay(commandStates, FORGE_ADD) });
  return (
    <div className="gaia-add-repository">
      <div className="gaia-add-repository-line">
        <TextField label="Repository folder" mono value={form.folder} onChange={handlers.onFolderTyped} placeholder="~/development/example-storefront" />
        <Button label="Choose a folder" disabled={isOnItsWay(commandStates, PATH_CHOOSE)} onPress={handlers.onChooseFolder} />
      </div>
      <div className="gaia-add-repository-field">
        <TextField label="Project name" value={form.project} onChange={handlers.onProjectTyped} placeholder="Example Storefront" />
        <p className="gaia-add-repository-hint">Starts as the folder&apos;s name.</p>
      </div>
      <div className="gaia-add-repository-foot">
        <p className="gaia-add-repository-note">{forgeProgramIsMissing ? ADD_AND_START_WAITS_SENTENCE : ADD_AND_START_SENTENCE}</p>
        <Button label="Add and start" emphasis="primary" disabled={!addAndStartCanBeSent} onPress={handlers.onAddAndStart} />
      </div>
      {failureCameFrom(commandStates, PATH_CHOOSE, sentResults.folderChoice) ? (
        <CommandFailureRefusal
          commandStates={commandStates}
          subject={PATH_CHOOSE}
          commandLabel="Choose a folder"
          onDismissFailure={onDismissFailure}
          onTryAgain={handlers.onChooseFolder}
        />
      ) : null}
      <CommandFailureRefusal
        commandStates={commandStates}
        subject={FORGE_ADD}
        commandLabel="Add and start"
        onDismissFailure={onDismissFailure}
        onTryAgain={handlers.onAddAndStart}
      />
    </div>
  );
}

/** Shown only while no forge program is known; a refused choice or a refused keeping of it shows under it either way. */
export function ForgeProgramMissingLine({
  forgeProgramIsMissing, sentResults, commandStates, onChooseForgeProgram, onDismissFailure
}: ForgeProgramMissingLineProps) {
  const failedSubjects = [
    ...(failureCameFrom(commandStates, PATH_CHOOSE, sentResults.forgeProgramChoice) ? [PATH_CHOOSE] : []),
    ...(failureCameFrom(commandStates, SETTINGS_SET, sentResults.forgeProgramKeeping) ? [SETTINGS_SET] : []),
  ];
  return (
    <>
      {forgeProgramIsMissing ? (
        <div className="gaia-add-repository-program-missing" role="status">
          <ConditionDot condition="missing" />
          <span className="gaia-add-repository-program-missing-text">
            <span className="gaia-add-repository-program-missing-title">The forge program was not found.</span>
            {' '}
            <span className="gaia-add-repository-program-missing-why">Gaia can show running forges without it, but cannot start one.</span>
          </span>
          <Button
            label="Choose the forge program"
            disabled={isOnItsWay(commandStates, PATH_CHOOSE) || isOnItsWay(commandStates, SETTINGS_SET)}
            onPress={onChooseForgeProgram}
          />
        </div>
      ) : null}
      {failedSubjects.map((subject) => (
        <CommandFailureRefusal
          key={'fleetCommand' in subject ? subject.fleetCommand : subject.trackerId}
          commandStates={commandStates}
          subject={subject}
          commandLabel="Choose the forge program"
          onDismissFailure={onDismissFailure}
          onTryAgain={onChooseForgeProgram}
        />
      ))}
    </>
  );
}

type Send = (command: CommandBody) => Promise<CommandResult>;

/** The path a `path-choose` answered, or `null` when User cancelled or the choice did not succeed. */
function chosenPathOf(result: CommandResult): string | null {
  if (result.verdict !== 'answered' || result.answer.outcome !== 'done') return null;
  return result.answer.text;
}

/** The commands behind the form's buttons, each a sequence of sends: a folder is chosen; a forge program is chosen, then kept in the settings. */
export const AddRepositoryCommands = {
  async chosenFolderOf(send: Send): Promise<string | null> {
    return chosenPathOf(await send({ kind: 'path-choose', what: 'folder' }));
  },

  async chooseAndKeepForgeProgram(sendChoice: Send, sendKeeping: Send): Promise<void> {
    const programPath = chosenPathOf(await sendChoice({ kind: 'path-choose', what: 'file' }));
    if (programPath !== null) await sendKeeping({ kind: 'settings-set', key: 'forgeProgramPath', value: programPath });
  },

  /** Whether the add went through: the forge was set up and started, or already was. */
  async addAndStart(send: Send, form: AddRepositoryForm): Promise<boolean> {
    const result = await send(AddRepositoryForm.addCommandOf(form));
    return result.verdict === 'answered' && (result.answer.outcome === 'done' || result.answer.outcome === 'nothing-to-do');
  },

  /** Adds, then runs `onAdded` only while the form is still open: a late answer must not move User from where they went since. */
  async addAndStartWhileOpen(send: Send, form: AddRepositoryForm, formIsOpen: () => boolean, onAdded: () => void): Promise<void> {
    if (await AddRepositoryCommands.addAndStart(send, form) && formIsOpen()) onAdded();
  },
} as const;

export interface AddRepositoryFormState {
  readonly form:        AddRepositoryForm;
  readonly sentResults: AddRepositorySentResults;
  readonly handlers:    AddRepositoryHandlers;
}

/** The form as User fills it in; `onAdded` runs once an add went through while the form is still open, as a dialog that closes then needs. */
export function useAddRepositoryForm(send: Send, onAdded?: () => void): AddRepositoryFormState {
  const [form, setForm] = useState(AddRepositoryForm.EMPTY_FORM);
  const [sentResults, setSentResults] = useState(NOTHING_SENT);
  const formIsOpen = useRef(false);
  useEffect(() => {
    formIsOpen.current = true;
    return () => {
      formIsOpen.current = false;
    };
  }, []);
  const sendRecordedAs = (place: keyof AddRepositorySentResults): Send => async (command) => {
    const result = await send(command);
    if (formIsOpen.current) setSentResults((current) => ({ ...current, [place]: result }));
    return result;
  };
  return {
    form,
    sentResults,
    handlers: {
      onFolderTyped:  (folder) => setForm((current) => AddRepositoryForm.formAfterFolder(current, folder)),
      onProjectTyped: (project) => setForm((current) => AddRepositoryForm.formAfterProject(current, project)),
      onChooseFolder: () => {
        void AddRepositoryCommands.chosenFolderOf(sendRecordedAs('folderChoice')).then((folder) => {
          if (folder !== null && formIsOpen.current) setForm((current) => AddRepositoryForm.formAfterFolder(current, folder));
        });
      },
      onAddAndStart: () => {
        void AddRepositoryCommands.addAndStartWhileOpen(send, form, () => formIsOpen.current, () => onAdded?.());
      },
      onChooseForgeProgram: () => {
        void AddRepositoryCommands.chooseAndKeepForgeProgram(sendRecordedAs('forgeProgramChoice'), sendRecordedAs('forgeProgramKeeping'));
      },
    },
  };
}
