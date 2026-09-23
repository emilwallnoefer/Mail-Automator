/**
 * `navigator.onLine` as an external store, for `useSyncExternalStore`.
 *
 * `onLine === false` is reliable — the browser has no network at all. `true`
 * only means "some network", so callers treat it as a hint and still expect a
 * fetch to fail. The server snapshot is `true`: a page being rendered on the
 * server is, by definition, being served.
 */
export function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function readOnline(): boolean {
  return navigator.onLine !== false;
}

export function readOnlineOnServer(): boolean {
  return true;
}
