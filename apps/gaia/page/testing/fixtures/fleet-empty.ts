/**
 * The example data of the "No forge yet" artboard: no forge is registered, Gaia runs on its default settings because none are stored,
 * and no forge program was found. No forge reports a machine limit, so none is known.
 */
import type { FleetDocument } from '../../@types/FleetDocument.ts';

export const FLEET_EMPTY: FleetDocument = {
  fleetVersion: 12,
  forges:       [],
  attention:    [],
  needsALook:   [],
  agents:       [],
  activity:     [],
  machine:      { cpuCount: 12, agentsAskedForByForgeLimits: 0, ticketsWaitingForMachineSlot: null },
  figures:      {
    waitingOnUser:  0,
    agentsInFlight: 0,
    machineLimit:   null,
    readyTickets:   0,
    deliveredToday: 0,
    tokensToday:    0,
    openIncidents:  0,
    incompleteFor:  [],
  },
  settings: {
    theme:            'auto',
    hiddenTrackerIds: [],
    forgeProgramPath: null,
    notifications:    {
      enabled: true,
      kinds:   {
        'escalated-questions':        true,
        'questions':                  true,
        'reviews-and-merge-accepts':  true,
        'forges-held-or-unreachable': true,
        'quiet-agents':               true,
        'machine-at-agent-limit':     false,
        'draft-tickets':              false,
      },
    },
  },
  gaia: {
    gaiaVersion:       '0.1.0',
    address:           'http://127.0.0.1:4790',
    homeFolder:        '/Users/alexexample',
    registryPath:      '/Users/alexexample/.forge-monitor/projects.json',
    forgeProgramInUse: null,
    settingsFile:      'absent',
    knownContracts:    {
      summary: 3,
      monitor: 6,
      control: 3,
    },
    versions: {
      systemVersion:         { major: 1, minor: 0 },
      supportedForgeVersion: { major: 1, minor: 1 },
    },
  },
  outageEndingsTotal: 0,
};
