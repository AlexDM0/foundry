/**
 * A forge's board, the root of `#forge/<trackerId>[/<tab>[/<item>]]` (`docs/design/screens.md` B1), the one way a board opens (decision 43). Gaia's bar
 * heads it, then the board's own header and tabs, then the main area, where the view of every tab is Gaia's own. A forge whose board Gaia cannot read
 * shows why in place of the board. The bar reads the command sender and keeps the Stop question's state, and its Open in new tab opens the same route of
 * Gaia's own address in a new tab. The view heads itself with the forge's bar, so `forgeViewPartsOf` hands the shell no page title. A new fleet document
 * changes both at once.
 */
import { useRef, useState } from 'react';

import type { CommandBody, ForgeStopAgents }      from '../../@types/CommandDocument.ts';
import type { CrashLogDocument }                  from '../../@types/CrashLogDocument.ts';
import type { FleetDocument, FleetDocumentForge } from '../../@types/FleetDocument.ts';
import { CommandSender, useCommandSender }        from '../../api/CommandSender.ts';
import { Board, type BoardServicesOf }            from '../../board/Board.tsx';
import type { BoardRoute }                        from '../../board/shell/BoardRouter.ts';
import type { BoardTabViewTable }                 from '../../board/shell/BoardTabViews.tsx';
import type { ClockReading }                      from '../../shared/@types/ClockReading.ts';
import type { ViewParts }                         from '../../shared/@types/ViewParts.ts';
import { HashRouter }                             from '../../shared/HashRouter.ts';
import type { CrashLogResult }                    from './CrashLogRequest.ts';
import {
  BarRefusalLine,
  ForgeAreaLayout,
  ForgeBarControls,
  ForgeBarLayout,
  RunningVersionsLine,
} from './ForgeLayout.tsx';
import { type ForgeBar, type ForgeContent, ForgeModel } from './ForgeModel.ts';
import { type CrashLogOpening, ForgePresenceLayout }    from './ForgePresenceLayout.tsx';
import { ForgePresenceModel }                           from './ForgePresenceModel.ts';

/** What the page around a forge's board hands it: the server's crash logs, the board's services and views, and a tab of its own. */
export interface ForgeViewSurroundings {
  /** One crash log of a forge that serves again, read through Gaia's server when User opens it. */
  readonly requestCrashLog:       (trackerId: string, crashLogNumber: number) => Promise<CrashLogResult>;
  readonly boardServicesOf:       BoardServicesOf;
  /** The view of every board tab; `BOARD_TAB_VIEWS` unless a spec hands its own. */
  readonly boardTabViews:         BoardTabViewTable;
  /** Opens Gaia's own address at a fragment in a browser tab of its own. */
  readonly openInNewTab:          (fragment: string) => void;
  /** Crash logs already read when the view mounts, shown open; a page painted without effects, such as a screen of the visual pass, hands them. */
  readonly crashLogsReadAtMount?: (trackerId: string) => readonly CrashLogDocument[];
}

/** The forge view's route: the forge, and the board route Gaia's address names. */
export interface ForgeViewRoute {
  readonly trackerId:  string;
  readonly boardRoute: BoardRoute | null;
}

interface ForgeBarWithControlsProps {
  readonly bar:            ForgeBar;
  readonly onOpenInNewTab: () => void;
}

function ForgeBarWithControls({ bar, onOpenInNewTab }: ForgeBarWithControlsProps) {
  const {
    send, dismissFailure, dismissRestartPending, states
  } = useCommandSender();
  const [stopIsOpen, setStopIsOpen] = useState(false);
  const [stopAgents, setStopAgents] = useState<ForgeStopAgents>('keep');
  const stopAnchorRef = useRef<HTMLSpanElement | null>(null);
  const commandState = CommandSender.stateOf(states, { trackerId: bar.trackerId });
  const commandIsOnItsWay = commandState.onItsWay !== null;
  const updateStep = ForgeModel.updateStepOf(commandState);
  const subject = { trackerId: bar.trackerId };
  const { versions } = bar;
  return (
    <>
      <ForgeBarLayout
        name={bar.project}
        status={bar.status}
        controls={(
          <ForgeBarControls
            bar={bar}
            commandIsOnItsWay={commandIsOnItsWay}
            stopIsOpen={stopIsOpen}
            stopAnchorRef={stopAnchorRef}
            stopAgents={stopAgents}
            onCommand={(command) => {
              if (command.kind === 'forge-stop') setStopIsOpen(false);
              void send(command);
            }}
            onOpenStop={() => {
              setStopAgents('keep');
              setStopIsOpen((isOpen) => !isOpen);
            }}
            onChooseStop={setStopAgents}
            onCancelStop={() => setStopIsOpen(false)}
            updateStep={updateStep}
            onDismissUpdate={() => (updateStep.step === 'refused' ? dismissFailure(subject) : dismissRestartPending(subject))}
            onOpenInNewTab={onOpenInNewTab}
          />
        )}
      />
      {versions === null ? null : <RunningVersionsLine versions={versions} commandIsOnItsWay={commandIsOnItsWay} onCommand={(command) => void send(command)} />}
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

interface ForgeContentViewProps {
  readonly content:      ForgeContent;
  readonly route:        ForgeViewRoute;
  readonly surroundings: ForgeViewSurroundings;
}

function ForgeContentView({ content, route, surroundings }: ForgeContentViewProps) {
  const { send, dismissFailure, states } = useCommandSender();
  const { area } = content;
  const subject = { trackerId: area.trackerId };
  const commandState = CommandSender.stateOf(states, subject);
  const refusal = ForgeModel.barRefusalOf(area.trackerId, commandState.failure, content.bar?.cannotTalk?.verdict === 'older');
  const sendCommand = (command: CommandBody): void => void send(command);
  return (
    <div className="gaia-forge-frame">
      {refusal === null ? null : <BarRefusalLine refusal={refusal} onCommand={sendCommand} onDismiss={() => dismissFailure(subject)} />}
      {area.kind === 'board'
        ? (
          <Board
            trackerId={area.trackerId}
            route={route.boardRoute}
            project={area.project}
            servicesOf={surroundings.boardServicesOf}
            tabViews={surroundings.boardTabViews}
          />
        )
        : <ForgeAreaLayout area={area} />}
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
        {bar === null
          ? <ForgeBarLayout name={route.trackerId} status={null} controls={null} />
          : <ForgeBarWithControls key={bar.trackerId} bar={bar} onOpenInNewTab={openRouteInNewTab} />}
        {forge === undefined ? null : (
          <ForgePresenceArea
            key={`${forge.trackerId} ${forge.hephaestusStartedAt ?? ''}`}
            forge={forge}
            clock={clock}
            requestCrashLog={surroundings.requestCrashLog}
            crashLogsRead={surroundings.crashLogsReadAtMount?.(forge.trackerId) ?? []}
          />
        )}
        <ForgeContentView content={content} route={route} surroundings={surroundings} />
      </div>
    ),
  };
}
