// All times are worked out on the server in IST (§8.1, §8.5).

const IST_OFFSET_MIN = 5 * 60 + 30;

export interface IstNow {
  date: string; // YYYY-MM-DD
  hour: number;
  minute: number;
}

export function istNow(now: Date = new Date()): IstNow {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    date: ist.toISOString().slice(0, 10),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
  };
}

/** Test override: test_today + optional test_time ("HH:MM"). */
export function resolveNow(testToday?: string, testTime?: string): IstNow {
  if (!testToday) return istNow();
  const [h, m] = (testTime ?? "12:00").split(":").map(Number);
  return { date: testToday, hour: h, minute: m || 0 };
}

/** Front desk hours are 10am–7pm (problem statement). */
export function isAfterHours(t: IstNow): boolean {
  return t.hour < 10 || t.hour >= 19;
}

/** Complaint callback window, 9am–9pm IST. TODO(Q10): confirm with Nikhil. */
export function inCallbackWindow(t: IstNow): boolean {
  return t.hour >= 9 && t.hour < 21;
}

export function greetingFor(t: IstNow): "morning" | "afternoon" | "evening" {
  if (t.hour < 12) return "morning";
  if (t.hour < 17) return "afternoon";
  return "evening";
}
