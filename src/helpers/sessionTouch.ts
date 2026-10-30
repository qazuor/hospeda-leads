export const SESSION_TOUCH_INTERVAL_MS = 5 * 60_000;

export function shouldTouchSession({
  lastAccessed,
  now,
}: {
  lastAccessed: Date | null;
  now: Date;
}): boolean {
  return lastAccessed === null || now.getTime() - lastAccessed.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}
