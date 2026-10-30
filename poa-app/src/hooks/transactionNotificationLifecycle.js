import { serviceScope } from '@/lib/services/runtimeScope';
import { waitForSubgraphBlock } from '@/util/waitForSubgraph';

const pageIdentity = po => JSON.stringify([po?.orgId || null, po?.orgChainId || null, po?.subgraphUrl || null]);
export const notificationIdentity = ({ auth, po }) => JSON.stringify([
  serviceScope({ ...po, ...auth }), auth?.isAuthHydrated !== false, auth?.sessionGeneration ?? null,
]);

function stale() {
  return Object.assign(new Error('Your account or organization changed. Please try again.'), { category: 'stale_scope', userMessage: 'Your account or organization changed. Please try again.' });
}

/** Unresolved identity may settle before invocation; an already resolved capture cannot change. */
export function captureNotificationScope(captured, readCurrent) {
  const current = readCurrent();
  if (!current || pageIdentity(captured.po) !== pageIdentity(current.po)
    || (captured.auth?.isAuthHydrated !== false && notificationIdentity(captured) !== notificationIdentity(current))) throw stale();
  if (current.auth?.isAuthHydrated === false) {
    throw Object.assign(new Error('Your account is still loading. Please try again.'), { userMessage: 'Your account is still loading. Please try again.' });
  }
  const identity = notificationIdentity(current);
  const guard = () => {
    const next = readCurrent();
    if (!next || notificationIdentity(next) !== identity || current.auth?.isSessionCurrent?.() === false) throw stale();
  };
  guard();
  return { guard, isCurrent: () => { try { guard(); return true; } catch { return false; } }, snapshot: current };
}

/** Presentation boundary for pre-manager core validation. Parsed contract reasons take priority. */
export function transactionMemberMessage(error, fallback) {
  if (error?.userMessage) return error.userMessage;
  if (error?.result?.error?.userMessage) return error.result.error.userMessage;
  if (error?.category === 'submission_unknown' || error?.nativeSubmission
    || (error?.name === 'SponsoredSubmissionError' && error.submission?.phase !== 'pre-submit')) {
    return 'We couldn’t confirm this transaction yet. Check its status before trying again.';
  }
  const text = error?.message || '';
  if (/--correct-answer|--answer\b/.test(text)) return 'Choose a valid answer for each question.';
  if (/Quiz has .*questions.*answer sets/.test(text)) return 'Give every question a matching set of answers.';
  if (/payout.*non-negative/i.test(text)) return 'Enter a reward amount of zero or more.';
  if (/--payout.*positive|payout.*positive/i.test(text)) return 'Enter a reward amount greater than zero.';
  if (/Invalid task payout/i.test(text)) return 'Enter a reward amount within the allowed range.';
  if (/Bounty token and positive payout must be set together/i.test(text)) return 'Choose a reward type and amount together.';
  if (/username.*(?:characters|letters|underscores)/i.test(text)) return text;
  if (/Bio too long/i.test(text)) return 'Keep your bio within 280 characters.';
  if (/weights.*(?:sum|total).*100/i.test(text)) return 'Voting weights must add up to 100.';
  if (/precision|decimal places|raw (?:amount|unsigned|uint)|uint(?:8|32|96|128|256)|amount.*(?:integer|overflow|range|decimals)|Invalid decimal amount/i.test(text)) {
    return 'Enter a valid amount with no more decimal places than this reward supports.';
  }
  if (/NetworkError|SubgraphError/.test(error?.name || '')) return 'This network is unavailable. Please try again in a moment.';
  if (error?.name === 'IpfsError' || /(?:CIDv[01]|bytes32|IPFS|metadata.*(?:pointer|hash|indexed))/i.test(text)) {
    return fallback || 'We couldn’t prepare the saved details for this action. Please try again.';
  }
  if (/not (?:supported|available|deployed)|unsupported|feature.*unavailable/i.test(text)) {
    return fallback || 'This action is unavailable for this organization. Please check its settings or try again later.';
  }
  if (/Cannot (?:read|convert)|is not a function|undefined to a BigInt/i.test(text)) {
    return fallback || 'Account tools could not prepare this action. Please try again.';
  }
  if (/CliError|PreconditionError/.test(error?.name || '') || /--[a-z]|\b(?:ABI|calldata|initCode|UserOp|UserOperation|RPC|EntryPoint|Paymaster|TaskManager|EducationHub|UniversalAccountRegistry|HybridVoting|DirectDemocracy|QuickJoin|ZkEmailInvites|subgraph|ctx\.provider)\b|Registry address|Request Arguments:|https?:\/\//i.test(text)) {
    return fallback || 'Please check the details for this action and try again.';
  }
  return fallback || text || 'An unexpected error occurred';
}

/** Explicit account writes carry their actual source, never wallet/org/default inference. */
export function notificationWriteSource(source, snapshot) {
  if (!source || typeof source.endpoint !== 'string' || !source.endpoint.trim()
    || !Number.isSafeInteger(source.chainId) || source.chainId <= 0
    || (source.account && snapshot.auth?.accountAddress && source.account.toLowerCase() !== snapshot.auth.accountAddress.toLowerCase())) {
    throw new Error('The account update source is unavailable. Refresh this account to see the update.');
  }
  return { endpoint: source.endpoint, chainId: source.chainId };
}

/** Bounded indexer wait stays asynchronous to preserve host optimistic updates. */
export async function refreshAfterIndexing({ endpoint, blockNumber, isCurrent, emit, event, data }) {
  if (!isCurrent()) return false;
  try { await waitForSubgraphBlock(endpoint, blockNumber); } catch { /* Existing bounded wait is best effort. */ }
  if (!isCurrent()) return false;
  emit(event, data);
  return true;
}
