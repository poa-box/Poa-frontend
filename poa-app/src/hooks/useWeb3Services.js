/** Lightweight facade for the shared, asynchronously loaded service runtime. */
import { useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/authState';
import { usePOContext } from '@/context/POContext';
import { useWeb3ServicesContext } from '@/context/Web3ServicesContext';
import { useTransactionWithNotification } from '@/hooks/useTransactionWithNotification';
import { getInfrastructureAddress } from '@/config/contracts';
import { NETWORKS } from '@/config/networks';
import { ReadyState, getNotReadyMessage as buildNotReadyMessage } from '@/util/readiness';
import { VotingType } from '@/lib/services/votingType';
import { serviceReadyState } from '@/lib/services/runtimeReadiness';

export { useTransactionWithNotification } from '@/hooks/useTransactionWithNotification';

const emptyServices = {
  factory: null, txManager: null, signer: null,
  user: null, organization: null, voting: null, task: null, education: null,
  eligibility: null, membershipAuthority: null, roleCreation: null,
  zkEmailInvites: null, tokenRequest: null, treasury: null,
};

export function useWeb3Services(options = {}) {
  const { services, requestRuntime, retryRuntime, runtimeError } = useWeb3ServicesContext();
  const { isAuthenticated, isAuthHydrated, passkeyConnecting } = useAuth();
  const po = usePOContext();
  useEffect(() => requestRuntime(), [requestRuntime]);
  // The network option historically had no routing effect. Organization context
  // remains authoritative; preserve this API without introducing a chain switch.
  const { ipfsService, network } = options;
  const selectedServices = useMemo(() => services?.getServicesForOptions({ ipfsService, network }), [services, ipfsService, network]);
  const readyState = serviceReadyState(services, { isAuthenticated, isAuthHydrated, passkeyConnecting });
  const chainName = Object.values(NETWORKS).find((item) => item.chainId === po?.orgChainId)?.name;
  const getNotReadyMessage = useCallback((state = readyState) => (
    runtimeError ? 'Account actions could not finish loading. Please try again.' : buildNotReadyMessage(state, { chainName })
  ), [readyState, chainName, runtimeError]);
  const getContractAddress = useCallback((contractName) => getInfrastructureAddress(contractName), []);

  return useMemo(() => ({
    ...emptyServices,
    ...services,
    ...selectedServices,
    isReady: readyState === ReadyState.READY,
    readyState,
    getNotReadyMessage,
    getContractAddress,
    VotingType,
    runtimeError,
    retryRuntime,
  }), [services, selectedServices, readyState, getNotReadyMessage, getContractAddress, runtimeError, retryRuntime]);
}

export function useWeb3(options = {}) {
  const services = useWeb3Services(options);
  const txNotification = useTransactionWithNotification();
  return useMemo(() => ({ ...services, ...txNotification }), [services, txNotification]);
}

export default useWeb3Services;
