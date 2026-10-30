/** A per-request service facade. It preserves the service/core builder and the actual
 * manager, while observing its unsigned journal before it can be cleared elsewhere. */
export async function submitTrackedRoleProposal(voting, tracker, submit) {
  if (!tracker) return submit(voting);
  if (typeof voting?.txManager?.execute !== 'function') {
    tracker.notSubmitted();
    throw new Error('Your account is still loading. Review this vote again.');
  }
  let entered = false;
  const manager = Object.create(voting.txManager);
  manager.execute = async (contract, method, args, options) => {
    // VotingService has finished the enclosing proposal metadata upload at this point.
    // Unknown/stale role evidence is a positive pre-transport refusal, never a failed vote.
    await tracker.revalidate?.();
    tracker.assertCurrent?.();
    tracker.bindIntent?.(contract, method, args, options);
    entered = true;
    try {
      const result = await voting.txManager.execute(contract, method, args, { ...options,
        onSubmitted: async submission => { tracker.captureSubmitted?.(submission); await options?.onSubmitted?.(submission); },
      });
      // Save before any page refresh, dynamic import or notification work can fail.
      tracker.complete?.(result);
      return result;
    } catch (error) {
      tracker.complete?.({ success: false, error });
      throw error;
    }
  };
  try { return await submit(voting.withTransactionManager(manager)); }
  catch (error) {
    if (!entered) tracker.notSubmitted();
    throw error;
  }
}
