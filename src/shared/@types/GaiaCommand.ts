/** One command Gaia carries out (PLAN 8.2), mapped in from the page's command document. Internal only, so it carries no version. */

/** Whether a stop leaves the running agents to the Overseer's stop, or stops them first. */
export type ForgeStopAgents = 'keep' | 'stop-first';

/** A command about one forge, named by its `trackerId`. */
export type ForgeCommand =
  | { readonly kind: 'forge-start' | 'forge-pause' | 'forge-resume' | 'forge-restart' | 'forge-update' | 'forge-open-in-browser'; readonly trackerId: string }
  | { readonly kind: 'forge-stop'; readonly trackerId: string; readonly agents: ForgeStopAgents };

/** A command about the fleet, named by no forge. */
export type FleetCommand = { readonly kind: 'fleet-look-again' };

export type GaiaCommand = ForgeCommand | FleetCommand;

export type GaiaCommandKind = GaiaCommand['kind'];
