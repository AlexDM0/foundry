#!/usr/bin/env bun
/**
 * The Talos binary Hephaestus spawns as `<board folder> <start number>`, once per board: one of the entry files that call `process.exit`,
 * and a module whose import is the invocation, so specs spawn it instead.
 */
import { runTalos } from './src/lib/talos/Talos.ts';

// The stamp is recorded and shown on each event-log entry; the wall clock measures real time, the ticks and each line's time bound.
const clock = { stampNow: () => new Date().toISOString(), wallNowMilliseconds: () => Date.now() };
// Talos reaches no `src/shared/`, so the binary reads `SystemRoot` and the variables a launch copies itself, as its composition root.
const ownVariableOf = (name: string): string | undefined => process.env[name];
process.exit(await runTalos(Bun.argv.slice(2), clock, process.platform, process.env['SystemRoot'], ownVariableOf));
