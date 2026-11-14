/**
 * The form that adds a repository and starts its forge, on B4 and in A4's dialog alike: the folder with "Choose a folder", the project name
 * with its hint, then under a hairline what "Add and start" does, or why it waits, beside it; a refusal of either under them; and, when no
 * forge program is known, the dashed line that says so with a way to choose one. `AddRepositoryFields` and `ForgeProgramMissingLine` take
 * no hooks; `useAddRepositoryForm` keeps the form and sends its commands: a folder chosen through `path-choose`, `forge-add`, and the
 * program's path chosen and kept through `settings-set`.
 */
import { Button }   from 'design-system/Button';
import { useState } from 'react';

import type { CommandBody } from '../../@types/CommandDocument.ts';
import {
  CommandSender,
  type CommandResult,
  type CommandStates,
  type CommandSubject
} from '../../api/CommandSender.ts';
import { ConditionDot }          from '../../design-system/ConditionDot.tsx';
import { TextField }             from '../../design-system/TextField.tsx';
import { CommandFailureRefusal } from '../CommandFailureRefusal.tsx';
import { AddRepositoryForm }     from './AddRepositoryForm.ts';

/** Which button asked for the last path, so a refused choice shows beside it. */
export type PathChooser = 'folder' | 'forge-program';

export interface AddRepositoryHandlers {
  readonly onFolderTyped:        (folder: string) => void;
  readonly onProjectTyped:       (project: string) => void;
  readonly onChooseFolder:       () => void;
  readonly onAddAndStart:        () => void;
  readonly onChooseForgeProgram: () => void;
}

export interface AddRepositoryFieldsProps {
  readonly form:                  AddRepositoryForm;
  readonly pathChooser:           PathChooser;
  readonly forgeProgramIsMissing: boolean;
  readonly commandStates:         CommandStates;
  readonly handlers:              AddRepositoryHandlers;
  readonly onDismissFailure:      (subject: CommandSubject) => void;
}

export interface ForgeProgramMissingLineProps {
  readonly forgeProgramIsMissing: boolean;
  readonly pathChooser:           PathChooser;
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

export function AddRepositoryFields({
  form, pathChooser, forgeProgramIsMissing, commandStates, handlers, onDismissFailure
}: AddRepositoryFieldsProps) {
  const addAndStartCanBeSent = AddRepositoryForm.addAndStartCanBeSent(form, { forgeProgramIsMissing, addIsOnItsWay: isOnItsWay(commandStates, FORGE_ADD) });
  return (
    <div className="gaia-add-repository">
      <div className="gaia-add-repository-line">
        <TextField label="Repository folder" face="mono" value={form.folder} onChange={handlers.onFolderTyped} placeholder="~/development/example-storefront" />
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
      {pathChooser === 'folder' ? (
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
  forgeProgramIsMissing, pathChooser, commandStates, onChooseForgeProgram, onDismissFailure
}: ForgeProgramMissingLineProps) {
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
      {[...(pathChooser === 'forge-program' ? [PATH_CHOOSE] : []), SETTINGS_SET].map((subject) => (
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

  async chooseAndKeepForgeProgram(send: Send): Promise<void> {
    const programPath = chosenPathOf(await send({ kind: 'path-choose', what: 'file' }));
    if (programPath !== null) await send({ kind: 'settings-set', key: 'forgeProgramPath', value: programPath });
  },

  /** Whether the add went through: the forge was set up and started, or already was. */
  async addAndStart(send: Send, form: AddRepositoryForm): Promise<boolean> {
    const result = await send(AddRepositoryForm.addCommandOf(form));
    return result.verdict === 'answered' && (result.answer.outcome === 'done' || result.answer.outcome === 'nothing-to-do');
  },
} as const;

export interface AddRepositoryFormState {
  readonly form:        AddRepositoryForm;
  readonly pathChooser: PathChooser;
  readonly handlers:    AddRepositoryHandlers;
}

/** The form as User fills it in; `onAdded` runs once an add went through, as a dialog that closes then needs. */
export function useAddRepositoryForm(send: Send, onAdded?: () => void): AddRepositoryFormState {
  const [form, setForm] = useState(AddRepositoryForm.EMPTY_FORM);
  const [pathChooser, setPathChooser] = useState<PathChooser>('folder');
  return {
    form,
    pathChooser,
    handlers: {
      onFolderTyped:  (folder) => setForm((current) => AddRepositoryForm.formAfterFolder(current, folder)),
      onProjectTyped: (project) => setForm((current) => AddRepositoryForm.formAfterProject(current, project)),
      onChooseFolder: () => {
        setPathChooser('folder');
        void AddRepositoryCommands.chosenFolderOf(send).then((folder) => {
          if (folder !== null) setForm((current) => AddRepositoryForm.formAfterFolder(current, folder));
        });
      },
      onAddAndStart: () => {
        void AddRepositoryCommands.addAndStart(send, form).then((wentThrough) => {
          if (wentThrough) onAdded?.();
        });
      },
      onChooseForgeProgram: () => {
        setPathChooser('forge-program');
        void AddRepositoryCommands.chooseAndKeepForgeProgram(send);
      },
    },
  };
}
