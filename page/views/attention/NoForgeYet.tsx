/**
 * Attention with no forge registered (SCREENS B4): why nothing waits, the form that adds a repository and starts its forge, and, when no
 * forge program is known, a line that says so with a way to choose one. `NoForgeYetLayout` takes no hooks; `NoForgeYet` keeps the form and
 * sends the commands: a folder chosen through `path-choose`, `forge-add`, and the program's path chosen and kept through `settings-set`.
 */
import { useState } from 'react';

import type { CommandBody } from '../../@types/CommandDocument.ts';
import {
  CommandSender,
  type CommandResult,
  type CommandStates,
  type CommandSubject,
  useCommandSender
} from '../../api/CommandSender.ts';
import { Button }                 from '../../design-system/Button.tsx';
import { MicroCapsLabel }         from '../../design-system/MicroCapsLabel.tsx';
import { Refusal }                from '../../design-system/Refusal.tsx';
import { TextField }              from '../../design-system/TextField.tsx';
import { CommandFailureTextUtil } from '../../shared/utils/CommandFailureTextUtil.ts';
import { AddRepositoryForm }      from './AddRepositoryForm.ts';
import { type NoForgeContent }    from './AttentionModel.ts';

/** Which button asked for the last path, so a refused choice shows beside it. */
export type PathChooser = 'folder' | 'forge-program';

export interface NoForgeYetLayoutProps {
  readonly content:              NoForgeContent;
  readonly form:                 AddRepositoryForm;
  readonly pathChooser:          PathChooser;
  readonly commandStates:        CommandStates;
  readonly onFolderTyped:        (folder: string) => void;
  readonly onProjectTyped:       (project: string) => void;
  readonly onChooseFolder:       () => void;
  readonly onAddAndStart:        () => void;
  readonly onChooseForgeProgram: () => void;
  /** Sends the top bar's Look again once more, from its refusal. */
  readonly onLookAgain:          () => void;
  readonly onDismissFailure:     (subject: CommandSubject) => void;
}

const ADD_HEAD_ID = 'gaia-attention-add-head';

const PATH_CHOOSE: CommandSubject = { fleetCommand: 'path-choose' };
const FORGE_ADD: CommandSubject = { fleetCommand: 'forge-add' };
const SETTINGS_SET: CommandSubject = { fleetCommand: 'settings-set' };
const LOOK_AGAIN: CommandSubject = { fleetCommand: 'fleet-look-again' };

function isOnItsWay(commandStates: CommandStates, subject: CommandSubject): boolean {
  return CommandSender.stateOf(commandStates, subject).onItsWay !== null;
}

function FailureLine({
  commandStates, subject, commandLabel, onDismissFailure, onTryAgain
}: {
  readonly commandStates:    CommandStates;
  readonly subject:          CommandSubject;
  readonly commandLabel:     string;
  readonly onDismissFailure: (subject: CommandSubject) => void;
  readonly onTryAgain:       () => void;
}) {
  const { failure } = CommandSender.stateOf(commandStates, subject);
  if (failure === null) return null;
  const { code, sentence } = CommandFailureTextUtil.refusalTextOf(failure);
  return <Refusal commandLabel={commandLabel} code={code} sentence={sentence} onTryAgain={onTryAgain} onDismiss={() => onDismissFailure(subject)} />;
}

export function NoForgeYetLayout({
  content, form, pathChooser, commandStates, onFolderTyped, onProjectTyped, onChooseFolder, onAddAndStart, onChooseForgeProgram, onLookAgain,
  onDismissFailure,
}: NoForgeYetLayoutProps) {
  const choosingAPath = isOnItsWay(commandStates, PATH_CHOOSE);
  const addAndStartCanBeSent = AddRepositoryForm.addAndStartCanBeSent(form, {
    forgeProgramIsMissing: content.forgeProgramIsMissing,
    addIsOnItsWay:         isOnItsWay(commandStates, FORGE_ADD),
  });
  return (
    <div className="gaia-attention-no-forge">
      <div className="gaia-attention-no-forge-column">
        <FailureLine commandStates={commandStates} subject={LOOK_AGAIN} commandLabel="Look again" onDismissFailure={onDismissFailure} onTryAgain={onLookAgain} />
        <div className="gaia-attention-no-forge-intro">
          <h2 className="gaia-attention-no-forge-title">Nothing waits on you, because no forge is registered.</h2>
          <p className="gaia-attention-no-forge-line">
            Gaia runs no agents of its own. It shows the forges on this machine, and a forge appears here the first time it is set up in a repository.
          </p>
        </div>
        <section className="gaia-attention-add" aria-labelledby={ADD_HEAD_ID}>
          <MicroCapsLabel element="h3" id={ADD_HEAD_ID} text="Add a repository" />
          <div className="gaia-attention-add-line">
            <TextField label="Repository folder" labelHidden face="mono" value={form.folder} onChange={onFolderTyped} placeholder="~/development/example-storefront" />
            <Button label="Choose a folder" disabled={choosingAPath} onPress={onChooseFolder} />
          </div>
          <div className="gaia-attention-add-line">
            <TextField label="Project name" labelHidden value={form.project} onChange={onProjectTyped} placeholder="Example Storefront" />
            <Button label="Add and start" emphasis="primary" disabled={!addAndStartCanBeSent} onPress={onAddAndStart} />
          </div>
          <p className="gaia-attention-add-note">Gaia sets up the board in that repository and starts its Overseer. A forge set up elsewhere appears here by itself.</p>
          {pathChooser === 'folder'
            ? <FailureLine commandStates={commandStates} subject={PATH_CHOOSE} commandLabel="Choose a folder" onDismissFailure={onDismissFailure} onTryAgain={onChooseFolder} />
            : null}
          <FailureLine commandStates={commandStates} subject={FORGE_ADD} commandLabel="Add and start" onDismissFailure={onDismissFailure} onTryAgain={onAddAndStart} />
        </section>
        {content.forgeProgramIsMissing ? (
          <div className="gaia-attention-program-missing" role="status">
            <span className="gaia-attention-program-missing-text">
              <span className="gaia-attention-program-missing-title">The forge program was not found.</span>
              {' '}
              <span className="gaia-attention-program-missing-why">Gaia can show running forges without it, but cannot start one.</span>
            </span>
            <Button label="Choose the forge program" disabled={choosingAPath || isOnItsWay(commandStates, SETTINGS_SET)} onPress={onChooseForgeProgram} />
          </div>
        ) : null}
        {[...(pathChooser === 'forge-program' ? [PATH_CHOOSE] : []), SETTINGS_SET].map((subject) => (
          <FailureLine
            key={'fleetCommand' in subject ? subject.fleetCommand : subject.trackerId}
            commandStates={commandStates}
            subject={subject}
            commandLabel="Choose the forge program"
            onDismissFailure={onDismissFailure}
            onTryAgain={onChooseForgeProgram}
          />
        ))}
      </div>
    </div>
  );
}

/** The path a `path-choose` answered, or `null` when User cancelled or the choice did not succeed. */
function chosenPathOf(result: CommandResult): string | null {
  if (result.verdict !== 'answered' || result.answer.outcome !== 'done') return null;
  return result.answer.text;
}

type Send = (command: CommandBody) => Promise<CommandResult>;

/** The commands behind B4's buttons, each a sequence of sends: a folder is chosen; a forge program is chosen, then kept in the settings. */
export const NoForgeYetCommands = {
  async chosenFolderOf(send: Send): Promise<string | null> {
    return chosenPathOf(await send({ kind: 'path-choose', what: 'folder' }));
  },

  async chooseAndKeepForgeProgram(send: Send): Promise<void> {
    const programPath = chosenPathOf(await send({ kind: 'path-choose', what: 'file' }));
    if (programPath !== null) await send({ kind: 'settings-set', key: 'forgeProgramPath', value: programPath });
  },
} as const;

export function NoForgeYet({ content }: { readonly content: NoForgeContent }) {
  const { send, dismissFailure, states } = useCommandSender();
  const [form, setForm] = useState(AddRepositoryForm.EMPTY_FORM);
  const [pathChooser, setPathChooser] = useState<PathChooser>('folder');

  return (
    <NoForgeYetLayout
      content={content}
      form={form}
      pathChooser={pathChooser}
      commandStates={states}
      onFolderTyped={(folder) => setForm((current) => AddRepositoryForm.formAfterFolder(current, folder))}
      onProjectTyped={(project) => setForm((current) => AddRepositoryForm.formAfterProject(current, project))}
      onChooseFolder={() => {
        setPathChooser('folder');
        void NoForgeYetCommands.chosenFolderOf(send).then((folder) => {
          if (folder !== null) setForm((current) => AddRepositoryForm.formAfterFolder(current, folder));
        });
      }}
      onAddAndStart={() => void send(AddRepositoryForm.addCommandOf(form))}
      onChooseForgeProgram={() => {
        setPathChooser('forge-program');
        void NoForgeYetCommands.chooseAndKeepForgeProgram(send);
      }}
      onLookAgain={() => void send({ kind: 'fleet-look-again' })}
      onDismissFailure={dismissFailure}
    />
  );
}
