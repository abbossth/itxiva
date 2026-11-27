import { Bungee, Caveat, Comfortaa, Lobster, Pacifico, Press_Start_2P, Righteous } from "next/font/google";

// Premium name fonts (self-hosted by next/font; a font file downloads only when a name uses it)
const pacifico = Pacifico({ subsets: ["latin"], weight: "400", display: "swap" });
const lobster = Lobster({ subsets: ["latin"], weight: "400", display: "swap" });
const pixel = Press_Start_2P({ subsets: ["latin"], weight: "400", display: "swap" });
const comfortaa = Comfortaa({ subsets: ["latin"], weight: ["700"], display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: ["700"], display: "swap" });
const righteous = Righteous({ subsets: ["latin"], weight: "400", display: "swap" });
const bungee = Bungee({ subsets: ["latin"], weight: "400", display: "swap" });

export const NAME_FONT_CLASS: Record<string, string> = {
  classic: "",
  pacifico: pacifico.className,
  lobster: lobster.className,
  pixel: `${pixel.className} text-[0.8em] leading-relaxed`,
  comfortaa: comfortaa.className,
  caveat: `${caveat.className} text-[1.2em]`,
  righteous: righteous.className,
  bungee: bungee.className,
};
