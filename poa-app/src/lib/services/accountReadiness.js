// Intent may be evaluated for a confirmed visitor, but never while identity is
// restoring or an authenticated member's permission data is still pending.
export function shouldWaitForAccount({ isAuthHydrated, isAuthenticated, userDataLoading }) {
  return isAuthHydrated === false || (!!isAuthenticated && !!userDataLoading);
}
