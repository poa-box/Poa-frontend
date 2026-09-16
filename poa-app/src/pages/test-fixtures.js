/**
 * E2E test-fixtures debug page (E2E mode only).
 *
 * Shows the agent's identity (burner EOA, virtual passkey smart account)
 * and pre-built vouch URLs for the configured org. The agent reads this
 * page to discover its addresses without needing to derive them.
 *
 * In production builds E2E_ENABLED is inlined to false, so webpack drops the
 * dynamic implementation and static export emits no page.
 */

import dynamic from 'next/dynamic';

const EmptyTestFixturesPage = () => null;
const TestFixturesPage = process.env.NEXT_PUBLIC_E2E_MODE === 'true'
  ? dynamic(() => import('@/services/e2e/TestFixturesPage'))
  : EmptyTestFixturesPage;

export default TestFixturesPage;

export function getStaticProps() {
  return process.env.NEXT_PUBLIC_E2E_MODE === 'true'
    ? { props: {} }
    : { notFound: true };
}
