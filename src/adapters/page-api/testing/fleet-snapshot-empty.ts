/** The internal model of the fleet that `page/testing/fixtures/fleet-empty.ts` shows: what the page mapper is held against. */
import type { FleetSnapshot } from '../../../shared/@types/FleetSnapshot.ts';

export const FLEET_SNAPSHOT_EMPTY: FleetSnapshot = {
  forges:     [],
  attention:  [],
  needsALook: [],
  agents:     [],
  activity:   [],
  machine:    { cpuCount: 12, agentsAskedForByForgeLimits: 0, ticketsWaitingForMachineSlot: null },
  figures:    {
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
    startForgesAtLogin: false,
  },
  gaia: {
    gaiaVersion:       '0.1.0',
    address:           'http://127.0.0.1:4790',
    homeFolder:        '/Users/alexexample',
    registryPath:      '/Users/alexexample/.forge-monitor/projects.json',
    forgeProgramInUse: null,
    settingsFile:      'absent',
    knownContracts:    {
      summary: 1,
      monitor: 1,
      control: 1,
      embed:   1,
    },
  },
};
