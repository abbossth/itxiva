// "prefers-reduced-motion" for render loops: cached and kept up to date (no matchMedia call per frame).

let mq: MediaQueryList | null = null;
let reduced = false;

export function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (!mq) {
    mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reduced = e.matches;
    };
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
  }
  return reduced;
}

/** Amplitude multiplier for decorative motion: 1 normally, small when the user asked for less motion */
export const motionScale = () => (reducedMotion() ? 0.3 : 1);
