/**
 * The system's file chooser as the board reaches it, to pick an agent's program: the path chosen, or `null` when User cancelled or no
 * choice came. The page around the board hands it in; a board mounted without one offers no chooser.
 */
import { createContext } from 'react';

export type ProgramFileChooser = () => Promise<string | null>;

export const ProgramFileChooserContext = createContext<ProgramFileChooser | null>(null);
