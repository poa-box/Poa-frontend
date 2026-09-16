import React, { useEffect, useState } from 'react';
import { useWalletRuntimeControl } from '@/context/WalletContext';
import { createRuntimeLoader } from '@/lib/services/runtimeLoader';

// This import deliberately has no SSR preload: account code must never become
// a prerequisite for rendering the public organization or its query results.
const loadCore = createRuntimeLoader(() => import('@/components/providers/CoreProviders'));

class AccountErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** A sibling of the page. Loading, retrying, or failing cannot replace its tree. */
export default function AccountRuntimeHost() {
  const { attempt, reportRuntimeError } = useWalletRuntimeControl();
  const [Core, setCore] = useState(null);

  useEffect(() => {
    if (Core) return;
    let cancelled = false;
    // Next has loaded the page code before mounting it. Give its public UI
    // a browser turn before starting the independent account runtime.
    const timer = setTimeout(() => {
      loadCore().then((module) => {
        if (!cancelled) setCore(() => module.default);
      }).catch((error) => {
        if (!cancelled) reportRuntimeError(error);
      });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [Core, attempt, reportRuntimeError]);

  return Core ? (
    <AccountErrorBoundary key={attempt} onError={reportRuntimeError}>
      <Core />
    </AccountErrorBoundary>
  ) : null;
}
