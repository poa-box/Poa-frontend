import { rawSetterUnavailableReason, templateUnavailableReason } from '@/lib/voting/setterAvailability';
/**
 * useProposalForm
 * Hook for managing proposal form state and submission
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useToast } from '@chakra-ui/react';
import { isAddress } from '@ethersproject/address';

import { RAW_FUNCTIONS, getTemplateById, isBytes32, normalizeBytes32 } from '@/config/setterDefinitions';
import { useAuth } from '@/context/authState';
import { usePOContext } from '@/context/POContext';
import { useProjectContext } from '@/context/ProjectContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { getNetworkByChainId } from '@/config/networks';

import { getTokenByAddress } from '@/util/tokens';
import { TRANSFER_DESTINATION, BOUNTY_POOL_LABEL, amountDecimalsError } from '@/lib/voting/treasuryBatches';
import { isDurationAllowed, durationTooShortMessage } from '@/lib/voting/durationLimits';

import { defaultRoleForm, resolveRoleForm, roleFormError, ROLE_FORM_KIND } from '@/lib/accessV2/roleFormBatch';
import { ELECTION_TITLE_PREFIX, ELECTION_DESCRIPTION_PREFIX, CREATE_ROLE_TITLE_PREFIX, CREATE_ROLE_DESCRIPTION_PREFIX, defaultRoleConfig } from '@/lib/voting/proposalDefaults';
import { createScopedRequestGate } from '@/lib/services/scopedRequestGate';
import {
  defaultRoleRemovalConfig,
  buildRoleRemovalSummaries,
  ROLE_REMOVAL_UNAVAILABLE_MESSAGE,
  roleRemovalConfigError,
} from '@/lib/accessV2/roleRemoval';

import { supportsVotingRestrictions } from '@/components/voting/create/wizardSteps';

const defaultProposal = {
  name: "",
  description: "",
  // Provenance twins for the wizard's auto-copy (UI only — never submitted).
  // applyAutoCopy rewrites name/description only while they still equal these,
  // so wording the member typed survives Back → reconfigure. See
  // components/voting/create/autoCopy.js.
  autoTitle: "",          // last title this flow generated
  autoDescription: "",    // last description this flow generated
  execution: "",
  time: 72,
  options: ["", ""],
  type: "normal",
  transferAddress: "",
  transferAmount: "",
  // Asset to pay out. "" = the chain's native currency (xDAI on Gnosis); any
  // other value is an ERC20 contract address from getBountyTokenOptions.
  transferToken: "",
  // Where the money goes: a typed address, or the org's task-reward pool (the
  // TaskManager — the modal writes its address into transferAddress).
  transferDestination: TRANSFER_DESTINATION.ADDRESS,
  // Which pot pays. "" = not yet resolved; the modal resolves it from live
  // balances (Executor first, then the PaymentManager) and writes the answer —
  // plus any fully-claimed payout rounds to close first — here, so submit
  // encodes exactly what the review screen showed. See lib/voting/treasuryBatches.
  transferSource: "",
  transferFinalizeIds: [],
  transferSourceLabel: "",
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
  setterCategory: "",     // Category card picked in SetterActionSelector (UI only;
                          // lifted out of its local state so it survives Back/Next)
  setterContract: "",     // Contract key (e.g., "hybridVoting")
  setterFunction: "",     // Function name (e.g., "setConfig")
  setterValues: {},       // Template input values
  setterParams: [],       // Raw function parameters (for advanced mode)
  // Create-role fields — bundle that builds a multi-call batch:
  //   1. EligibilityModule.createHatWithEligibility(...)
  //   2. EligibilityModule.configureVouching(predictedHatId, ...)       (if vouching)
  //   3. HybridVoting.setCreatorHatAllowed(predictedHatId, true)        (if canVote)
  //   4. TaskManager.setProjectRolePerm(pid, predictedHatId, mask)      (per project)
  //   5. TaskManager.setConfig(ROLE_PERM/CREATOR_HAT/ORGANIZER_HAT, …)  (global perms)
  //   6. EligibilityModule.updateHatMetadata(predictedHatId, name, cid) (if description)
  // Hat ID is pre-computed via Hats.getNextId at submit time.
  roleConfig: { ...defaultRoleConfig },
  // ACCESS V2 — the same createRole intent, on an org whose roles are authority SUBJECTS. The
  // wizard renders `components/accessV2/RoleForm` instead of RoleConfigurator and the batch comes
  // from `lib/accessV2/roleFormBatch` — the encoder /team's "Create a role or group" modal also
  // uses, so a role made from either door is the same role. `roleConfig` is left untouched: a
  // legacy org still walks the branch above, byte for byte.
  roleFormV2: defaultRoleForm(),
  // Access-v2 role removal — one authority role and up to 20 current members.
  roleRemovalConfig: { ...defaultRoleRemovalConfig },
  id: 0,
};

export { withFreshAcceptance } from '@/lib/voting/proposalRuntimeHelpers';

export function useProposalForm({ onSubmit }) {
  const toast = useToast();
  const { orgId, orgChainId, subgraphUrl, roleNames } = usePOContext();
  const { accountAddress, authType } = useAuth();
  const scope = JSON.stringify([orgId, orgChainId, subgraphUrl, accountAddress, authType]);
  const scopeGate = useRef(null);
  if (!scopeGate.current) scopeGate.current = createScopedRequestGate();
  scopeGate.current.setScope(scope);
  const submittingRef = useRef(false);
  const activeRef = useRef(true);
  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false; }; }, []);
  const { projectsData } = useProjectContext() || {};
  const { addToIpfs } = useIPFScontext();
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
    // Most governance actions are decided by the full electorate. A treasury payout is also
    // binding, but intentionally retains its role-restriction picker, so this cannot key off the
    // broader BINDING_TYPES set.
    const clearsRestrictions = !supportsVotingRestrictions(newType);
    setProposal(prev => {
      // Auto-generated copy describes the OLD intent, so it can't survive a type
      // switch. autoTitle/autoDescription are the provenance twins applyAutoCopy
      // writes: a field still equal to its twin is ours to drop, anything else
      // the member typed themselves and we keep.
      let clearedName = prev.name;
      let clearedDescription = prev.description;
      if (clearedName && clearedName === prev.autoTitle) clearedName = '';
      if (clearedDescription && clearedDescription === prev.autoDescription) clearedDescription = '';

      // Belt and braces for drafts written before provenance existed: they only
      // carry the sentinel prefixes each configurator used to own.
      const leavingElection = prev.type === 'election' && newType !== 'election';
      const leavingCreateRole = prev.type === 'createRole' && newType !== 'createRole';
      if (leavingElection && clearedName?.startsWith(ELECTION_TITLE_PREFIX)) clearedName = '';
      if (leavingElection && clearedDescription?.startsWith(ELECTION_DESCRIPTION_PREFIX)) clearedDescription = '';
      if (leavingCreateRole && clearedName?.startsWith(CREATE_ROLE_TITLE_PREFIX)) clearedName = '';
      if (leavingCreateRole && clearedDescription?.startsWith(CREATE_ROLE_DESCRIPTION_PREFIX)) clearedDescription = '';

      return {
        ...prev,
        type: newType,
        name: clearedName,
        description: clearedDescription,
        // The new intent hasn't generated any copy yet — leaving stale
        // provenance behind would let the next suggestion clobber a title the
        // member had typed for the previous one.
        autoTitle: '',
        autoDescription: '',
        options: newType === 'normal' ? ["", ""] : [],
        ...(clearsRestrictions ? {
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
        ...(newType !== 'createRole' ? {
          roleConfig: { ...defaultRoleConfig },
          roleFormV2: defaultRoleForm(),
        } : {}),
        ...(newType !== 'removeRoleMembers' ? {
          roleRemovalConfig: { ...defaultRoleRemovalConfig },
        } : {}),
        // Without this, setter → election → setter resurrected the old template
        // and the config step silently skipped the category picker.
        ...(newType !== 'setter' ? {
          setterMode: 'template',
          setterTemplate: '',
          setterCategory: '',
          setterContract: '',
          setterFunction: '',
          setterValues: {},
          setterParams: [],
        } : {}),
        ...(newType !== 'transferFunds' ? {
          transferAddress: '',
          transferAmount: '',
          transferToken: '',
          transferDestination: TRANSFER_DESTINATION.ADDRESS,
          transferSource: '',
          transferFinalizeIds: [],
          transferSourceLabel: '',
        } : {}),
      };
    });
  }, []);

  // Direct setter for the intent-gallery card entry. The card UI has no
  // synthetic <select> event, so we synthesize the { target: { value } } shape
  // handleProposalTypeChange expects — keeping ONE code path for type changes so
  // the state transitions (clearing restrictions, election/role fields, etc.)
  // stay byte-identical to the old dropdown flow.
  const setProposalType = useCallback((newType) => {
    handleProposalTypeChange({ target: { value: newType } });
  }, [handleProposalTypeChange]);

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

  // Hydrate the whole form from a persisted draft (useVoteDraft). Merged over
  // defaultProposal so a draft written by an older schema can't leave required
  // keys undefined. Only ever called with the user's own localStorage payload.
  const restoreProposal = useCallback((draft) => {
    if (!draft || typeof draft !== 'object') return;
    setProposal(prev => ({ ...defaultProposal, ...draft }));
  }, []);

  const validateTransferProposal = useCallback(() => {
    if (!proposal.transferAddress || !isAddress(proposal.transferAddress)) {
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

    // parseUnits throws a raw "fractional component exceeds decimals" for an
    // amount finer than the asset — say it in the asset's own terms instead.
    const payoutToken = proposal.transferToken ? getTokenByAddress(proposal.transferToken) : null;
    const decimalsError = amountDecimalsError(
      proposal.transferAmount,
      payoutToken ? payoutToken.decimals : (orgNetwork?.nativeCurrency?.decimals ?? 18),
      payoutToken ? payoutToken.symbol : nativeCurrencySymbol,
    );
    if (decimalsError) {
      toast({
        title: "Invalid Amount",
        description: decimalsError,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    return true;
  }, [proposal.transferAddress, proposal.transferAmount, proposal.transferToken, orgNetwork, nativeCurrencySymbol, toast]);

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
      if (!candidate.address || !isAddress(candidate.address)) {
        toast({
          title: "Invalid Candidate Address",
          description: `"${candidate.name || 'Unnamed'}" has an invalid address.`,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }
      if (candidate.address === '0x0000000000000000000000000000000000000000') {
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

  // `accessV2Enabled` is passed by handleSubmit from the same flag VotingPage sets. On a v2 org
  // the whole screen is a different form (RoleForm -> `roleFormV2`), which can also make a GROUP,
  // so the rules come from the ONE pure gate the wizard's step gate uses — `roleFormError` over
  // the form `buildProposalData` will actually encode. Anything else lets a proposal pass
  // validation describing one thing and encode another.
  const validateCreateRoleProposal = useCallback((accessV2Enabled = false) => {
    const fail = (title, description) => {
      toast({ title, description, status: 'error', duration: 5000, isClosable: true });
      return false;
    };

    if (accessV2Enabled) {
      const form = resolveRoleForm(proposal);
      const error = roleFormError(form);
      if (error) {
        return fail(
          form.kind === ROLE_FORM_KIND.GROUP ? 'Check the group' : 'Check the role',
          error,
        );
      }
      return true;
    }

    return fail('Organization unavailable', 'Current authority permissions are required.');
  }, [proposal, toast]);

  const validateRoleRemovalProposal = useCallback((accessV2Enabled = false) => {
    const error = accessV2Enabled
      ? roleRemovalConfigError(proposal.roleRemovalConfig)
      : ROLE_REMOVAL_UNAVAILABLE_MESSAGE;
    if (!error) return true;
    toast({
      title: "Can't create this removal vote yet",
      description: error,
      status: 'error',
      duration: 6000,
      isClosable: true,
    });
    return false;
  }, [proposal.roleRemovalConfig, toast]);

  const validateSetterProposal = useCallback(() => {
    const retired = proposal.setterMode === 'advanced'
      ? rawSetterUnavailableReason(proposal)
      : templateUnavailableReason(getTemplateById(proposal.setterTemplate), { authorityEnabled: true });
    if (retired) {
      toast({ title: 'Action unavailable', description: retired, status: 'error' });
      return false;
    }
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

        // Hash-shaped inputs must be well-formed before they reach ethers,
        // which otherwise throws an opaque "invalid arrayify value" at submit.
        // Checked post-normalization so validation accepts exactly what encode
        // accepts (stray whitespace / a missing 0x prefix are both recoverable).
        // `validateAs` lets a field render as something friendlier than a hex box
        // while still being checked as one.
        if ((input.validateAs || input.type) === 'bytes32' && !isBytes32(normalizeBytes32(value))) {
          toast({
            title: "Invalid Value",
            description: `${input.label || input.name} must be a 0x-prefixed 32-byte hex value (66 characters).`,
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          return false;
        }
      }

      // Whole-template check, for rules that span more than one field (e.g. the
      // invite list refusing to be proposed while it can't be read).
      const templateError = template.validate?.(proposal.setterValues || {});
      if (templateError) {
        toast({
          title: "Can't create this vote yet",
          description: templateError,
          status: "error",
          duration: 6000,
          isClosable: true,
        });
        return false;
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

        // Same hash check the template path does — otherwise a mistyped raw
        // param reaches ethers as an opaque "invalid arrayify value" throw.
        if (param.type === 'bytes32' && !isBytes32(normalizeBytes32(value))) {
          toast({
            title: "Invalid Value",
            description: `${param.label || param.name} must be a 0x-prefixed 32-byte hex value (66 characters).`,
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          return false;
        }
      }
    }

    return true;
  }, [proposal, toast]);

  // Project id → name map, derived exactly like CreateVoteModal's so the setter
  // description the member reads on the details step and the actionSummary
  // written into metadata resolve the same names. roleNames comes from
  // POContext, which this hook already consumes — no new props.
  const projectNames = useMemo(() => {
    const map = {};
    for (const p of (projectsData || [])) {
      if (p?.id) map[p.id] = p.name || p.title || p.id;
    }
    return map;
  }, [projectsData]);

  // Human-readable preview lines for the confirm step AND the forward-compatible
  // actionSummaries metadata (task 9). These mirror the exact strings the create
  // flow already computes (setter preview, transfer sentence, election / role
  // summaries). Purely descriptive — never touches on-chain params.
  // NOTE: declared before handleSubmit so its dependency reference is out of the
  // temporal dead zone when the useCallback deps array evaluates.
  const buildActionSummaries = useCallback(() => {
    const summaries = [];
    if (proposal.type === 'transferFunds') {
      // Fallback only — buildProposalData returns the builder's own summaries
      // for this type (which also name any payout rounds closed first).
      const amt = proposal.transferAmount || '?';
      const addr = proposal.transferAddress || '';
      const short = addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
      const sym = proposal.transferToken
        ? getTokenByAddress(proposal.transferToken).symbol
        : nativeCurrencySymbol;
      const toBountyPool = proposal.transferDestination === TRANSFER_DESTINATION.BOUNTY_POOL;
      summaries.push(toBountyPool
        ? `If Yes wins, move ${amt} ${sym} from the treasury to the ${BOUNTY_POOL_LABEL}.`
        : `If Yes wins, send ${amt} ${sym} from the treasury to ${short}.`);
    } else if (proposal.type === 'setter') {
      if (proposal.setterMode === 'template' && proposal.setterTemplate) {
        const tmpl = getTemplateById(proposal.setterTemplate);
        if (tmpl?.preview) {
          try {
            // Same (values, roleNames, projectNames) call the details-step copy
            // makes — 5 templates resolve a role/project name from these, and
            // passing values alone left the summary quoting a raw uint256 hat id
            // while the description said "Contributor".
            const line = tmpl.preview(proposal.setterValues || {}, roleNames, projectNames);
            if (line) summaries.push(line);
          } catch { /* preview is best-effort */ }
        }
      } else if (proposal.setterContract && proposal.setterFunction) {
        summaries.push(`Call ${proposal.setterFunction} on ${proposal.setterContract}.`);
      }
    } else if (proposal.type === 'election') {
      const roleLabel = proposal.electionRoleId ? `role ${proposal.electionRoleId}` : 'the selected role';
      const names = (proposal.electionCandidates || []).map(c => c.name).filter(Boolean);
      if (names.length) {
        summaries.push(`Elect ${names.join(' or ')} as ${roleLabel}. The winner receives it automatically.`);
      }
    } else if (proposal.type === 'createRole') {
      const rc = proposal.roleConfig || {};
      if (rc.name) {
        const wearerCount = (rc.initialWearers || []).length;
        summaries.push(
          `Create the role "${rc.name}"${wearerCount ? ` and grant it to ${wearerCount} member(s)` : ''}.`
        );
      } else {
        // ACCESS V2: the screen writes `roleFormV2`, and it can also make a GROUP. Only a
        // fallback — the v2 arm of buildProposalData hands back the builders' own summaries,
        // which are what the race detector matches on.
        const form = resolveRoleForm(proposal);
        if (form.name) {
          const holderCount = (form.holders || []).length;
          summaries.push(
            form.kind === ROLE_FORM_KIND.GROUP
              ? `Create the group "${form.name}".`
              : `Create the role "${form.name}"${holderCount ? ` and grant it to ${holderCount} member(s)` : ''}.`
          );
        }
      }
    } else if (proposal.type === 'removeRoleMembers') {
      const rc = proposal.roleRemovalConfig || {};
      summaries.push(...buildRoleRemovalSummaries(rc));
    }
    return summaries;
  }, [proposal, nativeCurrencySymbol, roleNames, projectNames]);

  // `extras` carries live facts the pure builders need but the form doesn't hold:
  //   extras.accessV2 = { enabled, authority, subjects, roles, groups, inOrgUsers, … }
  // (assembled by VotingPage from the access-v2 hooks; empty on a legacy org).
  // Builders may also hand back `summaries` (the sentences voters read) and a
  // `gasLimit` (the announceWinner floor) alongside the batch.


  const validateBasicFields = useCallback(() => {
    // Setter proposals can be submitted without a manually-entered title:
    // we auto-fill from the template's preview() at submission time below.
    // Skip the empty-title gate when a setter template is selected.
    const setterProvidesTitle =
      proposal.type === 'setter'
      && proposal.setterMode === 'template'
      && proposal.setterTemplate;

    if (!setterProvidesTitle && (!proposal.name || proposal.name.trim() === '')) {
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

    // Restricted voting with an empty allowlist would submit hatIds: [] and
    // silently fall back to "everyone can vote" — the opposite of the user's
    // intent. Block it here (backstop for the inline validation in the modal).
    if (proposal.isRestricted && (proposal.restrictedHatIds?.length ?? 0) === 0) {
      toast({
        title: "No Roles Selected",
        description: "You restricted who can vote but didn't pick any roles. Select at least one, or turn restriction off.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    return true;
  }, [
    proposal.name,
    proposal.time,
    proposal.type,
    proposal.setterMode,
    proposal.setterTemplate,
    proposal.isRestricted,
    proposal.restrictedHatIds,
    toast,
  ]);

  const handleSubmit = useCallback(async (...args) => {
    const [, contractAddresses = {}, extras = {}] = args;
    if (!extras?.accessV2?.enabled || !contractAddresses?.membershipAuthorityAddress) {
      toast({ title: 'Organization permissions are unavailable', description: 'Wait for the current roles to load and try again.', status: 'error' });
      return false;
    }
    if (submittingRef.current) return false;
    submittingRef.current = true;
    const isCurrent = scopeGate.current.start(scope);
    setLoadingSubmit(true);
    const assertCurrent = () => {
      if (!activeRef.current || !isCurrent?.()) throw new Error('Your account or organization changed. Please reopen this form and try again.');
    };
    try {
      assertCurrent();
      const { submitProposalRuntime } = await import('@/hooks/runtime/proposalSubmitRuntime');
      assertCurrent();
      return await submitProposalRuntime({ proposal, orgNetwork, nativeCurrencySymbol, roleNames, projectNames, setLoadingSubmit, validateBasicFields, validateTransferProposal, validateElectionProposal, validateNormalProposal, validateSetterProposal, validateCreateRoleProposal, validateRoleRemovalProposal, buildActionSummaries, onSubmit: (...values) => { assertCurrent(); return onSubmit(...values); }, resetForm: () => { if (activeRef.current && isCurrent?.()) resetForm(); }, toast, orgChainId, addToIpfs: (...values) => { assertCurrent(); return addToIpfs(...values); } }, ...args);
    } catch (error) {
      toast({ title: 'Error', description: error.message || 'Failed to prepare proposal.', status: 'error', duration: 5000, isClosable: true });
      setLoadingSubmit(false);
      return false;
    } finally {
      submittingRef.current = false;
    }
  }, [scope, proposal, orgNetwork, nativeCurrencySymbol, roleNames, projectNames, validateBasicFields, validateTransferProposal, validateElectionProposal, validateNormalProposal, validateSetterProposal, validateCreateRoleProposal, validateRoleRemovalProposal, buildActionSummaries, onSubmit, resetForm, toast, orgChainId, addToIpfs]);

  // ---------------------------------------------------------------------------
  // Inline field-level validation (non-blocking; the submit-time toast
  // validators above stay as the authoritative backstop). This drives the
  // FormControl isInvalid / FormErrorMessage UI and the disabled-with-reason
  // Create button. Keys are stable field names the modal maps to controls.
  // ---------------------------------------------------------------------------
  const fieldErrors = useMemo(() => {
    const errors = {};

    // Title — required except when a setter template auto-fills it.
    const setterProvidesTitle =
      proposal.type === 'setter'
      && proposal.setterMode === 'template'
      && proposal.setterTemplate;
    if (!setterProvidesTitle && (!proposal.name || proposal.name.trim() === '')) {
      errors.name = 'Give your vote a title.';
    }

    // Duration — must be at least the product floor (1 hour; 10 minutes in E2E mode).
    if (!isDurationAllowed(proposal.time)) {
      errors.time = durationTooShortMessage();
    }

    // Normal — at least 2 non-empty options.
    if (proposal.type === 'normal') {
      const nonEmpty = (proposal.options || []).filter(o => o.trim() !== '');
      if (nonEmpty.length < 2) {
        errors.options = 'Add at least 2 options.';
      }
    }

    // Transfer funds — valid recipient + positive amount the asset can represent.
    if (proposal.type === 'transferFunds') {
      if (!proposal.transferAddress || !isAddress(proposal.transferAddress)) {
        errors.transferAddress = 'Enter a valid recipient address (0x…).';
      }
      const amt = parseFloat(proposal.transferAmount);
      if (isNaN(amt) || amt <= 0) {
        errors.transferAmount = 'Enter an amount greater than 0.';
      } else {
        const payoutToken = proposal.transferToken ? getTokenByAddress(proposal.transferToken) : null;
        const decimalsError = amountDecimalsError(
          proposal.transferAmount,
          payoutToken ? payoutToken.decimals : (orgNetwork?.nativeCurrency?.decimals ?? 18),
          payoutToken ? payoutToken.symbol : nativeCurrencySymbol,
        );
        if (decimalsError) errors.transferAmount = decimalsError;
      }
    }

    // Restricted voting with an empty allowlist.
    if (proposal.isRestricted && (proposal.restrictedHatIds?.length ?? 0) === 0) {
      errors.restrictedHatIds = 'Pick at least one role, or turn restriction off.';
    }

    return errors;
  }, [
    proposal.type,
    proposal.name,
    proposal.time,
    proposal.options,
    proposal.transferAddress,
    proposal.transferAmount,
    proposal.transferToken,
    proposal.isRestricted,
    proposal.restrictedHatIds,
    proposal.setterMode,
    proposal.setterTemplate,
    orgNetwork,
    nativeCurrencySymbol,
  ]);

  const isValid = Object.keys(fieldErrors).length === 0;

  return {
    proposal,
    loadingSubmit,
    fieldErrors,
    isValid,
    setProposalType,
    buildActionSummaries,
    restoreProposal,
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
