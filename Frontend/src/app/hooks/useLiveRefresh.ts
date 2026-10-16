import { useEffect, useRef } from "react";
import { subscribeLiveResources, type LiveResource } from "../realtime/liveEvents";

/**
 * Silently re-run `onRefresh` when the server pushes a matching live-data event.
 * Debounced so a burst of notifications (ticket created for many users) only
 * triggers one refetch.
 */
export function useLiveRefresh(resources: LiveResource[], onRefresh: () => void): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const resourcesKey = [...resources].sort().join(",");

  useEffect(() => {
    if (!resourcesKey) return;
    const list = resourcesKey.split(",") as LiveResource[];
    let timer: number | undefined;
    const unsubscribe = subscribeLiveResources(list, () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        onRefreshRef.current();
      }, 400);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [resourcesKey]);
}
