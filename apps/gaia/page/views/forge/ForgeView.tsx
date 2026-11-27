/**
 * A forge's board, the root of `#forge/<trackerId>[/<tab>[/<item>]]` and the one way a board opens: Gaia's bar, the forge's presence and a
 * refusal head it, then the board's own header, tabs and main area. The view heads itself with the forge's bar, so `forgeViewPartsOf` hands the
 * shell no page title.
 */
import {
  type ReactNode,
  useEffect,
  useRef,
  useState
} from 'react';

import type { CommandBody, ForgeCommandBody, ForgeStopAgents } from '../../@types/CommandDocument.ts';
import type { CrashLogDocument }                               from '../../@types/CrashLogDocument.ts';
import type { FleetDocument, FleetDocumentForge }              from '../../@types/FleetDocument.ts';
import { CommandSender, type CommandResult, useCommandSender } from '../../api/CommandSender.ts';
import { Board, type BoardServicesOf }                         from '../../board/Board.tsx';
import { useBoardSetupHead }                                   from '../../board/shared/BoardSetupHead.ts';
import type { ClockReading }                                   from '../../shared/@types/ClockReading.ts';
import type { SetupProgress }                                  from '../../shared/@types/SetupProgress.ts';
import type { ViewParts }                                      from '../../shared/@types/ViewParts.ts';
import type { BoardRoute }                                     from '../../shared/BoardRouter.ts';
import { HashRouter }                                          from '../../shared/HashRouter.ts';
import type { CrashLogResult }                                 from './CrashLogRequest.ts';
import {
  BarRefusalLine,
  ForgeActionsMenu,
  ForgeAreaLayout,
  ForgeBarControls,
  ForgeBarLayout,
  ForgeSetupBarContent,
  ForgeSetupStepRow,
  RunningVersionsLine,
} from './ForgeLayout.tsx';
import { type ForgeBar, type ForgeContent, ForgeModel } from './ForgeModel.ts';
import { type CrashLogOpening, ForgePresenceLayout }    from './ForgePresenceLayout.tsx';
import { ForgePresenceModel }                           from './ForgePresenceModel.ts';

/** What the page around a forge's board hands it: the server's crash logs, the board's services, and a tab of its own. */
export interface ForgeViewSurroundings {
  /** One crash log of a forge that serves again, read through Gaia's server when User opens it. */
  readonly requestCrashLog:       (trackerId: string, crashLogNumber: number) => Promise<CrashLogResult>;
  readonly boardServicesOf:       BoardServicesOf;
  /** Opens Gaia's own address at a fragment in a browser tab of its own. */
  readonly openInNewTab:          (fragment: string) => void;
  /** Crash logs already read when the view mounts, shown open; a page painted without effects, such as a screen of the visual pass, hands them. */
  readonly crashLogsReadAtMount?: (trackerId: string) => readonly CrashLogDocument[];
  /** Told where the setup of the forge shown stands while its board is in setup, and `null` once it is not or the forge is no longer shown. */
  readonly reportSetupProgress?:  (trackerId: string, progress: SetupProgress | null) => void;
}

/** The forge view's route: the forge, and the board route Gaia's address names. */
export interface ForgeViewRoute {
  readonly trackerId:  string;
  readonly boardRoute: BoardRoute | null;
}

interface ForgeBarWithControlsProps {
  readonly bar:                  ForgeBar;
  readonly onOpenInNewTab:       () => void;
  readonly reportSetupProgress?: ForgeViewSurroundings['reportSetupProgress'];
}

/** Tells the page where the setup stands as the board draws, and that it stands nowhere once the bar goes; the page ignores a repeat. */
function useSetupProgressReport(trackerId: string, progress: SetupProgress | null, report: ForgeViewSurroundings['reportSetupProgress']): void {
  useEffect(() => {
    report?.(trackerId, progress);
  }, [report, trackerId, progress]);
  useEffect(() => (report === undefined ? undefined : () => report(trackerId, null)), [report, trackerId]);
}

function ForgeBarWithControls({ bar, onOpenInNewTab, reportSetupProgress }: ForgeBarWithControlsProps) {
  const {
    send, dismissFailure, dismissRestartPending, states
  } = useCommandSender();
  const setupHead = useBoardSetupHead();
  const [stopIsOpen, setStopIsOpen] = useState(false);
  const [menuIsOpen, setMenuIsOpen] = useState(false);
  const [stopAgents, setStopAgents] = useState<ForgeStopAgents>('keep');
  const stopAnchorRef = useRef<HTMLSpanElement | null>(null);
  useSetupProgressReport(bar.trackerId, setupHead?.progress ?? null, reportSetupProgress);
  const commandState = CommandSender.stateOf(states, { trackerId: bar.trackerId });
  const commandIsOnItsWay = commandState.onItsWay !== null;
  const updateStep = ForgeModel.updateStepOf(commandState);
  const subject = { trackerId: bar.trackerId };
  const { versions } = bar;
  const controlsProps = {
    bar,
    commandIsOnItsWay,
    stopIsOpen,
    stopAnchorRef,
    stopAgents,
    onCommand: (command: ForgeCommandBody) => {
      if (command.kind === 'forge-stop') setStopIsOpen(false);
      setMenuIsOpen(false);
      void send(command);
    },
    onOpenStop: () => {
      setStopAgents('keep');
      setStopIsOpen((isOpen) => !isOpen);
    },
    onChooseStop:    setStopAgents,
    onCancelStop:    () => setStopIsOpen(false),
    updateStep,
    onDismissUpdate: () => (updateStep.step === 'refused' ? dismissFailure(subject) : dismissRestartPending(subject)),
    onOpenInNewTab,
  };
  if (setupHead !== null && bar.cannotTalk === null) {
    return (
      <ForgeBarLayout
        name={bar.project}
        status={null}
        setup={<ForgeSetupBarContent stepBar={setupHead.stepBar} root={bar.root} condition={bar.conditionIsLive ? null : bar.status} />}
        controls={(
          <ForgeActionsMenu
            {...controlsProps}
            menuIsOpen={menuIsOpen}
            onMenuOpenChange={(isOpen) => {
              setMenuIsOpen(isOpen);
              if (!isOpen) setStopIsOpen(false);
            }}
          />
        )}
      />
    );
  }
  return (
    <>
      <ForgeBarLayout name={bar.project} status={bar.status} controls={<ForgeBarControls {...controlsProps} />} />
      {versions === null ? null : <RunningVersionsLine versions={versions} commandIsOnItsWay={commandIsOnItsWay} onCommand={(command) => void send(command)} />}
      {setupHead === null ? null : <ForgeSetupStepRow stepBar={setupHead.stepBar} />}
    </>
  );
}

interface ForgePresenceAreaProps {
  readonly forge:           FleetDocumentForge;
  readonly clock:           ClockReading;
  readonly requestCrashLog: ForgeViewSurroundings['requestCrashLog'];
  readonly crashLogsRead:   readonly CrashLogDocument[];
}

function openingsOfCrashLogsRead(crashLogsRead: readonly CrashLogDocument[]): ReadonlyMap<number, CrashLogOpening> {
  return new Map(crashLogsRead.map((crashLog) => [crashLog.number, { phase: 'read', shown: ForgePresenceModel.crashLogShownOf(crashLog) }]));
}

/**
 * The forge's presence under its bar. A crash log is read once, when User opens it, and kept for as long as the same Hephaestus serves; its
 * key in the parent is the forge and its Hephaestus's start, so a new start reads again.
 */
function ForgePresenceArea({
  forge, clock, requestCrashLog, crashLogsRead
}: ForgePresenceAreaProps) {
  const { send, states } = useCommandSender();
  const [openedCrashLogs, setOpenedCrashLogs] = useState<ReadonlyMap<number, CrashLogOpening>>(() => openingsOfCrashLogsRead(crashLogsRead));
  const content = ForgePresenceModel.presenceContentOf(forge, clock);
  if (ForgePresenceModel.presenceIsQuiet(content)) return null;
  const setOpening = (crashLogNumber: number, opening: CrashLogOpening): void => {
    setOpenedCrashLogs((opened) => new Map(opened).set(crashLogNumber, opening));
  };
  const openCrashLog = (crashLogNumber: number): void => {
    setOpening(crashLogNumber, { phase: 'reading' });
    void requestCrashLog(forge.trackerId, crashLogNumber).then((result) => {
      setOpening(crashLogNumber, result.verdict === 'read' ? { phase: 'read', shown: ForgePresenceModel.crashLogShownOf(result.crashLog) } : { phase: 'not-read' });
    });
  };
  return (
    <ForgePresenceLayout
      project={forge.project}
      content={content}
      openedCrashLogs={openedCrashLogs}
      commandIsOnItsWay={CommandSender.stateOf(states, { trackerId: forge.trackerId }).onItsWay !== null}
      onCommand={(command) => void send(command)}
      onOpenCrashLog={openCrashLog}
    />
  );
}

/** The path the system's file chooser answered, or `null` when User cancelled or the choice did not succeed. */
async function chosenProgramPathOf(send: (command: CommandBody) => Promise<CommandResult>): Promise<string | null> {
  const result = await send({ kind: 'path-choose', what: 'file' });
  if (result.verdict !== 'answered' || result.answer.outcome !== 'done') return null;
  return result.answer.text;
}

/** A refusal of the bar's command, under the bar. */
function ForgeRefusalArea({ content }: { readonly content: ForgeContent }) {
  const { send, dismissFailure, states } = useCommandSender();
  const subject = { trackerId: content.area.trackerId };
  const refusal = ForgeModel.barRefusalOf(subject.trackerId, CommandSender.stateOf(states, subject).failure, content.bar?.cannotTalk?.verdict === 'older');
  if (refusal === null) return null;
  return <BarRefusalLine refusal={refusal} onCommand={(command) => void send(command)} onDismiss={() => dismissFailure(subject)} />;
}

interface ForgeContentViewProps {
  readonly content:      ForgeContent;
  /** The machine's home folder, so the board prints a path under it from `~`. */
  readonly homeFolder:   string;
  readonly route:        ForgeViewRoute;
  readonly surroundings: ForgeViewSurroundings;
  /** The view's head, which a board draws at its top, so it knows the board's setup; elsewhere it stands over the area. */
  readonly children:     ReactNode;
}

function ForgeContentView({
  content, homeFolder, route, surroundings, children
}: ForgeContentViewProps) {
  const { send } = useCommandSender();
  const { area } = content;
  if (area.kind !== 'board') {
    return (
      <>
        {children}
        <div className="gaia-forge-frame"><ForgeAreaLayout area={area} /></div>
      </>
    );
  }
  return (
    <div className="gaia-forge-frame">
      <Board
        trackerId={area.trackerId}
        route={route.boardRoute}
        project={area.project}
        servicesOf={(trackerId) => ({ ...surroundings.boardServicesOf(trackerId), homeFolder, chooseProgramFile: () => chosenProgramPathOf(send) })}
      >
        {children}
      </Board>
    </div>
  );
}

/**
 * Before the first fleet document the bar names the forge by its tracker id and the view shows nothing more: Gaia does not yet know whether
 * the forge's board can be read.
 */
export function forgeViewPartsOf(route: ForgeViewRoute, fleetDocument: FleetDocument | null, clock: ClockReading, surroundings: ForgeViewSurroundings): ViewParts {
  const selfHeaded = {
    title: null, lead: '', figures: [], actions: null
  } as const;
  if (fleetDocument === null) {
    return { ...selfHeaded, content: <div className="gaia-forge-frame-view"><ForgeBarLayout name={route.trackerId} status={null} controls={null} /></div> };
  }
  const content = ForgeModel.forgeContentOf(route.trackerId, fleetDocument, clock);
  const { bar } = content;
  const forge = fleetDocument.forges.find((candidate) => candidate.trackerId === route.trackerId);
  const openRouteInNewTab = (): void => surroundings.openInNewTab(HashRouter.fragmentOf({ view: 'forge', ...route }));
  return {
    ...selfHeaded,
    content: (
      <div className="gaia-forge-frame-view">
        <ForgeContentView content={content} homeFolder={fleetDocument.gaia.homeFolder} route={route} surroundings={surroundings}>
          {bar === null
            ? <ForgeBarLayout name={route.trackerId} status={null} controls={null} />
            : (
              <ForgeBarWithControls
                key={bar.trackerId}
                bar={bar}
                onOpenInNewTab={openRouteInNewTab}
                {...(surroundings.reportSetupProgress === undefined ? {} : { reportSetupProgress: surroundings.reportSetupProgress })}
              />
            )}
          {forge === undefined ? null : (
            <ForgePresenceArea
              key={`${forge.trackerId} ${forge.hephaestusStartedAt ?? ''}`}
              forge={forge}
              clock={clock}
              requestCrashLog={surroundings.requestCrashLog}
              crashLogsRead={surroundings.crashLogsReadAtMount?.(forge.trackerId) ?? []}
            />
          )}
          <ForgeRefusalArea content={content} />
        </ForgeContentView>
      </div>
    ),
  };
}
