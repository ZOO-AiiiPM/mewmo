export function shouldBlockStopFollowupSubmit(
  guardUntil: number,
  now: number,
  event: { detail: number },
): boolean {
  return event.detail > 0 && now < guardUntil;
}
