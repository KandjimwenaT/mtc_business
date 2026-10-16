export const LIVE_RESOURCES = [
  "notifications",
  "tickets",
  "visits",
  "leads",
  "corporates",
  "dashboard",
  "vehicles",
] as const;

export type LiveResource = (typeof LIVE_RESOURCES)[number];

export type LiveDataPayload = {
  resources?: string[];
  notificationType?: string;
};

const EVENT_NAME = "mtc:live-data";

export function dispatchLiveData(payload: LiveDataPayload): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
}

export function subscribeLiveResources(
  resources: LiveResource[],
  onMatch: (payload: LiveDataPayload) => void
): () => void {
  const wanted = new Set(resources);
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<LiveDataPayload>).detail;
    const incoming = detail?.resources ?? [];
    if (!incoming.length) return;
    if (incoming.some((resource) => wanted.has(resource as LiveResource))) {
      onMatch(detail);
    }
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
