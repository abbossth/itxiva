import type { GameLook } from "@/lib/character/catalog";

/** Characters loaded during a zone round, kept for the results screen (no extra request). Key: game id → player id → look */
export const zoneLooks = new Map<string, Map<string, GameLook>>();
