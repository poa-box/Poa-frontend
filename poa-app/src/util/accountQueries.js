import { gql } from '@apollo/client';

// Shared with speculative account reads so restored sessions reuse the same cache.
export const ACCOUNT_QUERY = gql`
  query FetchAccount($id: Bytes!) {
    account(id: $id) {
      id
      username
      profileMetadataHash
      metadata {
        id
        bio
        avatar
        github
        twitter
        website
      }
    }
  }
`;
