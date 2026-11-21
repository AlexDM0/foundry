import type { ForgeFidelity } from '../@types/ForgeReading.ts';

/** The fidelities of a reading the forge's Hephaestus answered, so a command or a frame session may reach it at the reading's address. */
export const HEPHAESTUS_ANSWERED_FIDELITIES: ReadonlySet<ForgeFidelity> = new Set<ForgeFidelity>(['full', 'counts-only', 'newer-contract']);
