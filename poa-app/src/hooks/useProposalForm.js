/**
 * useProposalForm
 * Hook for managing proposal form state and submission
 */

import { useState, useCallback } from 'react';
import { useToast } from '@chakra-ui/react';
import { utils, constants as ethersConstants, providers as ethersProviders } from 'ethers';
import {
  SETTER_TEMPLATES,
  RAW_FUNCTIONS,
  CONTRACT_MAP,
  getTemplateById,
} from '@/config/setterDefinitions';
import { usePOContext } from '@/context/POContext';
import { getNetworkByChainId } from '../config/networks';
import { getInfrastructureAddress, CONTRACT_NAMES } from '@/config/contracts';
import { createHatsService } from '@/services/web3/domain/HatsService';
import {
  TITLE_PREFIX as ELECTION_TITLE_PREFIX,
  DESCRIPTION_PREFIX as ELECTION_DESCRIPTION_PREFIX,
} from '@/components/voting/ElectionConfigurator';

const defaultProposal = {
  name: "",
  description: "",
  execution: "",
  time: 0,
  options: ["", ""],
  type: "normal",
  transferAddress: "",
  transferAmount: "",
  // Election fields
  electionCandidates: [],           // Array of { name, address }
  electionRoleId: "",               // Hat ID for the role being elected
  electionCurrentHolders: [],       // Array of { name, address } - all holders of the elected hat
  electionSelectedIncumbents: [],   // Array of { name, address } - holders whose hat is at stake
  electionFallbackRoleId: "",       // Hat ID for fallback role given to losers (optional)
  electionFallbackHolders: [],      // Addresses already holding fallback hat (pre-computed)
  electionIncludeNoOneOption: false, // If true, append a "No One" option (empty batch) to the ballot
  // Voting restriction fields
  isRestricted: false,    // Whether to restrict who can vote
  restrictedHatIds: [],   // Hat IDs that can vote (if restricted)
  // Setter fields (for contract settings changes)
  setterMode: "template", // "template" or "advanced"
  setterTemplate: "",     // Template ID if using template mode
  setterContract: "",     // Contract key (e.g., "hybridVoting")
  setterFunction: "",     // Function name (e.g., "setConfig")
  setterValues: {},       // Template input values
  setterParams: [],       // Raw function parameters (for advanced mode)
  id: 0,
};

export function useProposalForm({ onSubmit }) {
  const toast = useToast();
  const { orgChainId } = usePOContext();
  const orgNetwork = getNetworkByChainId(orgChainId);
  const nativeCurrencySymbol = orgNetwork?.nativeCurrency?.symbol || 'ETH';
  const [proposal, setProposal] = useState(defaultProposal);
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setProposal(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleOptionChange = useCallback((index, value) => {
    setProposal(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => (i === index ? value : opt)),
    }));
  }, []);

  const addOption = useCallback(() => {
    setProposal(prev => ({ ...prev, options: [...prev.options, ""] }));
  }, []);

  const removeOption = useCallback((index) => {
    setProposal(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  }, []);

  const handleProposalTypeChange = useCallback((e) => {
    const newType = e.target.value;
    // Election + setter use hybrid voting, which doesn't support hat-restricted voting.
    // Clear restriction state on switch in so a stale toggle doesn't leak into submit.
    const isHybrid = newType === 'election' || newType === 'setter';
    setProposal(prev => {
      // When switching away from election, drop auto-generated title/description
      // (matches the sentinel-prefix convention in ElectionConfigurator). Preserve
      // anything the user typed themselves.
      const leavingElection = prev.type === 'election' && newType !== 'election';
      const clearedName = leavingElection && prev.name?.startsWith(ELECTION_TITLE_PREFIX) ? '' : prev.name;
      const clearedDescription = leavingElection && prev.description?.startsWith(ELECTION_DESCRIPTION_PREFIX) ? '' : prev.description;

      return {
        ...prev,
        type: newType,
        name: clearedName,
        description: clearedDescription,
        options: newType === 'normal' ? ["", ""] : [],
        ...(isHybrid ? {
          isRestricted: false,
          restrictedHatIds: [],
        } : {}),
        ...(newType !== 'election' ? {
          electionRoleId: '',
          electionCandidates: [],
          electionCurrentHolders: [],
          electionSelectedIncumbents: [],
          electionFallbackRoleId: '',
          electionFallbackHolders: [],
          electionIncludeNoOneOption: false,
        } : {}),
      };
    });
  }, []);

  const handleTransferAddressChange = useCallback((e) => {
    setProposal(prev => ({ ...prev, transferAddress: e.target.value }));
  }, []);

  const handleTransferAmountChange = useCallback((e) => {
    setProposal(prev => ({ ...prev, transferAmount: e.target.value }));
  }, []);

  const handleElectionRoleChange = useCallback((roleId) => {
    setProposal(prev => ({ ...prev, electionRoleId: roleId }));
  }, []);

  const handleCandidatesChange = useCallback((candidates) => {
    setProposal(prev => ({ ...prev, electionCandidates: candidates }));
  }, []);

  const addCandidate = useCallback((name, address) => {
    setProposal(prev => ({
      ...prev,
      electionCandidates: [...prev.electionCandidates, { name, address }]
    }));
  }, []);

  const removeCandidate = useCallback((index) => {
    setProposal(prev => ({
      ...prev,
      electionCandidates: prev.electionCandidates.filter((_, i) => i !== index)
    }));
  }, []);

  const handleRestrictedToggle = useCallback((isRestricted) => {
    setProposal(prev => ({
      ...prev,
      isRestricted,
      restrictedHatIds: isRestricted ? prev.restrictedHatIds : [],
    }));
  }, []);

  const handleRestrictedRolesChange = useCallback((hatIds) => {
    setProposal(prev => ({ ...prev, restrictedHatIds: hatIds }));
  }, []);

  const toggleRestrictedRole = useCallback((hatId) => {
    setProposal(prev => {
      const current = prev.restrictedHatIds || [];
      const isSelected = current.includes(hatId);
      return {
        ...prev,
        restrictedHatIds: isSelected
          ? current.filter(id => id !== hatId)
          : [...current, hatId],
      };
    });
  }, []);

  // Setter-related handlers
  const handleSetterChange = useCallback((updates) => {
    setProposal(prev => ({
      ...prev,
      ...updates,
    }));
  }, []);

  const resetForm = useCallback(() => {
    setProposal(defaultProposal);
  }, []);

  const validateTransferProposal = useCallback(() => {
    if (!proposal.transferAddress || !utils.isAddress(proposal.transferAddress)) {
      toast({
        title: "Invalid Address",
        description: "Please enter a valid recipient address.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    const amount = parseFloat(proposal.transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid transfer amount.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    return true;
  }, [proposal.transferAddress, proposal.transferAmount, toast]);

  const validateElectionProposal = useCallback(() => {
    if (!proposal.electionRoleId) {
      toast({
        title: "No Role Selected",
        description: "Please select a role for this election.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    const minCandidates = proposal.electionIncludeNoOneOption ? 1 : 2;
    if (proposal.electionCandidates.length < minCandidates) {
      toast({
        title: "Not Enough Candidates",
        description: proposal.electionIncludeNoOneOption
          ? "An election with the 'No One' option needs at least 1 candidate."
          : "An election needs at least 2 candidates.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    // Validate all candidate addresses
    for (const candidate of proposal.electionCandidates) {
      if (!candidate.address || !utils.isAddress(candidate.address)) {
        toast({
          title: "Invalid Candidate Address",
          description: `"${candidate.name || 'Unnamed'}" has an invalid address.`,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }
      if (candidate.address === ethersConstants.AddressZero) {
        toast({
          title: "Invalid Candidate Address",
          description: `"${candidate.name || 'Unnamed'}" uses the zero address. Use the "Allow voters to reject all candidates" option instead.`,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }
      if (!candidate.name || candidate.name.trim() === '') {
        toast({
          title: "Missing Candidate Name",
          description: "All candidates must have a name.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }
    }

    return true;
  }, [proposal.electionRoleId, proposal.electionCandidates, proposal.electionIncludeNoOneOption, toast]);

  const validateNormalProposal = useCallback(() => {
    const nonEmpty = (proposal.options || []).filter(opt => opt.trim() !== '');
    if (nonEmpty.length < 2) {
      toast({
        title: "Not Enough Options",
        description: "Please provide at least 2 voting options.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }
    return true;
  }, [proposal.options, toast]);

  const validateSetterProposal = useCallback(() => {
    if (proposal.setterMode === 'template') {
      if (!proposal.setterTemplate) {
        toast({
          title: "No Action Selected",
          description: "Please select an action from the templates.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }

      const template = getTemplateById(proposal.setterTemplate);
      if (!template) {
        toast({
          title: "Invalid Template",
          description: "The selected template is not valid.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }

      // Validate required inputs have values
      for (const input of template.inputs || []) {
        const value = proposal.setterValues?.[input.name];

        // Special validation for voting class weights
        if (input.type === 'votingClassWeights') {
          if (!Array.isArray(value) || value.length === 0) {
            toast({
              title: "No Voting Classes",
              description: "At least one voting class is required.",
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            return false;
          }
          const totalPct = value.reduce((sum, cls) => sum + Number(cls.slicePct), 0);
          if (totalPct !== 100) {
            toast({
              title: "Invalid Weights",
              description: `Voting class weights must sum to 100% (currently ${totalPct}%).`,
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            return false;
          }
          continue;
        }

        if (!input.optional && (value === undefined || value === '' || value === null)) {
          toast({
            title: "Missing Value",
            description: `Please provide a value for "${input.label || input.name}".`,
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          return false;
        }

        // Skip further validation for optional empty inputs
        if (input.optional && (value === undefined || value === '' || value === null)) {
          continue;
        }

        // Validate number ranges
        if (input.type === 'number') {
          const numValue = Number(value);
          if (input.min !== undefined && numValue < input.min) {
            toast({
              title: "Invalid Value",
              description: `${input.label} must be at least ${input.min}.`,
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            return false;
          }
          if (input.max !== undefined && numValue > input.max) {
            toast({
              title: "Invalid Value",
              description: `${input.label} must be at most ${input.max}.`,
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            return false;
          }
        }
      }

      // For templates where all inputs are optional, ensure at least one has a value
      const allOptional = (template.inputs || []).every(input => input.optional);
      if (allOptional && template.inputs?.length > 0) {
        const hasAnyValue = (template.inputs || []).some(input => {
          const val = proposal.setterValues?.[input.name];
          if (typeof val === 'string') return val.trim() !== '';
          return val !== undefined && val !== '' && val !== null;
        });
        if (!hasAnyValue) {
          toast({
            title: "No Changes",
            description: "Please provide at least one value to change.",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          return false;
        }
      }
    } else {
      // Advanced mode validation
      if (!proposal.setterContract) {
        toast({
          title: "No Contract Selected",
          description: "Please select a target contract.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }

      if (!proposal.setterFunction) {
        toast({
          title: "No Function Selected",
          description: "Please select a function to call.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }

      const funcDef = RAW_FUNCTIONS[proposal.setterContract]?.find(
        f => f.name === proposal.setterFunction
      );
      if (!funcDef) {
        toast({
          title: "Invalid Function",
          description: "The selected function is not recognized.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }

      // Check all parameters have values
      for (let i = 0; i < funcDef.params.length; i++) {
        const param = funcDef.params[i];
        const value = proposal.setterParams?.[i];
        if (value === undefined || value === '' || value === null) {
          toast({
            title: "Missing Parameter",
            description: `Please provide a value for "${param.label || param.name}".`,
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          return false;
        }
      }
    }

    return true;
  }, [proposal.setterMode, proposal.setterTemplate, proposal.setterContract, proposal.setterFunction, proposal.setterValues, proposal.setterParams, toast]);

  const buildProposalData = useCallback((eligibilityModuleAddress, contractAddresses, freshHoldersOverride = null) => {
    let numOptions;
    let batches = [];
    let optionNames = [];

    if (proposal.type === "transferFunds") {
      const transferCall = {
        target: proposal.transferAddress,
        value: utils.parseEther(proposal.transferAmount).toString(),
        data: "0x",
      };

      batches = [
        [transferCall], // Yes wins: execute transfer
        [],             // No wins: do nothing
      ];
      numOptions = 2;
      optionNames = ["Yes", "No"];
    } else if (proposal.type === "election") {
      // Election proposal - each candidate is an option
      // When they win: revoke hat from current holders who lost, mint to winner
      numOptions = proposal.electionCandidates.length;
      optionNames = proposal.electionCandidates.map(c => c.name);

      const iface = new utils.Interface([
        "function mintHatToAddress(uint256 hatId, address wearer)",
        "function setWearerEligibility(address wearer, uint256 hatId, bool eligible, bool standing)"
      ]);

      // Only revoke from the specific incumbents the user selected — not all holders
      const selectedIncumbents = proposal.electionSelectedIncumbents || [];
      // All holders is used to check if candidate already holds the hat.
      // Prefer the fresh on-chain snapshot from handleSubmit when available;
      // form state can be stale (subgraph lag) and that produced AlreadyWearingHat
      // reverts in past KUBI elections.
      const allHolders = freshHoldersOverride
        ? freshHoldersOverride.allHolders
        : (proposal.electionCurrentHolders || []);
      // Fallback role: losers get downgraded to this hat instead of being fully removed
      const fallbackRoleId = proposal.electionFallbackRoleId;
      const fallbackHolders = freshHoldersOverride
        ? freshHoldersOverride.fallbackHolders
        : (proposal.electionFallbackHolders || []);

      batches = proposal.electionCandidates.map(candidate => {
        const batch = [];

        // Revoke hat from selected incumbents who are NOT this candidate
        selectedIncumbents.forEach(incumbent => {
          if (incumbent.address.toLowerCase() !== candidate.address.toLowerCase()) {
            // Revoke the elected hat
            batch.push({
              target: eligibilityModuleAddress,
              value: "0",
              data: iface.encodeFunctionData("setWearerEligibility", [
                incumbent.address,
                proposal.electionRoleId,
                false,
                false,
              ]),
            });

            // Grant fallback role to loser (if configured)
            if (fallbackRoleId) {
              // Set eligibility for fallback hat (idempotent, always safe)
              batch.push({
                target: eligibilityModuleAddress,
                value: "0",
                data: iface.encodeFunctionData("setWearerEligibility", [
                  incumbent.address,
                  fallbackRoleId,
                  true,
                  true,
                ]),
              });

              // Only mint if loser doesn't already hold the fallback hat
              const alreadyHoldsFallback = fallbackHolders.some(
                addr => addr.toLowerCase() === incumbent.address.toLowerCase()
              );
              if (!alreadyHoldsFallback) {
                batch.push({
                  target: eligibilityModuleAddress,
                  value: "0",
                  data: iface.encodeFunctionData("mintHatToAddress", [
                    fallbackRoleId,
                    incumbent.address,
                  ]),
                });
              }
            }
          }
        });

        // Mint hat to candidate if they don't already hold it
        const candidateAlreadyHolds = allHolders.some(
          h => h.address.toLowerCase() === candidate.address.toLowerCase()
        );
        if (!candidateAlreadyHolds) {
          batch.push({
            target: eligibilityModuleAddress,
            value: "0",
            data: iface.encodeFunctionData("mintHatToAddress", [
              proposal.electionRoleId,
              candidate.address,
            ]),
          });
        }

        return batch;
      });

      // First-class "No One" option — appended last so existing batch indices stay aligned.
      // Empty batch = no on-chain effect when this option wins.
      if (proposal.electionIncludeNoOneOption) {
        optionNames.push("No One");
        batches.push([]);
        numOptions = optionNames.length;
      }
    } else if (proposal.type === "setter") {
      // Setter proposal - call contract setter function(s)
      let setterCalls = [];

      if (proposal.setterMode === 'template' && proposal.setterTemplate) {
        // Template mode
        const template = getTemplateById(proposal.setterTemplate);
        if (template) {
          const contractKey = template.contract;
          const contextKey = CONTRACT_MAP[contractKey]?.contextKey;
          const contractAddress = contractAddresses?.[contextKey];

          if (contractAddress) {
            if (template.buildCalls) {
              // Multi-call template (e.g. token name + symbol in one proposal)
              setterCalls = template.buildCalls(proposal.setterValues, contractAddress);
            } else {
              // Single-call template: use functionName + encode
              const funcDef = RAW_FUNCTIONS[contractKey]?.find(f => f.name === template.functionName);
              if (funcDef) {
                const iface = new utils.Interface([funcDef.signature]);
                const encodedArgs = template.encode(proposal.setterValues);

                setterCalls = [{
                  target: contractAddress,
                  value: "0",
                  data: iface.encodeFunctionData(template.functionName, encodedArgs),
                }];
              }
            }
          }
        }
      } else {
        // Advanced mode: raw function call
        const funcDef = RAW_FUNCTIONS[proposal.setterContract]?.find(
          f => f.name === proposal.setterFunction
        );
        const contextKey = CONTRACT_MAP[proposal.setterContract]?.contextKey;
        const contractAddress = contractAddresses?.[contextKey];

        if (funcDef && contractAddress) {
          const iface = new utils.Interface([funcDef.signature]);

          setterCalls = [{
            target: contractAddress,
            value: "0",
            data: iface.encodeFunctionData(proposal.setterFunction, proposal.setterParams),
          }];
        }
      }

      if (setterCalls.length > 0) {
        batches = [
          setterCalls, // Yes wins: execute setter(s)
          [],          // No wins: do nothing
        ];
      } else {
        batches = [[], []];
      }

      numOptions = 2;
      optionNames = ["Apply Changes", "Reject"];
    } else {
      const filteredOptions = (proposal.options || []).filter(opt => opt.trim() !== '');
      numOptions = filteredOptions.length || 2;
      optionNames = filteredOptions;
      batches = [];
    }

    return { numOptions, batches, optionNames };
  }, [proposal]);

  const validateBasicFields = useCallback(() => {
    if (!proposal.name || proposal.name.trim() === '') {
      toast({
        title: "Missing Title",
        description: "Please enter a title for your proposal.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    const durationHours = Number(proposal.time);
    if (isNaN(durationHours) || durationHours <= 0) {
      toast({
        title: "Invalid Duration",
        description: "Please enter a valid duration in hours (must be greater than 0).",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    return true;
  }, [proposal.name, proposal.time, toast]);

  const handleSubmit = useCallback(async (eligibilityModuleAddress, contractAddresses = {}) => {
    setLoadingSubmit(true);

    try {
      // Basic field validation
      if (!validateBasicFields()) {
        setLoadingSubmit(false);
        return;
      }

      if (proposal.type === "transferFunds" && !validateTransferProposal()) {
        setLoadingSubmit(false);
        return;
      }

      if (proposal.type === "election" && !validateElectionProposal()) {
        setLoadingSubmit(false);
        return;
      }

      if (proposal.type === "setter" && !validateSetterProposal()) {
        setLoadingSubmit(false);
        return;
      }

      if (proposal.type === "normal" && !validateNormalProposal()) {
        setLoadingSubmit(false);
        return;
      }

      // For elections, re-read hat wearership on-chain right before building
      // batches. Stale form state previously caused AlreadyWearingHat reverts
      // (mint calls were emitted for wearers who already held the hat).
      //
      // We construct a JsonRpcProvider scoped to the ORG chain rather than
      // using the wallet's provider — for cross-chain users (passkey, or an
      // EOA whose wallet is on a different chain) the wallet provider would
      // read the wrong chain's state. Mirrors the read pattern in
      // pages/create/index.js:355.
      let freshHoldersOverride = null;
      if (proposal.type === "election") {
        const hatsAddr = getInfrastructureAddress(CONTRACT_NAMES.HATS_PROTOCOL, orgChainId);
        if (hatsAddr && orgNetwork?.rpcUrl && orgChainId) {
          try {
            const readProvider = new ethersProviders.JsonRpcProvider(
              orgNetwork.rpcUrl,
              { chainId: orgChainId, name: orgNetwork.name || `chain-${orgChainId}` }
            );
            const hats = createHatsService(readProvider);
            const candidateAddrs = proposal.electionCandidates.map(c => c.address);
            const incumbentAddrs = (proposal.electionSelectedIncumbents || []).map(i => i.address);

            const candidateMap = await hats.getHolderStatuses(
              hatsAddr,
              proposal.electionRoleId,
              candidateAddrs,
            );
            const fallbackMap = proposal.electionFallbackRoleId
              ? await hats.getHolderStatuses(
                  hatsAddr,
                  proposal.electionFallbackRoleId,
                  incumbentAddrs,
                )
              : new Map();

            freshHoldersOverride = {
              allHolders: candidateAddrs
                .filter(a => candidateMap.get(a.toLowerCase()) === true)
                .map(a => ({ address: a, name: '' })),
              fallbackHolders: incumbentAddrs.filter(
                a => fallbackMap.get(a.toLowerCase()) === true,
              ),
            };
          } catch (err) {
            console.error('[useProposalForm] Hats holder refresh failed:', err);
            toast({
              title: "Cannot verify current role holders",
              description: "Could not read the Hats contract. Please try again.",
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            setLoadingSubmit(false);
            return;
          }
        } else {
          // No Hats address / RPC configured for this chain — defensive fall-through
          // to cached form state. Not expected on Gnosis/Arbitrum/Sepolia.
          console.warn('[useProposalForm] No HATS_PROTOCOL or RPC for chain', orgChainId);
        }
      }

      const { numOptions, batches, optionNames } = buildProposalData(eligibilityModuleAddress, contractAddresses, freshHoldersOverride);

      // Form collects hours; contract ABI expects minutes (uint32 minutesDuration).
      // Math.round avoids FP slop (e.g., 0.5 * 60 = 30, not 29.999...).
      const durationHours = Number(proposal.time);
      const durationMinutes = Math.max(1, Math.round(durationHours * 60));

      await onSubmit({
        name: proposal.name.trim(),
        description: proposal.description || '',
        time: durationMinutes,
        numOptions,
        batches,
        optionNames,
        type: proposal.type,
        transferAddress: proposal.transferAddress,
        transferAmount: proposal.transferAmount,
        electionRoleId: proposal.electionRoleId,
        electionCandidates: proposal.electionCandidates,
        electionIncludeNoOneOption: proposal.electionIncludeNoOneOption,
        // Setter proposal fields
        setterContract: proposal.setterContract,
        setterTemplate: proposal.setterTemplate,
        // Voting restrictions
        hatIds: proposal.isRestricted ? proposal.restrictedHatIds : [],
      });

      setLoadingSubmit(false);
      resetForm();

      let successDescription;
      if (proposal.type === "transferFunds") {
        successDescription = `Transfer proposal created. If "Yes" wins, ${proposal.transferAmount} ${nativeCurrencySymbol} will be sent to ${proposal.transferAddress.slice(0, 6)}...${proposal.transferAddress.slice(-4)}`;
      } else if (proposal.type === "election") {
        successDescription = `Election created with ${proposal.electionCandidates.length} candidates. The winner will receive the role automatically.`;
      } else if (proposal.type === "setter") {
        const template = getTemplateById(proposal.setterTemplate);
        const actionName = template?.name || proposal.setterFunction || 'settings change';
        successDescription = `Settings change proposal created. If approved, "${actionName}" will be executed automatically.`;
      } else {
        successDescription = "Your proposal has been created successfully.";
      }

      toast({
        title: "Proposal Created",
        description: successDescription,
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      return true;
    } catch (error) {
      console.error("Error creating poll:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create proposal.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      setLoadingSubmit(false);
      return false;
    }
  }, [proposal, validateBasicFields, validateTransferProposal, validateElectionProposal, validateNormalProposal, validateSetterProposal, buildProposalData, onSubmit, resetForm, toast, orgChainId, orgNetwork, nativeCurrencySymbol]);

  return {
    proposal,
    loadingSubmit,
    handleInputChange,
    handleOptionChange,
    addOption,
    removeOption,
    handleProposalTypeChange,
    handleTransferAddressChange,
    handleTransferAmountChange,
    handleElectionRoleChange,
    handleCandidatesChange,
    addCandidate,
    removeCandidate,
    handleRestrictedToggle,
    handleRestrictedRolesChange,
    toggleRestrictedRole,
    handleSetterChange,
    handleSubmit,
    resetForm,
  };
}

export default useProposalForm;
