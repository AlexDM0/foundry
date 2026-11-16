/**
 * The internal model of the fleet that `page/testing/fixtures/fleet-empty.ts` shows: what the page mapper is held against. No settings file
 * is stored, so its settings are the defaults Gaia runs on.
 */
import type { FleetSnapshot }     from '../../../shared/@types/FleetSnapshot.ts';
import { GAIA_SETTINGS_DEFAULTS } from '../../../shared/constants/GaiaSettingsDefaults.ts';

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
  settings: GAIA_SETTINGS_DEFAULTS,
  gaia:     {
    gaiaVersion:       '0.1.0',
    address:           'http://127.0.0.1:4790',
    homeFolder:        '/Users/alexexample',
    registryPath:      '/Users/alexexample/.forge-monitor/projects.json',
    forgeProgramInUse: null,
    settingsFile:      'absent',
    knownContracts:    {
      summary: 1,
      monitor: 3,
      control: 1,
      embed:   1,
    },
    versions: {
      systemVersion:         { major: 1, minor: 0 },
      supportedForgeVersion: { major: 1, minor: 0 },
    },
  },
};
