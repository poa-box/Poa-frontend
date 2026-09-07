import { utils, providers as ethersProviders, Contract as EthersContract } from 'ethers';
import MembershipAuthorityABI from '../../../abi/MembershipAuthority.json';
import { RAW_FUNCTIONS, CONTRACT_MAP, getTemplateById, buildSetterCopy, isContractAvailable, normalizeBytes32 } from '@/config/setterDefinitions';

import { getInfrastructureAddress, CONTRACT_NAMES } from '@/config/contracts';
import { createHatsService } from '@/services/web3/domain/HatsService';
import { ipfsCidToBytes32 } from '@/services/web3/utils/encoding';
import { getTokenByAddress } from '@/util/tokens';
import { TRANSFER_DESTINATION, TRANSFER_SOURCE, BOUNTY_POOL_LABEL, buildTreasuryTransferBatch, transferOptionNames } from '@/lib/voting/treasuryBatches';

import {
  buildV2ElectionBatches,
  acceptedHoldersOf,
} from '@/lib/voting/v2VoteActions';
import { buildRoleFormBatch, resolveRoleForm, ROLE_FORM_KIND } from '@/lib/accessV2/roleFormBatch';

import { buildRoleRemovalBatch } from '@/lib/accessV2/proposalBuilders';
import { checkBatchSubmittable } from '@/lib/accessV2/submission';
import { usesEmailEligibility } from '@/lib/accessV2/joinConfig';

import { withFreshAcceptance, resolveV2SubjectName } from '@/lib/voting/proposalRuntimeHelpers';
const worthKnowing = (w) => `Worth knowing: ${w}`;

export async function submitProposalRuntime(context, ...args) {
  const { proposal, orgNetwork, nativeCurrencySymbol, roleNames, projectNames, setLoadingSubmit, validateBasicFields, validateTransferProposal, validateElectionProposal, validateNormalProposal, validateSetterProposal, validateCreateRoleProposal, validateRoleRemovalProposal, buildActionSummaries, onSubmit, resetForm, toast, orgChainId, addToIpfs } = context;
  const buildProposalData = (eligibilityModuleAddress, contractAddresses, freshHoldersOverride = null, hatsProtocolAddress = null, predictedRoleHatId = null, metadataCIDBytes32 = null, extras = {}) => {
    let numOptions;
    let batches = [];
    let optionNames = [];
    let summaries = null;
    let gasLimit = null;

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
      // Who holds the seat is a CONTRACT precondition here, not a nicety: `grant` reverts
      // AlreadyMember and `remove` reverts NotMember, and either one silently voids the whole
      // winning batch. Refuse to encode a ballot from a roster we have not read yet.
      if (!Array.isArray(v2.memberships) || v2.memberships.length === 0) {
        throw new Error(
          'We’re still reading who holds this group’s roles. Give it a moment and try again.'
        );
      }
      const built = buildV2ElectionBatches({
        authority: v2.authority || contractAddresses?.membershipAuthorityAddress,
        subjectId: proposal.electionRoleId,
        subjectName: resolveV2SubjectName(v2, proposal.electionRoleId),
        candidates: proposal.electionCandidates || [],
        selectedIncumbents: proposal.electionSelectedIncumbents || [],
        // The mirror's roster, corrected by the on-chain read handleSubmit just made for the
        // addresses on this ballot (`freshAccepted`): chain truth wins for those, the mirror
        // fills in everyone else.
        acceptedHolders: withFreshAcceptance(
          acceptedHoldersOf(v2.memberships, proposal.electionRoleId),
          v2.freshAccepted?.[String(proposal.electionRoleId)],
        ),
        includeNoOneOption: Boolean(proposal.electionIncludeNoOneOption),
        inOrgUsers: v2.inOrgUsers,
        fallbackSubjectId: proposal.electionFallbackRoleId || '',
        fallbackSubjectName: proposal.electionFallbackRoleId
          ? resolveV2SubjectName(v2, proposal.electionFallbackRoleId)
          : '',
        fallbackAcceptedHolders: proposal.electionFallbackRoleId
          ? withFreshAcceptance(
            acceptedHoldersOf(v2.memberships, proposal.electionFallbackRoleId),
            v2.freshAccepted?.[String(proposal.electionFallbackRoleId)],
          )
          : null,
      });
      batches = built.batches;
      optionNames = built.optionNames;
      numOptions = optionNames.length;
      // Warnings ride along with the summaries: they are the sentences that say what this ballot
      // can NOT do (a departed incumbent, a fallback that had to be dropped), and voters are
      // exactly the people who need to read them.
      summaries = [...built.summaries, ...built.warnings.map(worthKnowing)];
      gasLimit = built.gasLimit;
    } else if (proposal.type === "election") {
      // Election proposal - each candidate is an option
      // When they win: revoke hat from current holders who lost, mint to winner
      numOptions = proposal.electionCandidates.length;
      optionNames = proposal.electionCandidates.map(c => c.name);

      const iface = new utils.Interface([
        "function mintHatToAddress(uint256 hatId, address wearer)",
        "function setWearerEligibility(address wearer, uint256 hatId, bool eligible, bool standing)",
        // EligibilityModule v2: surgically zero a single wearer's vouch state
        // for one hat. Combined with the eligibility revoke, this fully blocks
        // an election loser from re-claiming via claimVouchedHat — without
        // affecting any other wearer or the org's vouching config.
        "function clearWearerVouches(address wearer, uint256 hatId)"
      ]);
      // Hats Protocol — used for the 1-incumbent transfer optimization. When
      // exactly one incumbent is being replaced by a candidate who doesn't
      // already hold the role, we use Hats.transferHat to atomically move the
      // slot. transferHat does NOT decrement supply (just moves the balance)
      // so it works for capped-supply hats (e.g. KUBI's Executive at 10/10)
      // AND it bypasses the eligibility module's getWearerStatus check on the
      // FROM side — vouching can't keep an incumbent in their seat. Verified
      // on a Gnosis fork against KUBI's actual contracts.
      const hatsIface = new utils.Interface([
        "function transferHat(uint256 hatId, address from, address to)"
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
        const candidateLower = candidate.address.toLowerCase();
        const otherIncumbents = selectedIncumbents.filter(
          i => i.address.toLowerCase() !== candidateLower
        );
        const candidateAlreadyHolds = allHolders.some(
          h => h.address.toLowerCase() === candidateLower
        );

        // 1-incumbent transfer optimization: when exactly one incumbent is
        // being replaced by a candidate who doesn't already hold the role,
        // use Hats.transferHat. Atomic, supply-preserving, and works through
        // vouching gates. For 0 or 2+ incumbents, fall back to the legacy
        // setEligibility(revoke) + mint flow (best-effort for vouching-gated
        // hats — KUBI's Executive transfer requires this 1-incumbent path).
        const useTransferHat =
          Boolean(hatsProtocolAddress) &&
          otherIncumbents.length === 1 &&
          !candidateAlreadyHolds;
        const transferSourceLower = useTransferHat
          ? otherIncumbents[0].address.toLowerCase()
          : null;

        selectedIncumbents.forEach(incumbent => {
          const incumbentLower = incumbent.address.toLowerCase();
          if (incumbentLower === candidateLower) return; // skip self

          // Revoke the elected hat from the incumbent.
          // Even when we're going to transferHat from this incumbent, the
          // explicit revoke is still required: transferHat moves the token
          // but leaves wearerRules untouched, so the loser could call
          // claimVouchedHat or otherwise re-acquire if a slot opens up.
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

          // Surgical vouch clear (EligibilityModule v2). Without this, a
          // vouched-in incumbent can still pass getWearerStatus's vouch path
          // and re-claim if supply opens up (combineWithHierarchy=true ORs
          // hierarchy with vouching). Calling clearWearerVouches sets the
          // incumbent's wearerVouchEpoch to a sentinel that won't match the
          // config epoch — their effective vouch count for THIS hat becomes 0.
          // No effect on other wearers; org-wide vouching stays enabled.
          //
          // Wrapped in try/catch at execute-time semantics by the EligibilityModule's
          // ABI: if the deployed impl is pre-v2 (no clearWearerVouches), the
          // call would revert and bubble up via Executor.CallFailed. Frontend
          // assumes v2 has shipped (per the EligibilityModule upgrade PR);
          // gate by version-detect if needed for staged rollout.
          batch.push({
            target: eligibilityModuleAddress,
            value: "0",
            data: iface.encodeFunctionData("clearWearerVouches", [
              incumbent.address,
              proposal.electionRoleId,
            ]),
          });

          // Fallback role handling (independent of transfer optimization).
          if (fallbackRoleId) {
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
            const alreadyHoldsFallback = fallbackHolders.some(
              addr => addr.toLowerCase() === incumbentLower
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
        });

        // Grant the candidate eligibility on the elected hat. Required by
        // both transferHat's isEligible(to) check and mintHatToAddress's
        // EligibilityModule check. Idempotent — safe if already eligible.
        batch.push({
          target: eligibilityModuleAddress,
          value: "0",
          data: iface.encodeFunctionData("setWearerEligibility", [
            candidate.address,
            proposal.electionRoleId,
            true,
            true,
          ]),
        });

        // Final move: transferHat (1-incumbent case) or mint.
        if (useTransferHat) {
          batch.push({
            target: hatsProtocolAddress,
            value: "0",
            data: hatsIface.encodeFunctionData("transferHat", [
              proposal.electionRoleId,
              otherIncumbents[0].address,
              candidate.address,
            ]),
          });
        } else if (!candidateAlreadyHolds) {
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
    } else if (proposal.type === "createRole" && extras?.accessV2?.enabled) {
      // ── CREATE ROLE (or GROUP), access-v2 org ──
      // The legacy arm below SUCCEEDS here, which is worse than reverting: it mints an inert
      // legacy hat and writes the TaskManager ROLE_PERM / HybridVoting creator tables that both
      // contracts stop reading the moment an authority is set. One authority batch instead —
      // built by `lib/accessV2/roleFormBatch`, the SAME encoder /team's "Create a role or group"
      // modal uses, with the new subject's id predicted from the indexed subjects rather than
      // Hats.getNextId, and (unlike the legacy arm) the `addHatToClass` call that is the only
      // thing giving the new role a vote in binding votes.
      const v2 = extras.accessV2;
      // `inOrgUsers` decides whether each starting holder is SEATED (`grant`) or merely INVITED
      // (`offer`, needs a claim) — an on-chain difference. An empty roster while the memberships
      // query is still loading or has errored would invite people who should be seated, while
      // the toast says they were given the role. Same rule as the election arm.
      const holdersWanted = (resolveRoleForm(proposal).holders || []).some((h) => h?.address);
      if (holdersWanted && (!Array.isArray(v2.memberships) || v2.memberships.length === 0)) {
        throw new Error(
          'We’re still reading who is in this org — it decides whether each starting holder is '
          + 'seated or invited. Give it a moment and try again.'
        );
      }
      const built = buildRoleFormBatch({
        ...v2.roleCreation,
        authority: v2.authority || contractAddresses?.membershipAuthorityAddress,
        hybridVoting: contractAddresses?.votingContractAddress || '',
        taskManagerAddress: contractAddresses?.taskManagerContractAddress || '',
        // Prediction must see EVERY indexed subject, including the structural ones no surface
        // renders — a hidden id still consumed a sequence number.
        indexedSubjects: (v2.indexedSubjects?.length ? v2.indexedSubjects : v2.subjects) || [],
        activeProposals: v2.activeProposals || [],
        inOrgUsers: v2.inOrgUsers,
        votingClasses: v2.votingClasses || [],
        // The same resolution the validator ran, so a proposal can never pass validation
        // describing one thing and encode another.
        form: resolveRoleForm(proposal),
        metadataCID: metadataCIDBytes32,
        emailAllowlist: v2.emailAllowlist,
      });
      // The on-chain call ceiling is a gate, not a warning: HybridVoting reverts `TooManyCalls`
      // at CREATION, after the IPFS upload and — for a passkey member — a burned UserOp.
      if (built.submittable && !built.submittable.ok) {
        throw new Error(built.submittable.message || 'This proposal has too many steps to submit in one vote.');
      }
      batches = [built.batch, []];   // Yes wins: create + configure. No wins: nothing.
      numOptions = 2;
      optionNames = built.kind === ROLE_FORM_KIND.GROUP
        ? ['Create group', 'Reject']
        : ['Create role', 'Reject'];
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
      });
      const check = checkBatchSubmittable(built.batch);
      if (!check.ok) throw new Error(check.message);

      batches = [built.batch, []];
      numOptions = 2;
      optionNames = ['Remove from role', 'Keep current members'];
      summaries = [...built.summaries, ...built.warnings.map(worthKnowing)];
      gasLimit = built.gasLimit;
    } else if (proposal.type === "createRole") {
      // Create-role proposal — a single winning batch that calls:
      //   1. EligibilityModule.createHatWithEligibility(params)
      //   2. EligibilityModule.configureVouching(predictedHatId, ...)        (optional)
      //   3. HybridVoting.setCreatorHatAllowed(predictedHatId, true)         (optional)
      //   4. TaskManager.setProjectRolePerm(pid, predictedHatId, mask)       (per project)
      //   5. TaskManager.setConfig(ROLE_PERM/CREATOR_HAT/ORGANIZER_HAT, ...) (org-wide)
      //   6. EligibilityModule.updateHatMetadata(predictedHatId, name, cid)  (if description)
      //
      // predictedRoleHatId is pre-computed in handleSubmit via Hats.getNextId.
      // Race condition: a sibling hat created under the same parent between
      // submit and execution shifts the real id; ALL downstream calls (2-6)
      // then point at the wrong hat. The configurator surfaces a warning when
      // another active createRole proposal targets the same parent.
      const rc = proposal.roleConfig || {};
      const wearers = rc.initialWearers || [];
      const projectPerms = rc.projectPerms || [];

      const hatParams = [
        rc.parentHatId,
        rc.name || '',
        Number(rc.maxSupply) || 1,
        Boolean(rc.mutable),
        rc.imageURI || '',
        Boolean(rc.defaultEligible),
        Boolean(rc.defaultStanding),
        wearers.map(w => w.address),
        wearers.map(w => Boolean(w.eligible ?? rc.defaultEligible)),
        wearers.map(w => Boolean(w.standing ?? rc.defaultStanding)),
      ];

      const elIface = new utils.Interface([
        {
          type: 'function',
          name: 'createHatWithEligibility',
          stateMutability: 'nonpayable',
          inputs: [{
            name: 'params',
            type: 'tuple',
            components: [
              { name: 'parentHatId', type: 'uint256' },
              { name: 'details', type: 'string' },
              { name: 'maxSupply', type: 'uint32' },
              { name: '_mutable', type: 'bool' },
              { name: 'imageURI', type: 'string' },
              { name: 'defaultEligible', type: 'bool' },
              { name: 'defaultStanding', type: 'bool' },
              { name: 'mintToAddresses', type: 'address[]' },
              { name: 'wearerEligibleFlags', type: 'bool[]' },
              { name: 'wearerStandingFlags', type: 'bool[]' },
            ],
          }],
          outputs: [{ name: 'newHatId', type: 'uint256' }],
        },
        'function configureVouching(uint256 hatId, uint32 quorum, uint256 membershipHatId, bool combineWithHierarchy)',
        'function updateHatMetadata(uint256 hatId, string name, bytes32 metadataCID)',
      ]);

      const hvIface = new utils.Interface([
        'function setCreatorHatAllowed(uint256 h, bool ok)',
      ]);

      const tmIface = new utils.Interface([
        'function setProjectRolePerm(bytes32 pid, uint256 hatId, uint8 mask)',
        'function setConfig(uint8 key, bytes value)',
      ]);

      const batch = [];

      // 1. Create the hat
      batch.push({
        target: eligibilityModuleAddress,
        value: '0',
        data: elIface.encodeFunctionData('createHatWithEligibility', [hatParams]),
      });

      // 2. Vouching config (downstream calls need the predicted hatId)
      if (rc.vouching?.enabled && predictedRoleHatId) {
        const voucherHatId = rc.vouching.selfVouch ? predictedRoleHatId : rc.vouching.voucherHatId;
        batch.push({
          target: eligibilityModuleAddress,
          value: '0',
          data: elIface.encodeFunctionData('configureVouching', [
            predictedRoleHatId,
            Number(rc.vouching.quorum) || 1,
            voucherHatId,
            Boolean(rc.vouching.combineWithHierarchy),
          ]),
        });
      }

      // 3. Proposal-creator permission on HybridVoting
      if (rc.canVote && predictedRoleHatId) {
        const hybridAddr = contractAddresses?.votingContractAddress
          || contractAddresses?.hybridVotingContractAddress;
        if (hybridAddr) {
          batch.push({
            target: hybridAddr,
            value: '0',
            data: hvIface.encodeFunctionData('setCreatorHatAllowed', [predictedRoleHatId, true]),
          });
        }
      }

      const taskManagerAddr = contractAddresses?.taskManagerContractAddress;

      // 4. Per-project permission overrides
      if (projectPerms.length > 0 && predictedRoleHatId && taskManagerAddr) {
        for (const p of projectPerms) {
          batch.push({
            target: taskManagerAddr,
            value: '0',
            data: tmIface.encodeFunctionData('setProjectRolePerm', [
              p.projectId,
              predictedRoleHatId,
              Number(p.mask) || 0,
            ]),
          });
        }
      }

      // 5. Org-wide task-system grants via TaskManager.setConfig.
      //    Mirrors setterDefinitions.js: ROLE_PERM (global mask), CREATOR_HAT_ALLOWED
      //    (create projects/tasks), ORGANIZER_HAT_ALLOWED (reorganize folder tree).
      if (taskManagerAddr && predictedRoleHatId) {
        const ROLE_PERM_KEY = 2;       // TaskManager ConfigKey.ROLE_PERM
        const CREATOR_HAT_KEY = 1;     // TaskManager ConfigKey.CREATOR_HAT_ALLOWED
        const ORGANIZER_HAT_KEY = 7;   // TaskManager ConfigKey.ORGANIZER_HAT_ALLOWED

        const globalPerms = Number(rc.globalPerms) || 0;
        if (globalPerms > 0) {
          batch.push({
            target: taskManagerAddr,
            value: '0',
            data: tmIface.encodeFunctionData('setConfig', [
              ROLE_PERM_KEY,
              utils.defaultAbiCoder.encode(['uint256', 'uint8'], [predictedRoleHatId, globalPerms]),
            ]),
          });
        }
        if (rc.canCreateTasks) {
          batch.push({
            target: taskManagerAddr,
            value: '0',
            data: tmIface.encodeFunctionData('setConfig', [
              CREATOR_HAT_KEY,
              utils.defaultAbiCoder.encode(['uint256', 'bool'], [predictedRoleHatId, true]),
            ]),
          });
        }
        if (rc.canOrganizeFolders) {
          batch.push({
            target: taskManagerAddr,
            value: '0',
            data: tmIface.encodeFunctionData('setConfig', [
              ORGANIZER_HAT_KEY,
              utils.defaultAbiCoder.encode(['uint256', 'bool'], [predictedRoleHatId, true]),
            ]),
          });
        }
      }

      // 6. Role metadata — set name + description on-chain via Hats metadata.
      //    updateHatMetadata stores the IPFS CID in the hat details (requires a
      //    mutable hat) and emits HatMetadataUpdated, which the subgraph indexes
      //    into hat.name + hat.metadata.description. No contract changes needed.
      //    metadataCIDBytes32 is computed in handleSubmit (IPFS upload).
      if (metadataCIDBytes32 && predictedRoleHatId) {
        batch.push({
          target: eligibilityModuleAddress,
          value: '0',
          data: elIface.encodeFunctionData('updateHatMetadata', [
            predictedRoleHatId,
            rc.name || '',
            metadataCIDBytes32,
          ]),
        });
      }

      batches = [batch, []];   // Yes wins: create + configure. No wins: nothing.
      numOptions = 2;
      optionNames = ['Create role', 'Reject'];
    } else if (proposal.type === "setter") {
      // Setter proposal - call contract setter function(s)
      let setterCalls = [];

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
          const iface = new utils.Interface([funcDef.signature]);
          const encodedArgs = template.encode(proposal.setterValues);

          setterCalls = [{
            target: contractAddress,
            value: "0",
            data: iface.encodeFunctionData(template.functionName, encodedArgs),
          }];
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

        const iface = new utils.Interface([funcDef.signature]);
        // Normalize the same params validateSetterProposal normalized, so the
        // two agree on what a valid paste is.
        const rawArgs = (proposal.setterParams || []).map((arg, i) => (
          funcDef.params[i]?.type === 'bytes32' ? normalizeBytes32(arg) : arg
        ));

        setterCalls = [{
          target: contractAddress,
          value: "0",
          data: iface.encodeFunctionData(proposal.setterFunction, rawArgs),
        }];
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

    return { numOptions, batches, optionNames, summaries, gasLimit };
  };
  const handleSubmit = async (eligibilityModuleAddress, contractAddresses = {}, extras = {}) => {
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

      // For elections, re-read hat wearership on-chain right before building
      // batches. Stale form state previously caused AlreadyWearingHat reverts
      // (mint calls were emitted for wearers who already held the hat).
      //
      // We construct a JsonRpcProvider scoped to the ORG chain rather than
      // using the wallet's provider — for cross-chain users (passkey, or an
      // EOA whose wallet is on a different chain) the wallet provider would
      // read the wrong chain's state. Mirrors the read pattern in
      // features/deployer/CreatePage.jsx.
      let freshHoldersOverride = null;
      // ACCESS V2: the same freshness rule, against the MembershipAuthority. The subgraph fold
      // mirror lags the chain, and on v2 the preconditions are harsher and all silent —
      // `grant` reverts AlreadyMember, `remove` reverts NotMember, and announceWinner swallows
      // both — so the candidates' and incumbents' acceptance is re-read on chain right before
      // the batch is built. Only the addresses in the ballot are read; the rest of the roster
      // still comes from the mirror.
      let v2FreshAccepted = null;
      if (proposal.type === "election" && accessV2Enabled) {
        const authorityAddr = extras?.accessV2?.authority || contractAddresses?.membershipAuthorityAddress;
        if (authorityAddr && orgNetwork?.rpcUrl && orgChainId) {
          try {
            const readProvider = new ethersProviders.JsonRpcProvider(
              orgNetwork.rpcUrl,
              { chainId: orgChainId, name: orgNetwork.name || `chain-${orgChainId}` }
            );
            const authority = new EthersContract(authorityAddr, MembershipAuthorityABI, readProvider);
            const readAccepted = async (subjectId, addresses) => {
              const out = {};
              const unique = [...new Set(addresses.filter(Boolean).map((a) => String(a).toLowerCase()))];
              await Promise.all(unique.map(async (addr) => {
                const status = await authority.getStatus(subjectId, addr);
                out[addr] = Boolean(status?.accepted ?? status?.[0]);
              }));
              return out;
            };
            const candidateAddrs = (proposal.electionCandidates || []).map((c) => c.address);
            const incumbentAddrs = (proposal.electionSelectedIncumbents || []).map((i) => i.address);
            v2FreshAccepted = {
              [String(proposal.electionRoleId)]: await readAccepted(
                proposal.electionRoleId,
                [...candidateAddrs, ...incumbentAddrs],
              ),
            };
            if (proposal.electionFallbackRoleId) {
              v2FreshAccepted[String(proposal.electionFallbackRoleId)] = await readAccepted(
                proposal.electionFallbackRoleId,
                incumbentAddrs,
              );
            }
          } catch (err) {
            console.error('[useProposalForm] Authority roster refresh failed:', err);
            toast({
              title: "Cannot verify current role holders",
              description: "Could not read the roles contract. Please try again.",
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            setLoadingSubmit(false);
            return;
          }
        }
      }
      if (proposal.type === "election" && !accessV2Enabled) {
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

      const hatsProtocolAddress = getInfrastructureAddress(CONTRACT_NAMES.HATS_PROTOCOL, orgChainId) || null;

      // Pre-compute the new role's hat ID via Hats.getNextId(parent). This
      // lets the same batch chain configureVouching / setCreatorHatAllowed /
      // setProjectRolePerm against the new role. The id is deterministic
      // (parent || childIndex bit-packing), so as long as no sibling hat is
      // created under the same parent between submit and execution, the
      // prediction is accurate. The configurator warns when a concurrent
      // createRole proposal targets the same parent.
      let predictedRoleHatId = null;
      if (proposal.type === 'createRole' && !accessV2Enabled) {
        const parentHatId = proposal.roleConfig?.parentHatId;
        if (hatsProtocolAddress && orgNetwork?.rpcUrl && orgChainId && parentHatId) {
          try {
            const readProvider = new ethersProviders.JsonRpcProvider(
              orgNetwork.rpcUrl,
              { chainId: orgChainId, name: orgNetwork.name || `chain-${orgChainId}` }
            );
            const hats = createHatsService(readProvider);
            const nextId = await hats.getNextId(hatsProtocolAddress, parentHatId);
            predictedRoleHatId = nextId.toString();
          } catch (err) {
            console.error('[useProposalForm] Hats.getNextId failed:', err);
            toast({
              title: "Cannot predict new role's hat ID",
              description: "Could not read Hats Protocol to pre-compute the new role's ID. Please try again.",
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            setLoadingSubmit(false);
            return;
          }
        } else {
          toast({
            title: "Missing infrastructure config",
            description: "Hats Protocol address or RPC is not configured for this chain.",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          setLoadingSubmit(false);
          return;
        }
      }

      // Create-role only: persist the role's name + description on-chain via the
      // Hats metadata pattern. Upload { name, description } to IPFS, encode the CID
      // to bytes32, and let buildProposalData append an updateHatMetadata call (the
      // subgraph indexes it into hat.name + hat.metadata.description).
      // Gated on description only: the hat image is already stored via
      // createHatWithEligibility's imageURI, and the subgraph metadata parser reads
      // name + description only — so an image would add on-chain cost for no effect.
      // updateHatMetadata calls changeHatDetails, which requires a mutable hat — so
      // only attempt it when the role is mutable.
      //
      // ACCESS V2: the CID is an argument of `createRole` itself, so there is no second metadata
      // call and no mutability precondition — the description alone decides whether we upload.
      let metadataCIDBytes32 = null;
      if (proposal.type === 'createRole') {
        // The v2 screen writes `roleFormV2` (and can be making a GROUP), the legacy one writes
        // `roleConfig`. `resolveRoleForm` is the same resolution the validator and the encoder
        // use, so the description that gets uploaded is the description that gets proposed.
        const rc = accessV2Enabled ? resolveRoleForm(proposal) : (proposal.roleConfig || {});
        if (rc.description?.trim() && (accessV2Enabled || rc.mutable)) {
          try {
            const result = await addToIpfs(JSON.stringify({
              name: rc.name || '',
              description: rc.description || '',
            }));
            if (accessV2Enabled && !result?.path) throw new Error('The description upload did not return a content address.');
            if (result?.path) {
              metadataCIDBytes32 = ipfsCidToBytes32(result.path);
            }
          } catch (err) {
            console.error('[useProposalForm] role metadata IPFS upload failed:', err);
            toast({
              title: 'Could not save role description',
              description: 'Failed to upload role metadata to IPFS. Please try again.',
              status: 'error',
              duration: 5000,
              isClosable: true,
            });
            setLoadingSubmit(false);
            return;
          }
        }
      }

      let preparedExtras = extras;
      if (proposal.type === 'createRole' && accessV2Enabled) {
        const v2 = extras.accessV2;
        const creation = v2.roleCreation;
        if (!creation?.refreshRoleCreation) throw new Error('Role configuration is still loading. Please try again.');
        const freshCreation = { ...creation, ...await creation.refreshRoleCreation() };
        const roleForm = resolveRoleForm(proposal);
        const preview = buildRoleFormBatch({
          ...freshCreation,
          authority: v2.authority || contractAddresses.membershipAuthorityAddress,
          hybridVoting: contractAddresses.votingContractAddress || '',
          taskManagerAddress: contractAddresses.taskManagerContractAddress || '',
          indexedSubjects: v2.indexedSubjects?.length ? v2.indexedSubjects : (v2.subjects || []),
          activeProposals: v2.activeProposals || [],
          inOrgUsers: v2.inOrgUsers,
          votingClasses: v2.votingClasses || [],
          form: roleForm,
          metadataCID: metadataCIDBytes32,
          preview: true,
        });
        if (!preview.submittable.ok) throw new Error(preview.submittable.message);
        const emailAllowlist = roleForm.kind !== ROLE_FORM_KIND.GROUP && usesEmailEligibility(roleForm)
          ? await creation.prepareRoleEmail(roleForm, preview.predictedSubjectId) : null;
        preparedExtras = { ...extras, accessV2: { ...v2, roleCreation: freshCreation, emailAllowlist } };
      }

      const {
        numOptions, batches, optionNames, summaries: builtSummaries, gasLimit,
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

      const submitted = await onSubmit({
        name: finalName,
        description: finalDescription,
        time: durationMinutes,
        numOptions,
        batches,
        optionNames,
        actionSummaries,
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
        // Access-v2 removal fields. VotingPage re-runs canRemove for each pair
        // immediately before sending and parks this floor for announceWinner.
        roleRemovalConfig: proposal.roleRemovalConfig,
        // Voting restrictions
        hatIds: proposal.isRestricted ? proposal.restrictedHatIds : [],
      });

      // The page's submit handler answers `false` when the transaction did not
      // land (it has already shown the failure). A resolved promise used to be
      // read as success here — form reset, draft wiped, green toast — over a
      // revert. Keep the member's work and let them retry.
      if (submitted === false) {
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
          successDescription = form.kind === ROLE_FORM_KIND.GROUP
            ? `Create-group proposal submitted for "${form.name || 'new group'}". If approved, the group will be created and every role in it gets its permissions.`
            : `Create-role proposal submitted for "${form.name || 'new role'}". If approved, the role will be created${holderCount ? ` and given to ${holderCount} member(s)` : ''}.`;
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
  };
  return handleSubmit(...args);
}
