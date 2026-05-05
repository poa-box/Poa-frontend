import { gql } from '@apollo/client';

// ============================================
// PEER CASHOUT RELAY SUBGRAPH (Base mainnet)
// Indexes CashOutRelay@0xA65...EFE5 events on Base. Repo:
// subgraph-pop/.conductor/dhaka-v2/peer-cashoutrelay-base.
// Powers the "Pending Cashouts" section on /account.
// ============================================

export const PEER_CASHOUTRELAY_BASE_URL =
  process.env.NEXT_PUBLIC_PEER_CASHOUTRELAY_BASE_SUBGRAPH_URL ||
  'https://api.studio.thegraph.com/query/73367/peer-cashoutrelay-base/version/latest';

// All cashout requests for one wallet, split into:
//   - pendingCashouts: FAILED rows (USDC stuck in the relay; recover via
//                      CashOutRelay.recoverFailed(requestHash)).
//   - cashoutRequests(status:DEPOSITED): created on EscrowV2; the frontend then
//                      reads getDeposit(id) to filter to still-unfilled ones.
// Wallet ids are lowercase address bytes.
export const WALLET_CASHOUTS_QUERY = gql`
  query WalletCashouts($wallet: ID!) {
    wallet(id: $wallet) {
      id
      address
      pendingCount
      pendingCashouts {
        id
        requestHash
        amount
        paymentMethod
        createdAtTimestamp
        createdTxHash
        failureReason
      }
      cashoutRequests(
        where: { status: DEPOSITED }
        orderBy: createdAtTimestamp
        orderDirection: desc
        first: 50
      ) {
        id
        requestHash
        amount
        paymentMethod
        createdAtBlock
        createdAtTimestamp
        createdTxHash
      }
    }
  }
`;
