import {
  FETCH_ORG_FULL_DATA, FETCH_PROJECTS_DATA_NEW, FETCH_PROJECTS_DATA_WITH_RELEASES,
  FETCH_VOTING_DATA_NEW, FETCH_VOTING_DATA_WITH_PROPOSER, FETCH_TREASURY_DATA,
} from '@/util/queries';
import { createOrganizationSnapshot } from '@/lib/graphql/organizationSnapshot';

export const INITIAL_VOTING_VARIABLES = {
  first: 50,
  hybridBefore: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
  ddBefore: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
};
const plans = new Map();

export function getOrganizationSnapshot({ releases = false, proposer = false, treasury = false } = {}) {
  const key = `${releases}:${proposer}:${treasury}`;
  if (!plans.has(key)) plans.set(key, createOrganizationSnapshot([
    { query: FETCH_ORG_FULL_DATA },
    { query: releases ? FETCH_PROJECTS_DATA_WITH_RELEASES : FETCH_PROJECTS_DATA_NEW },
    { query: proposer ? FETCH_VOTING_DATA_WITH_PROPOSER : FETCH_VOTING_DATA_NEW, variables: INITIAL_VOTING_VARIABLES },
    ...(treasury ? [{ query: FETCH_TREASURY_DATA }] : []),
  ]));
  return plans.get(key);
}
