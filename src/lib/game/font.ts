import { Nunito } from "next/font/google";
import { theme } from "./theme";

// Game font: self-hosted by next/font (no request to Google from the browser), loaded only on game screens.
export const gameFont = Nunito({ subsets: ["latin"], weight: ["700", "800", "900"], display: "swap", variable: "--font-game" });

/** Font-family string for canvas text (next/font hashes the family name, so read it from the font object) */
export const GAME_FONT = `${gameFont.style.fontFamily}, ${theme.font}`;
