import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, VStack, HStack, Text, Button, Select, Input,
  InputGroup, InputRightElement, Box, Divider, Alert, AlertIcon,
} from '@chakra-ui/react';
import PulseLoader from "@/components/shared/PulseLoader";
import { FiCheck } from 'react-icons/fi';
import { BigNumber } from '@ethersproject/bignumber';
import { parseUnits } from '@ethersproject/units';
import { useWeb3 } from '@/hooks/useWeb3Services';

import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';
import { useAuth } from '@/context/authState';
import { usePOContext } from '@/context/POContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { getBountyTokenOptions } from '@/util/tokens';
import { formatTokenAmount } from '@/util/formatToken';
import { createPublicClientForChain } from '@/services/web3/utils/publicChainClient';
import { buildDistributionClaimsDocument, distributionClaimsDiscoveryMarker } from '@poa-box/core/metadata/distribution';
import { encodeIntent } from '@poa-box/core/tx/intent';
import { PaymentManagerAbi } from '@poa-box/core/abis/PaymentManager';
import { parseDecimalAmountToRaw } from '@poa-box/core/amounts';
import { getNetworkByChainId } from '@/config/networks';
import { useOrgPotBalances } from '@/hooks/useOrgPotBalances';
import { paymentManagerAvailability } from '@/lib/voting/treasuryBatches';
import { buildDistributionTree, prepareDistributionSnapshot } from '@/util/merkleDistribution';
import { useQuery, gql } from '@apollo/client';
import { getClient } from '@/util/apolloClient';

const FETCH_PT_HOLDERS = gql`
  query FetchPTHolders($orgId: Bytes!) {
    organization(id: $orgId) {
      id
      participationToken {
        id
        totalSupply
      }
      users(first: 1000, where: { membershipStatus: Active }) {
        address
        participationTokenBalance
        account {
          username
        }
      }
    }
  }
`;

const glassLayerStyle = {
  position: 'absolute', height: '100%', width: '100%',
  zIndex: -1, borderRadius: 'inherit', backgroundColor: 'rgba(0, 0, 0, .85)',
};

const CreateDistributionModal = ({
  isOpen, onClose, paymentManagerAddress, orgChainId,
  votingContractAddress,
}) => {
  const { voting, executeWithNotification, isReady } = useWeb3();

  const { accountAddress, isAuthHydrated, sessionGeneration, isSessionCurrent } = useAuth();
  const { orgId, subgraphUrl, participationTokenAddress, tokenLabel = DEFAULT_TOKEN_LABEL } = usePOContext();
  const { addToIpfs } = useIPFScontext();

  const [selectedToken, setSelectedToken] = useState(null);
  const [amount, setAmount] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('1440');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState('form'); // form | building | submitting | success
  const [preparationError, setPreparationError] = useState(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const identityKey = [orgId, subgraphUrl, orgChainId, participationTokenAddress, paymentManagerAddress, votingContractAddress, accountAddress, isAuthHydrated, sessionGeneration, isOpen].join(':');
  const scopeKey = [identityKey,
    selectedToken?.address, amount, durationMinutes].join(':');
  const scopeEpoch = useRef({ key: scopeKey, generation: 0 });
  if (scopeEpoch.current.key !== scopeKey) {
    scopeEpoch.current = { key: scopeKey, generation: scopeEpoch.current.generation + 1 };
  }
  const generation = scopeEpoch.current.generation;
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const pots = useOrgPotBalances({ token: selectedToken?.address || '', decimals: selectedToken?.decimals || 18, enabled: isOpen && !!selectedToken });
  const availability = paymentManagerAvailability({ evidence: pots.planningEvidence });
  const tokens = useMemo(() => getBountyTokenOptions(orgChainId), [orgChainId]);

  // Fetch PT holders from subgraph.
  // Per-chain client prevents cache poisoning: each endpoint has its own InMemoryCache.
  const orgClient = useMemo(() => getClient(subgraphUrl), [subgraphUrl]);
  const { data: holderData } = useQuery(FETCH_PT_HOLDERS, {
    variables: { orgId },
    skip: !orgId || !isOpen,
    client: orgClient,
  });

  const holders = useMemo(() => {
    if (holderData?.organization?.id?.toLowerCase() !== orgId?.toLowerCase() || !holderData?.organization?.users) return [];
    return holderData.organization.users
      .filter(u => u.participationTokenBalance && u.participationTokenBalance !== '0')
      .map(u => ({
        address: u.address,
        balance: u.participationTokenBalance,
        username: u.account?.username || null,
      }));
  }, [holderData, orgId]);

  // Reset on close
  const resetForm = useCallback(() => {
    setSelectedToken(null);
    setAmount('');
    setDurationMinutes('1440');
    setIsLoading(false);
    setStep('form');
    setPreparationError(null);
  }, []);

  useEffect(() => {
    resetForm();
  }, [identityKey, resetForm]);

  // The planning reader already observes this balance at the same block as
  // commitments. A second latest read could disagree and used to show false zero.
  const formattedBalance = pots.paymentManager == null ? 'Unavailable'
    : formatTokenAmount(pots.paymentManager, selectedToken?.decimals ?? 18, 4);

  const isAmountValid = () => {
    if (!amount || !selectedToken || Number(amount) <= 0) return false;
    try {
      const wei = parseDecimalAmountToRaw(amount, selectedToken.decimals);
      return BigNumber.from(wei).gt(0) &&
        availability.status === 'ready' && BigNumber.from(wei).lte(BigNumber.from(availability.spendable));
    } catch { return false; }
  };

  const handleSubmit = async () => {
    if (scopeRef.current !== scopeKey || scopeEpoch.current.generation !== generation || busy.current || !mounted.current || !isOpen || !isAmountValid() || !voting || !isReady || !accountAddress || isAuthHydrated === false || isSessionCurrent?.() === false || !votingContractAddress) return;

    busy.current = true;
    setIsLoading(true);
    setStep('building');
    setPreparationError(null);
    const current = () => mounted.current && scopeRef.current === scopeKey && scopeEpoch.current.generation === generation && isSessionCurrent?.() !== false;

    try {
      const weiAmount = parseDecimalAmountToRaw(amount, selectedToken.decimals);
      const refreshed = await pots.refetch();
      if (!current()) return;
      const freshAvailability = paymentManagerAvailability({ evidence: refreshed?.planningEvidence });
      if (freshAvailability.status !== 'ready' || BigInt(weiAmount) > BigInt(freshAvailability.spendable)) {
        throw new Error('Treasury details changed');
      }
      const client = createPublicClientForChain(orgChainId);
      const snapshot = await prepareDistributionSnapshot({ apollo: orgClient, client, chainId: orgChainId, orgId,
        holderContract: participationTokenAddress, paymentManager: paymentManagerAddress, endpoint: subgraphUrl,
        rpcEndpoint: getNetworkByChainId(orgChainId).rpcUrl });
      if (!current()) return;

      const treeResult = buildDistributionTree(snapshot.holders, weiAmount, snapshot.evidence);
      const checkpointBlock = snapshot.evidence.checkpoint.number;

      // 3. Upload merkle tree to IPFS
      const treeIpfsData = buildDistributionClaimsDocument({
        token: selectedToken.address,
        tokenSymbol: selectedToken.symbol,
        totalAmount: weiAmount,
        checkpointBlock,
        merkleRoot: treeResult.root,
        claims: treeResult.claims,
        createdAt: Date.now(),
      });
      const ipfsResult = await addToIpfs(JSON.stringify(treeIpfsData));
      const treeCid = ipfsResult.path;
      if (!current()) return;

      const callData = encodeIntent({ to: paymentManagerAddress, abi: PaymentManagerAbi, method: 'createDistribution',
        args: [selectedToken.address, weiAmount, treeResult.root, checkpointBlock], meta: { domain: 'treasury', action: 'createDistribution' } }).data;
      const marker = distributionClaimsDiscoveryMarker({ chainId: orgChainId, orgId, paymentManager: paymentManagerAddress,
        cid: treeCid, merkleRoot: treeResult.root, token: selectedToken.address, totalAmount: weiAmount, checkpointBlock });

      // 5. Build proposal batches: [yes: execute, no: do nothing]
      const batches = [
        [{ target: paymentManagerAddress, value: '0', data: callData }],
        [],
      ];

      // 6. Submit governance proposal
      setStep('submitting');
      const proposalData = {
        name: `Distribute ${amount} ${selectedToken.symbol}`,
        description: `Proportional distribution of ${amount} ${selectedToken.symbol} to ${treeResult.holderCount} ${tokenLabel} holders based on their balances. ${marker}`,
        durationMinutes: parseInt(durationMinutes) || 1440,
        numOptions: 2,
        optionNames: ['Approve Distribution', 'Reject'],
        batches,
        hatIds: [],
      };

      const result = await executeWithNotification(
        () => {
          if (!current()) throw new Error('Your account or organization changed. Try again.');
          return voting.createHybridProposal(votingContractAddress, proposalData);
        },
        {
          pendingMessage: 'Creating distribution proposal...',
          successMessage: 'Distribution proposal created! Members can now vote.',
        }
      );

      if (!current()) return;
      if (result.success) {
        setStep('success');
        setTimeout(() => { if (current()) onClose(); }, 2000);
      } else {
        setStep('form');
      }
    } catch {
      if (current()) {
        setPreparationError('Payout details could not be prepared. Refresh the treasury details and try again.');
        setStep('form');
      }
    } finally {
      busy.current = false;
      if (current()) setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg" closeOnOverlayClick={!isLoading}>
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent bg="transparent" boxShadow="xl" borderRadius="2xl" position="relative" color="whitesmoke">
        <div style={glassLayerStyle} />
        <ModalHeader borderBottom="1px solid" borderColor="whiteAlpha.100">
          Create Distribution Proposal
        </ModalHeader>
        <ModalCloseButton isDisabled={isLoading} />

        <ModalBody py={6}>
          {step === 'success' ? (
            <VStack spacing={4} py={8}>
              <Box w="64px" h="64px" borderRadius="full" bg="green.500" display="flex" alignItems="center" justifyContent="center">
                <FiCheck size={32} color="white" />
              </Box>
              <Text fontSize="xl" fontWeight="bold">Proposal Created!</Text>
              <Text color="gray.400" textAlign="center">
                Members can now vote on distributing {amount} {selectedToken?.symbol} to members.
              </Text>
            </VStack>
          ) : step === 'building' || step === 'submitting' ? (
            <VStack spacing={4} py={8}>
              <PulseLoader size="xl" color="purple.400" />
              <Text fontSize="lg" fontWeight="bold">
                {step === 'building' ? 'Preparing member payouts...' : 'Creating proposal...'}
              </Text>
              <Text color="gray.400" textAlign="center" fontSize="sm">
                {step === 'building'
                  ? `Computing proportional shares for ${holders.length} holders`
                  : 'Please confirm the transaction in your wallet.'}
              </Text>
            </VStack>
          ) : (
            <VStack spacing={5}>
              <Alert status="info" borderRadius="md" bg="whiteAlpha.100" color="gray.300">
                <AlertIcon color="purple.300" />
                <Text fontSize="sm">
                  This creates a governance proposal. Members vote to approve the distribution.
                </Text>
              </Alert>
              {(preparationError || pots.error || (selectedToken && !pots.loading && availability.status !== 'ready')) && <Alert status="warning" borderRadius="md">
                <AlertIcon />
                <Text fontSize="sm">{preparationError || 'Treasury details are unavailable. Refresh before creating a proposal.'}</Text>
                <Button size="xs" onClick={() => { setPreparationError(null); void pots.refetch(); }} isDisabled={pots.loading}>Refresh treasury details</Button>
              </Alert>}

              {/* Token selector */}
              <Box w="100%">
                <Text mb={2} fontSize="sm" fontWeight="medium" color="gray.300">Asset</Text>
                <Select
                  placeholder="Select asset"
                  value={selectedToken?.address || ''}
                  onChange={(e) => {
                    const token = tokens.find(t => t.address === e.target.value) || null;
                    setSelectedToken(token);
                    setAmount('');
                  }}
                  bg="rgba(0,0,0,0.4)" border="1px solid" borderColor="whiteAlpha.200"
                  _hover={{ borderColor: 'purple.400' }}
                  _focus={{ borderColor: 'purple.400', boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)' }}
                >
                  {tokens.map(t => (
                    <option key={t.address} value={t.address} style={{ background: '#1a1a2e' }}>
                      {t.symbol} · {t.name}
                    </option>
                  ))}
                </Select>
              </Box>

              {/* Amount */}
              <Box w="100%">
                <HStack justify="space-between" mb={2}>
                  <Text fontSize="sm" fontWeight="medium" color="gray.300">Amount</Text>
                  {selectedToken && (
                    <Text fontSize="xs" color="gray.500">
                      Treasury: {formattedBalance} {selectedToken.symbol}
                    </Text>
                  )}
                </HStack>
                <InputGroup>
                  <Input
                    type="number" placeholder="0.00" value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    isDisabled={!selectedToken}
                    bg="rgba(0,0,0,0.4)" border="1px solid" borderColor="whiteAlpha.200"
                    _hover={{ borderColor: 'purple.400' }}
                    _focus={{ borderColor: 'purple.400', boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)' }}
                    step="any"
                  />
                  {selectedToken && (
                    <InputRightElement pr={3} pointerEvents="none">
                      <Text fontSize="sm" color="gray.400" fontWeight="medium">{selectedToken.symbol}</Text>
                    </InputRightElement>
                  )}
                </InputGroup>
                {amount && selectedToken && !isAmountValid() && (
                  <Text fontSize="xs" color="red.300" mt={1}>
                    {Number(amount) <= 0 ? 'Must be greater than 0' : availability.status !== 'ready'
                      ? 'Refresh the treasury details before proposing a payout.' : 'Exceeds available treasury balance'}
                  </Text>
                )}
              </Box>

              {/* Voting duration */}
              <Box w="100%">
                <Text mb={2} fontSize="sm" fontWeight="medium" color="gray.300">Voting Duration</Text>
                <Select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  bg="rgba(0,0,0,0.4)" border="1px solid" borderColor="whiteAlpha.200"
                  _hover={{ borderColor: 'purple.400' }}
                  _focus={{ borderColor: 'purple.400', boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)' }}
                >
                  <option value="60" style={{ background: '#1a1a2e' }}>1 hour</option>
                  <option value="720" style={{ background: '#1a1a2e' }}>12 hours</option>
                  <option value="1440" style={{ background: '#1a1a2e' }}>24 hours</option>
                  <option value="4320" style={{ background: '#1a1a2e' }}>3 days</option>
                  <option value="10080" style={{ background: '#1a1a2e' }}>7 days</option>
                </Select>
              </Box>

              <Divider borderColor="whiteAlpha.100" />

              {/* Holder preview */}
              <Box w="100%" bg="rgba(0,0,0,0.3)" borderRadius="md" p={3}>
                <Text fontSize="sm" color="gray.300" fontWeight="medium" mb={1}>Distribution Preview</Text>
                <Text fontSize="xs" color="gray.400">
                  {holders.length > 0
                    ? `${holders.length} ${tokenLabel} holders in the preview. Eligible members and balances are checked when you create the proposal.`
                    : 'Eligible members and balances will be checked when you create the proposal.'}
                </Text>
                {holders.length > 0 && amount && Number(amount) > 0 && selectedToken && (
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    Top holder gets ~{(() => {
                      try {
                        const maxBal = holders.reduce((max, h) =>
                          BigNumber.from(h.balance).gt(BigNumber.from(max.balance)) ? h : max, holders[0]);
                        const totalSupply = holders.reduce((s, h) => s.add(BigNumber.from(h.balance)), BigNumber.from(0));
                        const share = BigNumber.from(maxBal.balance).mul(parseUnits(amount, selectedToken.decimals)).div(totalSupply);
                        return formatTokenAmount(share.toString(), selectedToken.decimals, 4);
                      } catch { return '?'; }
                    })()} {selectedToken.symbol}
                    {holders[0]?.username ? ` (${holders.reduce((max, h) => BigNumber.from(h.balance).gt(BigNumber.from(max.balance)) ? h : max, holders[0]).username})` : ''}
                  </Text>
                )}
              </Box>
            </VStack>
          )}
        </ModalBody>

        {step === 'form' && (
          <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.100" gap={3}>
            <Button variant="ghost" onClick={onClose} isDisabled={isLoading}>Cancel</Button>
            <Button
              colorScheme="purple"
              onClick={handleSubmit}
              isDisabled={!isAmountValid() || isLoading || !isReady || !accountAddress || isAuthHydrated === false || !votingContractAddress}
              isLoading={isLoading}
            >
              Create Proposal
            </Button>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
};

export default CreateDistributionModal;
