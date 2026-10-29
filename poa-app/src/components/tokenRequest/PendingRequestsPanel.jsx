import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Badge,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  useToast,
  Divider,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import PulseLoader from "@/components/shared/PulseLoader";
import { useQuery } from '@apollo/client';
import { FETCH_PENDING_TOKEN_REQUESTS } from '@/util/queries';
import { useWeb3 } from '@/hooks/useWeb3Services';
import { usePOContext } from '@/context/POContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';
import { formatTokenAmount } from '@/util/formatToken';
import { useSubgraphClient } from '@/util/apolloClient';
import { useAuth } from '@/context/authState';
import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';
import { isValidAddress } from '@poa-box/core/encoding';

const PendingRequestsPanel = () => {
  const toast = useToast();
  const { accountAddress, isAuthenticated, isAuthHydrated, isSessionCurrent } = useAuth();
  const { tokenRequest, executeWithNotification, isReady } = useWeb3();
  const { orgId, orgChainId, participationTokenAddress, subgraphUrl, tokenLabel = DEFAULT_TOKEN_LABEL } = usePOContext();
  const { fetchFromIpfs } = useIPFScontext();

  const [loadingRequestId, setLoadingRequestId] = useState(null);
  const [metadataCache, setMetadataCache] = useState({});

  const client = useSubgraphClient(subgraphUrl);
  const organizationReady = !!(orgId && orgChainId && isValidAddress(participationTokenAddress) && subgraphUrl);

  // Query pending requests
  const { data, loading, error, refetch } = useQuery(FETCH_PENDING_TOKEN_REQUESTS, {
    variables: { tokenAddress: participationTokenAddress },
    skip: !organizationReady,
    fetchPolicy: 'cache-first',
    client,
  });

  // Refetch immediately — executeWithNotification already waited for the
  // subgraph to index the transaction block before emitting these events.
  useRefreshSubscription(
    [
      RefreshEvent.TOKEN_REQUEST_CREATED,
      RefreshEvent.TOKEN_REQUEST_APPROVED,
      RefreshEvent.TOKEN_REQUEST_CANCELLED,
    ],
    () => refetch(),
    [refetch]
  );

  const pendingRequests = useMemo(() => data?.tokenRequests || [], [data]);
  const canReview = organizationReady && isAuthHydrated === true && isAuthenticated === true
    && isValidAddress(accountAddress) && isReady === true && !!tokenRequest && !loading && !error;
  // Retained row callbacks must not act under a different account or organization.
  const scope = useMemo(() => ({ orgId, orgChainId, participationTokenAddress, subgraphUrl,
    accountAddress, isAuthHydrated, isAuthenticated, isSessionCurrent, tokenRequest, isReady }),
  [orgId, orgChainId, participationTokenAddress, subgraphUrl,
    accountAddress, isAuthHydrated, isAuthenticated, isSessionCurrent, tokenRequest, isReady]);
  const actionState = useRef({ scope, mounted: true, inFlight: false });
  actionState.current.scope = scope;
  useEffect(() => {
    const state = actionState.current;
    state.mounted = true;
    return () => { state.mounted = false; };
  }, []);
  const isCurrent = () => actionState.current.mounted && actionState.current.scope === scope
    && (!isSessionCurrent || isSessionCurrent());
  const assertCurrent = () => {
    if (!isCurrent()) throw new Error('The organization or account changed. Please try again.');
  };
  const isOwnRequest = request => isValidAddress(accountAddress) && isValidAddress(request.requester)
    && request.requester.toLowerCase() === accountAddress.toLowerCase();
  const canActOnRequest = request => canReview && isCurrent() && !actionState.current.inFlight
    && isValidAddress(request.requester) && request.status === 'Pending';

  // Fetch IPFS metadata for requests — only as fallback when subgraph hasn't indexed
  useEffect(() => {
    const fetchMetadata = async () => {
      if (!fetchFromIpfs || !pendingRequests.length) return;

      for (const request of pendingRequests) {
        // Skip if subgraph already has metadata or if already cached
        if (request.metadata || metadataCache[request.ipfsHash]) continue;
        if (!request.ipfsHash) continue;

        try {
          const metadata = await fetchFromIpfs(request.ipfsHash);
          setMetadataCache(prev => ({
            ...prev,
            [request.ipfsHash]: metadata,
          }));
        } catch (err) {
          console.error('Error fetching IPFS metadata:', err);
        }
      }
    };

    fetchMetadata();
  }, [pendingRequests, fetchFromIpfs, metadataCache]);

  const handleApprove = async (request) => {
    if (!canActOnRequest(request) || isOwnRequest(request)) return;

    const { requestId } = request;
    actionState.current.inFlight = true;
    setLoadingRequestId(requestId);
    try {
      const result = await executeWithNotification(
        () => {
          assertCurrent();
          return tokenRequest.approveRequest(participationTokenAddress, requestId, { scopeGuard: assertCurrent });
        },
        {
          pendingMessage: `Approving ${tokenLabel} request...`,
          successMessage: `${tokenLabel} request approved!`,
          errorMessage: 'Failed to approve request',
          refreshEvent: RefreshEvent.TOKEN_REQUEST_APPROVED,
          refreshData: { requestId },
        }
      );

      if (!result.success) {
        throw new Error(result.error?.userMessage || 'Failed to approve request');
      }
    } catch (error) {
      if (!isCurrent()) return;
      console.error('Error approving request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve request',
        status: 'error',
        duration: 5000,
      });
    } finally {
      actionState.current.inFlight = false;
      if (actionState.current.mounted) setLoadingRequestId(null);
    }
  };

  const handleReject = async (request) => {
    if (!canActOnRequest(request)) return;

    const { requestId } = request;
    const ownRequest = isOwnRequest(request);
    actionState.current.inFlight = true;
    setLoadingRequestId(requestId);
    try {
      const result = await executeWithNotification(
        () => {
          assertCurrent();
          return tokenRequest.cancelRequest(participationTokenAddress, requestId, { scopeGuard: assertCurrent });
        },
        {
          pendingMessage: `${ownRequest ? 'Cancelling' : 'Rejecting'} ${tokenLabel} request...`,
          successMessage: `${tokenLabel} request ${ownRequest ? 'cancelled' : 'rejected'}`,
          errorMessage: ownRequest ? 'Failed to cancel request' : 'Failed to reject request',
          refreshEvent: RefreshEvent.TOKEN_REQUEST_CANCELLED,
          refreshData: { requestId },
        }
      );

      if (!result.success) {
        throw new Error(result.error?.userMessage || (ownRequest ? 'Failed to cancel request' : 'Failed to reject request'));
      }
    } catch (error) {
      if (!isCurrent()) return;
      console.error('Error rejecting request:', error);
      toast({
        title: 'Error',
        description: error.message || (ownRequest ? 'Failed to cancel request' : 'Failed to reject request'),
        status: 'error',
        duration: 5000,
      });
    } finally {
      actionState.current.inFlight = false;
      if (actionState.current.mounted) setLoadingRequestId(null);
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return 'Unknown';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    return new Date(parseInt(timestamp) * 1000).toLocaleDateString();
  };

  if (!organizationReady) {
    return <Text color="gray.500">Requests are unavailable until the organization is ready.</Text>;
  }

  if (loading && !data) {
    return (
      <Box p={4} textAlign="center">
        <PulseLoader size="md" />
        <Text mt={2} color="gray.500">Loading pending requests...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        Failed to load pending requests
      </Alert>
    );
  }

  if (pendingRequests.length === 0) {
    return (
      <Box p={4} textAlign="center" color="gray.500">
        <Text>No pending {tokenLabel} requests to review</Text>
      </Box>
    );
  }

  return (
    <Box>
      <HStack justify="space-between" mb={3}>
        <Text fontWeight="semibold">
          Pending {tokenLabel} Requests ({pendingRequests.length})
        </Text>
        <Badge colorScheme="orange">{pendingRequests.length} to review</Badge>
      </HStack>

      <Accordion allowMultiple>
        {pendingRequests.map((request) => {
          const metadata = request.metadata || metadataCache[request.ipfsHash];
          const ownRequest = isOwnRequest(request);
          const requesterKnown = isValidAddress(request.requester);
          const isLoading = loadingRequestId === request.requestId;

          return (
            <AccordionItem key={request.id} border="1px" borderColor="gray.200" borderRadius="md" mb={2}>
              <AccordionButton>
                <Box flex="1" textAlign="left">
                  <HStack spacing={3}>
                    <Text fontWeight="medium">
                      {formatTokenAmount(request.amount)} {tokenLabel}
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      from {formatAddress(request.requester)}
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color="gray.400">
                    {formatDate(request.createdAt)}
                  </Text>
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4}>
                <VStack align="stretch" spacing={3}>
                  <Box>
                    <Text fontSize="sm" fontWeight="medium" color="gray.600">
                      Reason:
                    </Text>
                    <Text fontSize="sm">
                      {metadata?.reason || 'Loading...'}
                    </Text>
                  </Box>

                  <Divider />

                  <HStack justify="flex-end" spacing={2}>
                    {!isAuthHydrated ? (
                      <Text fontSize="sm" color="gray.500">Checking your account before reviewing requests...</Text>
                    ) : !isAuthenticated || !isValidAddress(accountAddress) ? (
                      <Text fontSize="sm" color="gray.500">Sign in to review requests.</Text>
                    ) : !requesterKnown ? (
                      <Text fontSize="sm" color="gray.500">The member for this request is unavailable.</Text>
                    ) : ownRequest ? (
                      <>
                        <Text fontSize="sm" color="gray.500" fontStyle="italic">
                          You cannot approve your own request. Another approver can review it.
                        </Text>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(request)}
                          isLoading={isLoading}
                          isDisabled={loadingRequestId !== null || !canReview || request.status !== 'Pending'}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          colorScheme="red"
                          variant="outline"
                          onClick={() => handleReject(request)}
                          isLoading={isLoading}
                          isDisabled={loadingRequestId !== null || !canReview || request.status !== 'Pending'}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          colorScheme="green"
                          onClick={() => handleApprove(request)}
                          isLoading={isLoading}
                          isDisabled={loadingRequestId !== null || !canReview || request.status !== 'Pending'}
                        >
                          Approve
                        </Button>
                      </>
                    )}
                  </HStack>
                </VStack>
              </AccordionPanel>
            </AccordionItem>
          );
        })}
      </Accordion>
    </Box>
  );
};

export default PendingRequestsPanel;
