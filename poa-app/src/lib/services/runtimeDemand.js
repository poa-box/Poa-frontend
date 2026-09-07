/** Anonymous reads never needed signing services; restore/connect starts them. */
export function shouldLoadServiceRuntime(subscribers, auth, explicitRequest = false) {
  return subscribers > 0 && Boolean(auth.isAuthenticated || auth.passkeyConnecting || explicitRequest);
}
