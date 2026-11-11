// O'yin turlari ro'yxati (brauzer va server uchun umumiy; mongoose'ga bog'liq emas)
export type LiveGameMode = "classic" | "survival" | "chest" | "team" | "arena" | "race" | "territory" | "rocket" | "bridge" | "gold";
export const LIVE_GAME_MODES: LiveGameMode[] = ["classic", "team", "survival", "chest", "arena", "race", "territory", "rocket", "bridge", "gold"];
