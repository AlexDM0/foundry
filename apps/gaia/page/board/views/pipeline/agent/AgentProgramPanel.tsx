/**
 * Which program of the chosen agent this forge starts: this machine's, which every forge that follows it keeps up with, or a program for
 * this forge only, chosen in the system's file chooser. A chosen program is kept for every forge on this machine while the box is ticked,
 * and changing a program other forges follow asks first, naming how many do. The program's run shows as forge reports it, and a program
 * forge refuses shows forge's sentence and is not kept. Nothing found shows where to choose it instead.
 */
import { useContext, useId, useState }                         from 'react';
import type { BoardAgentDocument, BoardPipelineAgentDocument } from '../../../../@types/board/BoardAgentDocuments.ts';
import type { BoardCommandDocument }                           from '../../../../@types/board/BoardCommandDocument.ts';
import {
  Button,
  Checkbox,
  ChoiceInput,
  ChoiceOption,
  ConfirmStrip,
  Tag,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useControlCommandSequence }                                    from '../../../shell/ControlCommandSender.ts';
import { ProgramFileChooserContext }                                    from '../../../shell/ProgramFileChooser.ts';
import { AgentChoiceModel, type AgentChoiceTarget, type ProgramStatus } from './AgentChoiceModel.ts';

export interface AgentProgramPanelProps {
  readonly agent:         BoardAgentDocument;
  /** The setup record's agent while a setup is open, else the forge's. */
  readonly choice:        BoardPipelineAgentDocument | null;
  readonly target:        AgentChoiceTarget;
  readonly project:       string;
  readonly programChoice: ProgramChoiceState;
}

/** The program a person chose and has not kept yet, and whether it is kept for every forge. */
export interface ProgramChoiceState {
  readonly chosenPath:       string | null;
  readonly forEveryForge:    boolean;
  readonly chooserIsOffered: boolean;
  readonly choose:           () => Promise<void>;
  readonly setForEveryForge: (forEveryForge: boolean) => void;
  readonly clear:            () => void;
}

/** Shared by the agent step's footer and its panel, so both open the same chooser. */
export function useProgramChoice(agent: BoardAgentDocument): ProgramChoiceState {
  const chooseProgramFile = useContext(ProgramFileChooserContext);
  const [chosenPath, setChosenPath] = useState<string | null>(null);
  const [forEveryForge, setForEveryForge] = useState(() => AgentChoiceModel.forEveryForgeByDefault(agent));
  return {
    chosenPath,
    forEveryForge,
    chooserIsOffered: chooseProgramFile !== null,
    choose:           async () => {
      if (chooseProgramFile === null) return;
      const path = await chooseProgramFile();
      if (path !== null) setChosenPath(path);
    },
    setForEveryForge,
    clear: () => setChosenPath(null),
  };
}

export function ProgramStatusTag({ status }: { readonly status: ProgramStatus | null }) {
  if (status === null) return null;
  if (status.runs) return <Tag text={status.text} tone="state" stateTone="success" dot />;
  return (
    <span className="board-agent-program-refusal">
      <Tag text="Does not run" tone="error" />
      <Text>{status.text}</Text>
    </span>
  );
}

function PathLine({ path, status }: { readonly path: string; readonly status: ProgramStatus | null }) {
  return (
    <span className="board-agent-path-line">
      <Text mono>{path}</Text>
      <ProgramStatusTag status={status} />
    </span>
  );
}

interface ChosenProgramProps {
  readonly agent:         BoardAgentDocument;
  readonly displayName:   string;
  readonly project:       string;
  readonly programChoice: ProgramChoiceState;
  readonly commands:      readonly BoardCommandDocument[];
}

/** The program chosen in the dialog, before it is kept: whether it is for every forge, and the press that has forge run and keep it. */
function ChosenProgram({
  agent, displayName, project, programChoice, commands
}: ChosenProgramProps) {
  const [isAsking, setIsAsking] = useState(false);
  const sender = useControlCommandSequence();
  const keep = async (): Promise<void> => {
    setIsAsking(false);
    if (await sender.sendCommands(commands)) programChoice.clear();
  };
  const asksFirst = AgentChoiceModel.machineChangeAsksFirst(agent, programChoice.forEveryForge);
  return (
    <div className="board-agent-chosen-program" aria-label="The chosen program">
      <Text mono>{programChoice.chosenPath}</Text>
      <Checkbox
        label="Use it for every forge on this machine"
        checked={programChoice.forEveryForge}
        onChange={programChoice.setForEveryForge}
        explanation={`Kept as this machine's ${displayName}. Untick to pin it to ${project === '' ? 'this forge' : project} only.`}
      />
      <Text muted>Forge runs it once and asks for its version before keeping it.</Text>
      {isAsking
        ? (
          <ConfirmStrip
            label="Change this machine's program"
            question={AgentChoiceModel.machineChangeQuestionOf(agent, displayName)}
            tone="neutral"
            confirm={<Button label="Change it for every forge" emphasis="primary" disabled={!sender.canSend} onPress={() => void keep()} />}
            cancelLabel="Keep the current one"
            onCancel={() => setIsAsking(false)}
          />
        )
        : (
          <span className="board-control">
            <Button
              label="Use this program"
              emphasis="primary"
              disabled={!sender.canSend}
              onPress={() => (asksFirst ? setIsAsking(true) : void keep())}
            />
            {sender.refusal === null
              ? null
              : (
                <span className="board-agent-program-refusal" role="status">
                  <Tag text="Refused" tone="error" />
                  <span className="board-refusal">{sender.refusal}</span>
                </span>
              )}
          </span>
        )}
    </div>
  );
}

export function AgentProgramPanel({
  agent, choice, target, project, programChoice
}: AgentProgramPanelProps) {
  const groupName = useId();
  const sender = useControlCommandSequence();
  const vendor = AgentChoiceModel.chosenVendorOf(agent, choice);
  const displayName = AgentChoiceModel.displayNameOf(agent, vendor);
  const machineProgram = AgentChoiceModel.machineProgramOf(agent);
  const choiceKind = AgentChoiceModel.programChoiceKindOf(choice);
  const pinnedPath = AgentChoiceModel.pinnedPathOf(choice);
  const status = AgentChoiceModel.programStatusOf(agent, choice);
  const nothingFound = machineProgram === null && pinnedPath === null;
  const chosenCommands = vendor === null || programChoice.chosenPath === null
    ? []
    : AgentChoiceModel.chosenProgramCommandsOf(target, vendor, programChoice.chosenPath, programChoice.forEveryForge);
  const chooseButton = (
    <Button label="Choose program…" compact disabled={!programChoice.chooserIsOffered} onPress={() => void programChoice.choose()} />
  );
  return (
    <section className="board-agent-program" aria-label={`The ${displayName} program`}>
      <Text typeRole="title" element="h3">{nothingFound ? `Where is ${displayName} on this machine?` : `The ${displayName} program this forge starts`}</Text>
      {nothingFound
        ? (
          <View gap="eight">
            <Text muted>{`Forge looked where installers put ${displayName} and found no program. Choose it: the chooser opens in your home folder with hidden files shown.`}</Text>
            <span>{chooseButton}</span>
          </View>
        )
        : (
          <div className="board-agent-program-options">
            {machineProgram === null || vendor === null
              ? null
              : (
                <ChoiceOption
                  label={`This machine's ${displayName}`}
                  description={`Every forge on this machine that follows it keeps up when ${displayName} moves or updates.`}
                  chosen={choiceKind === 'machine'}
                  variant="row"
                  facts={<PathLine path={machineProgram.path} status={choiceKind === 'machine' ? status : null} />}
                  input={(
                    <ChoiceInput
                      type="radio"
                      name={groupName}
                      checked={choiceKind === 'machine'}
                      accessibleName={`This machine's ${displayName}`}
                      disabled={!sender.canSend}
                      onChange={() => void sender.sendCommands(AgentChoiceModel.machineChoiceCommandsOf(target, vendor, machineProgram))}
                    />
                  )}
                />
              )}
            <ChoiceOption
              label="A program for this forge only"
              description={`Pins one path to ${project === '' ? 'this forge' : project}; other forges keep this machine's ${displayName}.`}
              chosen={choiceKind === 'pinned'}
              variant="row"
              {...(pinnedPath === null ? {} : { facts: <PathLine path={pinnedPath} status={status} /> })}
              input={(
                <ChoiceInput
                  type="radio"
                  name={groupName}
                  checked={choiceKind === 'pinned'}
                  accessibleName="A program for this forge only"
                  disabled={!programChoice.chooserIsOffered}
                  onChange={() => void programChoice.choose()}
                />
              )}
            />
            <span className="board-agent-program-choose">{chooseButton}</span>
          </div>
        )}
      {sender.refusal === null
        ? null
        : (
          <span className="board-agent-program-refusal" role="status">
            <Tag text="Refused" tone="error" />
            <span className="board-refusal">{sender.refusal}</span>
          </span>
        )}
      {programChoice.chosenPath === null
        ? null
        : <ChosenProgram agent={agent} displayName={displayName} project={project} programChoice={programChoice} commands={chosenCommands} />}
    </section>
  );
}

/** Where forge looked for the agent's program, each place found or not there. */
export function WhereForgeLooked({ agent }: { readonly agent: BoardAgentDocument }) {
  return (
    <View gap="eight">
      <ul className="board-agent-places" aria-label="Where forge looked">
        {AgentChoiceModel.placeRowsOf(agent).map((place) => (
          <li key={place.path} className="board-agent-place" data-found={place.found}>
            <span className="board-agent-place-dot" aria-hidden="true" />
            <Text mono {...(place.found ? {} : { subtle: true })}>{place.path}</Text>
            <Text typeRole="small" subtle>{place.word}</Text>
          </li>
        ))}
      </ul>
      <Text muted>Forge keeps the path as found, never the version folder it points to, so an update of the agent does not break this forge.</Text>
    </View>
  );
}
