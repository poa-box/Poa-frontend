import NextDocument, { Html, Head, Main, NextScript } from "next/document";
import { usesDeferredAccountBootstrap } from '@/lib/applicationRoutes.mjs';
import { getOrganizationSnapshot } from '@/util/orgSnapshotPlan';
import { organizationPrefetchScript } from '@/lib/graphql/organizationPrefetch';
import { getAllSubgraphUrls } from '@/config/networks';
import { HOST_DEFAULT_ORG, ORG_NAME_ALIASES } from '@/config/hostDefaultOrg';


export default function Document({ organizationPrefetch, nonce }) {
  return (
    <>
    <Html lang="en">
      <Head>
        {organizationPrefetch && <script nonce={nonce} data-poa-org-prefetch="true" dangerouslySetInnerHTML={{ __html: organizationPrefetch }} />}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/images/poa_logo.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7C3AED" />
        <meta name="application-name" content="Poa" />
        <meta name="apple-mobile-web-app-title" content="Poa" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
    </>
  );
}

// Only public data is prepared here. Next's document is server-only, so query
// composition adds no parser or account dependency to this early browser script.
Document.getInitialProps = async (ctx) => {
  const props = await NextDocument.getInitialProps(ctx);
  if (!usesDeferredAccountBootstrap(ctx.pathname)) return props;
  const { query, variables } = getOrganizationSnapshot({ releases: true, proposer: true, treasury: ctx.pathname === '/treasury' });
  return {
    ...props,
    organizationPrefetch: organizationPrefetchScript({
      query, variables, sources: getAllSubgraphUrls(), hosts: HOST_DEFAULT_ORG, aliases: ORG_NAME_ALIASES,
    }),
  };
};
