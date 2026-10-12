// Bir imtihonga bir necha urinish bo'lsa, hammasi saqlanadi, lekin natija sifatida oxirgi topshirilgani olinadi.

interface AttemptLike {
  examId: { toString(): string };
  studentId: { toString(): string };
  attemptNumber?: number;
  status?: string;
}

const attemptKey = (s: AttemptLike) => `${s.examId.toString()}:${s.studentId.toString()}`;

/** Har bir (imtihon, o'quvchi) uchun oxirgi topshirilgan urinish. Hali yechilayotgan urinish hisobga olinmaydi */
export function latestAttempts<T extends AttemptLike>(submissions: T[]): T[] {
  const latest = new Map<string, T>();
  for (const s of submissions) {
    if (s.status === "in_progress") continue;
    const current = latest.get(attemptKey(s));
    if (!current || (s.attemptNumber ?? 1) > (current.attemptNumber ?? 1)) latest.set(attemptKey(s), s);
  }
  return [...latest.values()];
}
