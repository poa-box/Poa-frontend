import { refreshReviewedTreasuryTransfer } from '@/lib/voting/treasurySubmitEvidence';
import { createGovernanceSubmissionGuard } from '@/lib/voting/governanceSubmission';
import { rawSetterUnavailableReason, templateUnavailableReason } from '@/lib/voting/setterAvailability';
import { encodeExecutorCall } from '@poa-box/core/tx/governance';
import { RAW_FUNCTIONS, CONTRACT_MAP, getTemplateById, buildSetterCopy, isContractAvailable, normalizeBytes32 } from '@/config/setterDefinitions';

import { getTokenByAddress } from '@/util/tokens';
import { TRANSFER_DESTINATION, TRANSFER_SOURCE, BOUNTY_POOL_LABEL, buildTreasuryTransferBatch, transferOptionNames } from '@/lib/voting/treasuryBatches';

import {
  buildV2ElectionBatches,
} from '@/lib/voting/v2VoteActions';
import { resolveRoleForm, ROLE_FORM_KIND, roleOptionNames } from '@/lib/accessV2/roleFormBatch';

import { buildRoleRemovalBatch } from '@/lib/accessV2/proposalBuilders';
import { checkBatchSubmittable } from '@/lib/accessV2/submission';

import { resolveV2SubjectName } from '@/lib/voting/proposalRuntimeHelpers';
const worthKnowing = (w) => `Worth knowing: ${w}`;
const SETTER_ABIS = { hybridVoting: 'HybridVotingNew', directDemocracyVoting: 'DirectDemocracyVotingNew',
  taskManager: 'TaskManagerNew', participationToken: 'ParticipationToken', zkEmailInvites: 'ZkEmailInvites',
  membershipAuthority: 'MembershipAuthority' };
const setterCall = (contractKey, target, method, args) => {
  const call = encodeExecutorCall(SETTER_ABIS[contractKey], target, method, args, '0');
  return { target: call.target, value: String(call.value), data: call.calldata };
};

export async function submitProposalRuntime(context, ...args) {
  const { proposal, orgNetwork, nativeCurrencySymbol, roleNames, projectNames, setLoadingSubmit, validateBasicFields, validateTransferProposal, validateElectionProposal, validateNormalProposal, validateSetterProposal, validateCreateRoleProposal, validateRoleRemovalProposal, buildActionSummaries, onSubmit, resetForm, toast, orgChainId } = context;
  const buildProposalData = (eligibilityModuleAddress, contractAddresses, freshHoldersOverride = null, hatsProtocolAddress = null, predictedRoleHatId = null, metadataCIDBytes32 = null, extras = {}) => {
    if (!extras?.accessV2?.enabled || !contractAddresses?.membershipAuthorityAddress) throw new Error('Authority permissions are required to create a proposal.');
    let numOptions;
    let batches = [];
    let optionNames = [];
    let summaries = null;
    let gasLimit = null;
    let createsSubject = false;

    if (proposal.type === "transferFunds") {
      // Batches execute with the Executor as msg.sender. Which pot pays was
      // resolved on the config step from live balances (CreateVoteModal →
      // lib/voting/treasuryBatches.resolveTransferSource) and written into the
      // form, so the batch encodes exactly what the review screen showed:
      //   • executor       — the Executor's own balance: a plain value send, or
      //                      an ERC20 transfer() (the legacy shape);
      //   • paymentManager — PaymentManager.withdraw(token, to, amount), run by
      //                      its owner (the Executor). That is where "Deposit to
      //                      treasury" actually puts the money — after closing
      //                      any fully-claimed payout rounds still pinning it.
      // Amounts use the token's own decimals — parseEther would be 10^12 off
      // for USDC.
      const payoutToken = proposal.transferToken
        ? getTokenByAddress(proposal.transferToken)
        : null;
      const built = buildTreasuryTransferBatch({
        source: proposal.transferSource || TRANSFER_SOURCE.EXECUTOR,
        token: payoutToken ? payoutToken.address : '',
        decimals: payoutToken ? payoutToken.decimals : (orgNetwork?.nativeCurrency?.decimals ?? 18),
        symbol: payoutToken ? payoutToken.symbol : nativeCurrencySymbol,
        amount: String(proposal.transferAmount),
        recipient: proposal.transferAddress,
        paymentManagerAddress: contractAddresses?.paymentManagerAddress,
        finalizeIds: proposal.transferFinalizeIds || [],
        destination: proposal.transferDestination || TRANSFER_DESTINATION.ADDRESS,
        evidence: extras.treasury?.planningEvidence,
      });

      batches = [
        built.batch, // Yes wins: execute transfer
        [],          // No wins: do nothing
      ];
      summaries = built.summaries;
      gasLimit = built.gasLimit;
      numOptions = 2;
      // The same pair the review screen shows — voters never see a wording the
      // creator did not (lib/voting/treasuryBatches.transferOptionNames).
      optionNames = transferOptionNames(proposal.transferDestination);
    } else if (proposal.type === "election" && extras?.accessV2?.enabled) {
      // ── ELECTION, access-v2 org ──
      // The legacy arm below encodes EligibilityModule + Hats calls against a role hat that
      // cutover DEACTIVATED: every one of them reverts HatNotActive inside announceWinner's
      // try/catch, so the vote "passes" and nothing happens. On a v2 org the ballot is written
      // against the MembershipAuthority instead (lib/voting/v2VoteActions).
      const v2 = extras.accessV2;
      if (!v2.electionPlanning) throw new Error('Review the current election choices before creating this vote.');
      const built = buildV2ElectionBatches({
        authority: v2.authority || contractAddresses?.membershipAuthorityAddress,
        subjectId: proposal.electionRoleId,
        subjectName: resolveV2SubjectName(v2, proposal.electionRoleId),
        candidates: proposal.electionCandidates || [],
        planningEvidence: v2.electionPlanning || null,
        selectedIncumbents: proposal.electionSelectedIncumbents || [],
        includeNoOneOption: Boolean(proposal.electionIncludeNoOneOption),
        inOrgUsers: v2.inOrgUsers,
        fallbackSubjectId: proposal.electionFallbackRoleId || '',
        fallbackSubjectName: proposal.electionFallbackRoleId
          ? resolveV2SubjectName(v2, proposal.electionFallbackRoleId)
          : '',
      });
      batches = built.batches;
      optionNames = built.optionNames;
      numOptions = optionNames.length;
      // Warnings ride along with the summaries: they are the sentences that say what this ballot
      // can NOT do (a departed incumbent, a fallback that had to be dropped), and voters are
      // exactly the people who need to read them.
      summaries = [...built.summaries, ...built.warnings.map(worthKnowing)];
      gasLimit = built.gasLimit;
    } else if (proposal.type === "createRole" && extras?.accessV2?.enabled) {
      // ── CREATE ROLE (or GROUP), access-v2 org ──
      // The legacy arm below SUCCEEDS here, which is worse than reverting: it mints an inert
      // Role calldata comes only from the prepared shared operation. The host keeps
      // ballot wording and transport; staged configuration uses the proven actual ID.
      const v2 = extras.accessV2;
      const built = v2.preparedRole;
      if (!built) throw new Error('Review the current role settings before creating this vote.');
      // The on-chain call ceiling is a gate, not a warning: HybridVoting reverts `TooManyCalls`
      // at CREATION, after the IPFS upload and — for a passkey member — a burned UserOp.
      if (built.submittable && !built.submittable.ok) {
        throw new Error(built.submittable.message || 'This proposal has too many steps to submit in one vote.');
      }
      createsSubject = built.createsSubject;
      batches = [built.batch, []];   // Yes wins: create + configure. No wins: nothing.
      numOptions = 2;
      optionNames = roleOptionNames(built);
      // The id-race warning is the one a voter most needs and can act on (close the other
      // proposal first), so it goes into the metadata with the rest of the preview.
      summaries = [...built.summaries, ...built.warnings.map(worthKnowing)];
      gasLimit = built.gasLimit;
    } else if (proposal.type === "removeRoleMembers") {
      const rc = proposal.roleRemovalConfig || {};
      const authority = contractAddresses?.membershipAuthorityAddress;
      if (!authority) {
        throw new Error('This group is not using the new roles system yet.');
      }

      // Pin the call target to the live org authority. A localStorage draft is user-controlled and
      // must never be able to override it with a persisted `authority` field.
      const built = buildRoleRemovalBatch({
        authority,
        subjectId: rc.subjectId,
        subjectName: rc.subjectName,
        members: rc.members,
        confirmBans: rc.confirmBans,
        liveReconciled: rc.liveReconciled,
        planningEvidence: extras?.accessV2?.removalPlanning || null,
      });
      const check = checkBatchSubmittable(built.batch);
      if (!check.ok) throw new Error(check.message);

      batches = [built.batch, []];
      numOptions = 2;
      optionNames = ['Remove from role', 'Keep current members'];
      summaries = [...built.summaries, ...built.warnings.map(worthKnowing)];
      gasLimit = built.gasLimit;
    } else if (proposal.type === "setter") {
      // Setter proposal - call contract setter function(s)
      let setterCalls = [];
      const retired = proposal.setterMode === 'advanced'
        ? rawSetterUnavailableReason(proposal)
        : templateUnavailableReason(getTemplateById(proposal.setterTemplate), { authorityEnabled: true });
      if (retired) throw new Error(retired);

      if (proposal.setterMode === 'template' && proposal.setterTemplate) {
        // Template mode
        const template = getTemplateById(proposal.setterTemplate);
        if (!template) {
          throw new Error('That rule change is no longer available. Please choose an action again.');
        }

        const contractKey = template.contract;
        const contextKey = CONTRACT_MAP[contractKey]?.contextKey;
        const contractAddress = contractAddresses?.[contextKey];

        if (!isContractAvailable(contractKey, contractAddresses)) {
          throw new Error(
            `This group doesn't have ${CONTRACT_MAP[contractKey]?.displayName || contractKey} set up, `
            + 'so this change can\'t be applied here.',
          );
        }

        if (template.buildBatch) {
          // Access-v2 template: the builder returns the WHOLE governance batch
          // (several MembershipAuthority calls), the sentences voters read, and
          // the announceWinner gas floor — the shape lib/accessV2/proposalBuilders
          // speaks. The authority address and the org's subjects come from the
          // access-v2 hooks via `extras`.
          const built = template.buildBatch(proposal.setterValues || {}, {
            authority: extras?.accessV2?.authority || contractAddresses?.membershipAuthorityAddress || '',
            subjects: extras?.accessV2?.subjects || [],
            roles: extras?.accessV2?.roles || [],
            groups: extras?.accessV2?.groups || [],
            contractAddresses,
            roleNames,
            projectNames,
          });
          setterCalls = built?.batch || [];
          // Warnings ride with the summaries, as they do for the election and
          // create-role arms — they are the sentences that say what this vote
          // can NOT do, and voters are exactly the people who need them.
          const setterLines = [...(built?.summaries || []), ...(built?.warnings || []).map(worthKnowing)];
          summaries = setterLines.length ? setterLines : null;
          gasLimit = built?.gasLimit || null;
        } else if (template.buildCalls) {
          // Multi-call template (e.g. token name + symbol in one proposal)
          setterCalls = template.buildCalls(proposal.setterValues, contractAddress);
        } else {
          // Single-call template: use functionName + encode
          const funcDef = RAW_FUNCTIONS[contractKey]?.find(f => f.name === template.functionName);
          if (!funcDef) {
            throw new Error(
              `"${template.name}" can't be turned into a vote right now. `
              + 'Nothing was submitted — please pick a different action.',
            );
          }
          const encodedArgs = template.encode(proposal.setterValues);

          setterCalls = [setterCall(contractKey, contractAddress, template.functionName, encodedArgs)];
        }
      } else {
        // Advanced mode: raw function call
        const funcDef = RAW_FUNCTIONS[proposal.setterContract]?.find(
          f => f.name === proposal.setterFunction
        );
        const contextKey = CONTRACT_MAP[proposal.setterContract]?.contextKey;
        const contractAddress = contractAddresses?.[contextKey];

        if (!funcDef) {
          throw new Error('Choose a contract and a function before submitting.');
        }
        // Some calls are only safe through their template, which shows voters what
        // they are approving and verifies it. A raw version would bypass both.
        if (funcDef.templateOnly) {
          throw new Error(
            'That change has to be made through its own action, not a direct contract call, '
            + 'so members can see what they are approving.',
          );
        }
        if (!isContractAvailable(proposal.setterContract, contractAddresses)) {
          throw new Error(
            `This group doesn't have ${CONTRACT_MAP[proposal.setterContract]?.displayName || proposal.setterContract} set up.`,
          );
        }

        // Normalize the same params validateSetterProposal normalized, so the
        // two agree on what a valid paste is.
        const rawArgs = (proposal.setterParams || []).map((arg, i) => (
          funcDef.params[i]?.type === 'bytes32' ? normalizeBytes32(arg) : arg
        ));

        setterCalls = [setterCall(proposal.setterContract, contractAddress, proposal.setterFunction, rawArgs)];
      }

      // A setter proposal with no calls is a no-op that still costs a vote —
      // refuse to build one rather than letting members ratify nothing.
      if (setterCalls.length === 0) {
        throw new Error('This rule change wouldn\'t actually do anything if it passed, so it wasn\'t submitted.');
      }

      batches = [
        setterCalls, // Yes wins: execute setter(s)
        [],          // No wins: do nothing
      ];

      numOptions = 2;
      optionNames = ["Apply Changes", "Reject"];
    } else {
      const filteredOptions = (proposal.options || []).filter(opt => opt.trim() !== '');
      numOptions = filteredOptions.length || 2;
      optionNames = filteredOptions;
      batches = [];
    }

    return { numOptions, batches, optionNames, summaries, gasLimit, createsSubject };
  };
  const handleSubmit = async (eligibilityModuleAddress, contractAddresses = {}, extras = {}) => {
    if (!extras?.accessV2?.enabled || !contractAddresses?.membershipAuthorityAddress) {
      toast({ title: 'Organization permissions are unavailable', description: 'Wait for the current roles to load and try again.', status: 'error' });
      setLoadingSubmit(false);
      return false;
    }
    setLoadingSubmit(true);

    // Access v2: the org's roles live on a MembershipAuthority, so the two Hats reads below
    // (wearership refresh, next-hat-id prediction) have nothing to say about them — the first
    // would report an empty roster for a role that has no hat at all, and the second predicts an
    // id nothing in the batch uses. Both are skipped, and the v2 arms of buildProposalData work
    // from the indexed subjects/memberships in `extras` instead.
    const accessV2Enabled = Boolean(extras?.accessV2?.enabled);

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

      if (proposal.type === "createRole" && !validateCreateRoleProposal(accessV2Enabled)) {
        setLoadingSubmit(false);
        return;
      }

      if (proposal.type === "removeRoleMembers" && !validateRoleRemovalProposal(accessV2Enabled)) {
        setLoadingSubmit(false);
        return;
      }

      if (proposal.type === "normal" && !validateNormalProposal()) {
        setLoadingSubmit(false);
        return;
      }

      const freshHoldersOverride = null;
      const v2FreshAccepted = null;
      let preparedRole = null;
      if (proposal.type === 'createRole') {
        if (!extras.accessV2.roleCreation?.prepareReviewedRole) throw new Error('Review the current role settings before creating this vote.');
        preparedRole = await extras.accessV2.roleCreation.prepareReviewedRole(resolveRoleForm(proposal));
        if (typeof preparedRole?.revalidate !== 'function') throw new Error('Review the current role settings before creating this vote.');
      }
      const hatsProtocolAddress = null;
      const predictedRoleHatId = null;
      const metadataCIDBytes32 = null;
      let preparedExtras = preparedRole ? { ...extras, accessV2: { ...extras.accessV2, preparedRole } } : extras;
      if (proposal.type === 'election' || proposal.type === 'removeRoleMembers') {
        const key = proposal.type === 'election' ? 'electionPlanning' : 'removalPlanning';
        const reviewed = extras.accessV2[key];
        if (!reviewed || !extras.accessV2.refreshGovernancePlanning) throw new Error('Review the current role choices before creating this vote.');
        const fresh = await extras.accessV2.refreshGovernancePlanning();
        preparedExtras = { ...extras, accessV2: { ...extras.accessV2, [key]: {
          ...fresh, expectedFingerprint: reviewed.expectedFingerprint, confirmedBans: reviewed.confirmedBans,
        } } };
      }

      if (proposal.type === 'transferFunds') {
        const token = proposal.transferToken ? getTokenByAddress(proposal.transferToken) : null;
        const decimals = token ? token.decimals : (orgNetwork?.nativeCurrency?.decimals ?? 18);
        if (extras.treasury?.transferDecimals !== decimals) throw new Error('The payment asset changed. Review this move again.');
        const planningEvidence = await refreshReviewedTreasuryTransfer({
          reviewed: extras.treasury?.planningEvidence, refetch: extras.treasury?.refetch,
          scope: { chainId: orgChainId, orgId: extras.accessV2.orgId,
            contracts: { executor: contractAddresses.treasuryContractAddress || contractAddresses.executorContractAddress,
              paymentManager: contractAddresses.paymentManagerAddress } },
          request: { source: proposal.transferSource, token: token?.address || '', decimals,
            symbol: token?.symbol || nativeCurrencySymbol, amount: String(proposal.transferAmount),
            recipient: proposal.transferAddress, paymentManagerAddress: contractAddresses.paymentManagerAddress,
            finalizeIds: proposal.transferFinalizeIds || [], destination: proposal.transferDestination },
        });
        preparedExtras = { ...extras, treasury: { ...extras.treasury, planningEvidence } };
      }

      const {
        numOptions, batches, optionNames, summaries: builtSummaries, gasLimit, createsSubject,
      } = buildProposalData(
        eligibilityModuleAddress,
        contractAddresses,
        freshHoldersOverride,
        hatsProtocolAddress,
        predictedRoleHatId,
        metadataCIDBytes32,
        v2FreshAccepted
          ? { ...preparedExtras, accessV2: { ...(preparedExtras?.accessV2 || {}), freshAccepted: v2FreshAccepted } }
          : preparedExtras,
      );

      // Form collects hours; contract ABI expects minutes (uint32 minutesDuration).
      // Math.round avoids FP slop (e.g., 0.5 * 60 = 30, not 29.999...).
      const durationHours = Number(proposal.time);
      const durationMinutes = Math.max(1, Math.round(durationHours * 60));

      // Auto-fill title/description from setter template preview when the
      // user left them blank. User-entered text always wins. This is what
      // voters see in the proposal list and modal — without it, a "Change
      // token name to FOO" setter proposal would render with a blank title
      // and meaningless description.
      let finalName = (proposal.name || '').trim();
      let finalDescription = (proposal.description || '').trim();
      if (
        proposal.type === 'setter'
        && proposal.setterMode === 'template'
        && proposal.setterTemplate
      ) {
        // Last-resort backstop only: the wizard writes title + description when
        // the action is picked and keeps the description in sync as params change
        // (SetterActionSelector -> applyAutoCopy), so these are normally already
        // set. This catches a draft restored without them.
        const tmpl = getTemplateById(proposal.setterTemplate);
        const copy = buildSetterCopy(tmpl, proposal.setterValues || {}, {}, {});
        if (!finalName && copy.title) finalName = copy.title.trim();
        if (!finalDescription && copy.description) finalDescription = copy.description.trim();
      }

      // Forward-compatible: human-readable action previews for the uploaded
      // metadata JSON. Additive only — does NOT alter numOptions/batches/
      // optionNames or any on-chain param. Safe for VotingService to thread
      // into _uploadProposalMetadata; ignored by callers that don't forward it.
      // A builder that knows what its calls do (treasury transfers, access-v2
      // templates) describes them itself; the per-type fallback covers the rest.
      const actionSummaries = (builtSummaries && builtSummaries.length > 0)
        ? builtSummaries
        : buildActionSummaries();

      const roleTicket = preparedRole && extras.accessV2.roleCreation.beginRoleSubmission?.(preparedRole, resolveRoleForm(proposal));
      const tracker = preparedRole && extras.accessV2.roleCreation.trackRoleSubmission?.(roleTicket, preparedRole);
      let submitted;
      let callbackEntered = false;
      try {
        if (roleTicket) context.retainRoleContinuation?.(roleTicket.id);
        callbackEntered = true;
        const submission = {
        name: finalName,
        description: finalDescription,
        time: durationMinutes,
        numOptions,
        batches,
        optionNames,
        actionSummaries,
        createsSubject,
        promotedFrom: proposal.promotedFrom,
        extensions: proposal.extensions,
        // announceWinner gas floor the page parks against the created id (null
        // when the type has no builder — the page then uses a generous default).
        gasLimit: gasLimit || null,
        type: proposal.type,
        transferAddress: proposal.transferAddress,
        transferAmount: proposal.transferAmount,
        transferDestination: proposal.transferDestination,
        electionRoleId: proposal.electionRoleId,
        electionCandidates: proposal.electionCandidates,
        electionIncludeNoOneOption: proposal.electionIncludeNoOneOption,
        // Setter proposal fields
        setterContract: proposal.setterContract,
        setterTemplate: proposal.setterTemplate,
        // Create-role proposal fields
        roleConfig: proposal.roleConfig,
        predictedRoleHatId,
        // Transient authority evidence is re-observed after proposal content is saved.
        roleRemovalConfig: proposal.roleRemovalConfig,
        governancePlanning: preparedExtras.accessV2.electionPlanning || preparedExtras.accessV2.removalPlanning,
        electionSelectedIncumbents: proposal.electionSelectedIncumbents,
        electionConfirmBans: proposal.electionConfirmBans,
        electionFallbackRoleId: proposal.electionFallbackRoleId,
        // Voting restrictions
        hatIds: proposal.isRestricted ? proposal.restrictedHatIds : [],
      };
        if (proposal.type === 'election' || proposal.type === 'removeRoleMembers') {
          submission.beforeExecute = createGovernanceSubmissionGuard(submission,
            proposal.type === 'election' ? extras.accessV2.electionPlanning : extras.accessV2.removalPlanning,
            extras.accessV2.refreshGovernancePlanning);
        }
        submitted = await onSubmit(submission, tracker); } catch (error) {
        if (!tracker?.completed) extras.accessV2.roleCreation?.finishRoleSubmission?.(roleTicket, { success: false, error,
          ...(!callbackEntered || error?.roleSubmissionState === 'not-submitted' ? { submissionState: 'not-submitted' } : {}) });
        throw error;
      } finally { tracker?.stop(); }
      if (roleTicket && !tracker?.completed) extras.accessV2.roleCreation.finishRoleSubmission(roleTicket, submitted);

      // The page's submit handler answers `false` when the transaction did not
      // land (it has already shown the failure). A resolved promise used to be
      // read as success here — form reset, draft wiped, green toast — over a
      // revert. Keep the member's work and let them retry.
      if (submitted === false || submitted?.success === false || roleTicket && submitted?.success !== true) {
        setLoadingSubmit(false);
        return false;
      }

      setLoadingSubmit(false);
      resetForm();

      let successDescription;
      if (proposal.type === "transferFunds") {
        const payoutSymbol = proposal.transferToken
          ? getTokenByAddress(proposal.transferToken).symbol
          : nativeCurrencySymbol;
        successDescription = proposal.transferDestination === TRANSFER_DESTINATION.BOUNTY_POOL
          ? `Vote created. If Yes wins, ${proposal.transferAmount} ${payoutSymbol} moves from the treasury to the ${BOUNTY_POOL_LABEL}.`
          : `Transfer proposal created. If Yes wins, ${proposal.transferAmount} ${payoutSymbol} will be sent to ${proposal.transferAddress.slice(0, 6)}...${proposal.transferAddress.slice(-4)}`;
      } else if (proposal.type === "election") {
        // On a v2 org a winner who isn't in the group yet gets an invitation to accept rather
        // than the seat itself, so the flat "receives the role automatically" would be a lie.
        successDescription = accessV2Enabled
          ? `Election created with ${proposal.electionCandidates.length} candidates. The winner is added to the role automatically — anyone not in the group yet is invited to accept it.`
          : `Election created with ${proposal.electionCandidates.length} candidates. The winner will receive the role automatically.`;
      } else if (proposal.type === "setter") {
        const template = getTemplateById(proposal.setterTemplate);
        const actionName = template?.name || proposal.setterFunction || 'settings change';
        successDescription = `Settings change proposal created. If approved, "${actionName}" will be executed automatically.`;
      } else if (proposal.type === "createRole") {
        // "Minted" is Hats language, and on a v2 org someone outside the group is INVITED rather
        // than added — say what actually happens. A v2 org can also be creating a GROUP, which has
        // no members of its own at all.
        if (accessV2Enabled) {
          const form = resolveRoleForm(proposal);
          const holderCount = (form.holders || []).length;
          successDescription = preparedRole?.stage === 'existing'
            ? `Configuration vote submitted for “${form.name}”. Your settings take effect after this vote passes and runs.`
            : preparedRole?.requiresConfiguration
              ? `Step 1 submitted for “${form.name}”. After this vote passes and runs, use Finish configuration on the voting page for the saved settings.`
              : form.kind === ROLE_FORM_KIND.GROUP
                ? `Create-group proposal submitted for “${form.name || 'new group'}”.`
                : `Create-role proposal submitted for “${form.name || 'new role'}”${holderCount ? ` with ${holderCount} starting members` : ''}.`;

        } else {
          const wearerCount = (proposal.roleConfig?.initialWearers || []).length;
          successDescription = `Create-role proposal submitted for "${proposal.roleConfig?.name || 'new role'}". If approved, the role will be created${wearerCount ? ` and minted to ${wearerCount} member(s)` : ''}.`;
        }
      } else if (proposal.type === "removeRoleMembers") {
        const count = proposal.roleRemovalConfig?.members?.length || 0;
        successDescription = `Role-removal proposal created for ${count} ${count === 1 ? 'person' : 'people'}. If approved, the selected removals will run together.`;
      } else {
        successDescription = "Your proposal has been created successfully.";
      }

      toast({
        title: "Vote created",
        description: successDescription,
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      return true;
    } catch (error) {
      console.warn("[Voting] proposal preparation was unsuccessful");
      toast({
        title: error?.code === 'ROLE_OPERATION_UNAVAILABLE' ? 'Role settings unavailable' : 'Error',
        description: error.message || "Failed to create proposal.",
        status: error?.code === 'ROLE_OPERATION_UNAVAILABLE' ? 'warning' : 'error',
        duration: 5000,
        isClosable: true,
      });
      setLoadingSubmit(false);
      return false;
    }
  };
  return handleSubmit(...args);
}
