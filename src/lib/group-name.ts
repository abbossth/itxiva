// Guruhning qisqa nomi: tablar va tor joylarda to'liq nom o'rniga ("XSH-25I0802" -> "8.2").

/** Nom oxiridagi 4 raqamdan (sinf + tartib) qisqa nom chiqaradi: "XSH-26I0810" -> "8.10". Mos kelmasa null */
export function deriveShortName(name: string): string | null {
  const m = name.trim().match(/(\d{2})(\d{2})$/);
  if (!m) return null;
  const grade = Number(m[1]);
  const index = Number(m[2]);
  if (grade < 1 || grade > 11 || index < 1) return null;
  return `${grade}.${index}`;
}

/** Mentor kiritgan qisqa nom; bo'lmasa nomdan chiqariladi; u ham bo'lmasa to'liq nom */
export function groupShortName(group: { name: string; shortName?: string | null }): string {
  return group.shortName?.trim() || deriveShortName(group.name) || group.name;
}
