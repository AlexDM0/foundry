/** One command Gaia carries out (PLAN 8.2), mapped in from the page's command document. Internal only, so it carries no version. */
import type { GaiaSettings } from './GaiaSettings.ts';

/** Whether a stop leaves the running agents to the Overseer's stop, or stops them first. */
export type ForgeStopAgents = 'keep' | 'stop-first';

/** What the chooser of `path-choose` lets User pick. */
export type PathChoiceTarget = 'folder' | 'file';

/** One settings key and its value, kept together so a value never travels under another key. */
export type SettingsChange = { readonly [Key in keyof GaiaSettings]: { readonly key: Key; readonly value: GaiaSettings[Key] } }[keyof GaiaSettings];

/** A command about one forge, named by its `trackerId`. */
export type ForgeCommand =
  | {
    readonly kind:      'forge-start' | 'forge-pause' | 'forge-resume' | 'forge-restart' | 'forge-update' | 'forge-open-in-browser' | 'forge-hide' | 'forge-unhide';
    readonly trackerId: string;
  }
  | { readonly kind: 'forge-stop'; readonly trackerId: string; readonly agents: ForgeStopAgents }
  | { readonly kind: 'forge-concurrency-set'; readonly trackerId: string; readonly limit: number };

/** A command about the fleet, the machine or Gaia itself, named by no registered forge. */
export type FleetCommand =
  | { readonly kind: 'fleet-look-again' }
  | { readonly kind: 'forge-add'; readonly root: string; readonly project: string }
  | { readonly kind: 'machine-agent-limit-set'; readonly limit: number }
  | { readonly kind: 'settings-set'; readonly change: SettingsChange }
  | { readonly kind: 'path-choose'; readonly what: PathChoiceTarget };

export type GaiaCommand = ForgeCommand | FleetCommand;
