import { parseDecimalAmountToRaw, requireRawUint } from '@poa-box/core/amounts';
import { formatTokenAmount } from '@/util/formatToken';

export function moduleRewardRaw(payout) {
  if (typeof payout === 'number' && (!Number.isFinite(payout) || Math.abs(payout) > Number.MAX_SAFE_INTEGER)) {
    throw new Error('Enter the reward as an exact decimal amount.');
  }
  let raw;
  try { raw = parseDecimalAmountToRaw(String(payout), 18); }
  catch { throw new Error('Enter a positive reward with no more than 18 decimal places.'); }
  if (raw === '0') throw new Error('Enter a positive reward.');
  return raw;
}

export function hasValidModuleReward(payout) {
  try { moduleRewardRaw(payout); return true; } catch { return false; }
}

/** Prefer exact raw rewards supplied by the library owner; old presentation rows remain compatible. */
export function moduleRewardLabel(module) {
  if (module.payoutRaw == null) return module.payout ?? '—';
  let raw;
  try { raw = requireRawUint(module.payoutRaw); } catch { return '—'; }
  return formatTokenAmount(raw, 18, 18).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** The input remains decimal text until the service's canonical builder scales it once. */
export function prepareModuleForm({ title, description, link, question, answers, correctAnswerIndex, payout }) {
  moduleRewardRaw(payout);
  return { name: title.trim(), description: description.trim(), link: link.trim(), quiz: [question.trim()],
    answers: [answers.map(answer => answer.trim())], correctAnswers: [correctAnswerIndex], payout };
}
