/**
 * EditBudgetModal
 * Resize a project's PT cap and per-token bounty caps via TaskPerm.BUDGET.
 * Calls TaskManager.setConfig directly — no governance vote required when
 * the caller holds a hat with the BUDGET bit.
 */

import React, { useMemo, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  VStack,
  HStack,
  Box,
  Text,
  Button,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  Switch,
  Alert,
  AlertIcon,
  Divider,
  Image,
  useToast,
} from '@chakra-ui/react';
import { ethers } from 'ethers';
import { useWeb3 } from '@/hooks';
import { usePOContext } from '@/context/POContext';
import { RefreshEvent } from '@/context/RefreshContext';
import { getTokenByAddress } from '@/util/tokens';
import { formatTokenAmount } from '@/util/formatToken';

// type(uint128).max — contract sentinel for "unlimited" bounty cap.
const UNLIMITED = ethers.BigNumber.from('340282366920938463463374607431768211455');
// Contract enforces MAX_PAYOUT = 1e24 wei
const MAX_PAYOUT = ethers.BigNumber.from('1000000000000000000000000');

function toBN(value) {
  try {
    return ethers.BigNumber.from(value || '0');
  } catch {
    return ethers.BigNumber.from(0);
  }
}

function isUnlimited(capWei) {
  // Anything in the top half of uint128 we treat as "unlimited" for display.
  return toBN(capWei).gte(ethers.BigNumber.from('100000000000000000000000000000000'));
}

const EditBudgetModal = ({ isOpen, onClose, project }) => {
  const toast = useToast();
  const { task: taskService, executeWithNotification } = useWeb3();
  const { taskManagerContractAddress, tokenLabel = 'Shares' } = usePOContext();

  const currentCapWei = toBN(project?.cap);

  // Spent values aren't indexed by the subgraph (PR #177 deliberately
  // skips them — they're derived from event accounting). Lens-read on
  // open so the "newCap < spent" warning is accurate; without it the
  // user would just bounce off `CapBelowCommitted` at signing time.
  const [liveSpent, setLiveSpent] = useState({ project: null, bounty: {} });
  const currentSpentWei = liveSpent.project ?? toBN(project?.spent);

  const [hasCap, setHasCap] = useState(currentCapWei.gt(0));
  const [capInput, setCapInput] = useState(
    currentCapWei.gt(0) ? ethers.utils.formatUnits(currentCapWei, 18) : ''
  );
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!isOpen || !taskService || !taskManagerContractAddress || !project?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const projBudget = await taskService.readProjectBudget(taskManagerContractAddress, project.id);
        const bountyByToken = {};
        await Promise.all(
          (project.bountyCaps || []).map(async (bc) => {
            try {
              const b = await taskService.readBountyBudget(taskManagerContractAddress, project.id, bc.token);
              bountyByToken[bc.token] = b.spent;
            } catch {
              // Lens read of a non-existent budget reverts — fall back to 0.
              bountyByToken[bc.token] = ethers.BigNumber.from(0);
            }
          })
        );
        if (cancelled) return;
        setLiveSpent({ project: projBudget.spent, bounty: bountyByToken });
      } catch {
        // If the lens read fails (e.g. pre-v4 contract), leave warnings dark
        // and rely on the on-chain revert message via ErrorParser.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, taskService, taskManagerContractAddress, project?.id, project?.bountyCaps]);

  // Per-token bounty cap edits keyed by token address
  const initialBountyEdits = useMemo(() => {
    const m = {};
    for (const bc of project?.bountyCaps || []) {
      const tokenInfo = getTokenByAddress(bc.token);
      const decimals = tokenInfo.decimals || 18;
      const unlimited = isUnlimited(bc.cap);
      m[bc.token] = {
        cap: unlimited ? '' : ethers.utils.formatUnits(toBN(bc.cap), decimals),
        unlimited,
      };
    }
    return m;
  }, [project?.bountyCaps]);
  const [bountyEdits, setBountyEdits] = useState(initialBountyEdits);

  React.useEffect(() => {
    if (isOpen) {
      setHasCap(currentCapWei.gt(0));
      setCapInput(currentCapWei.gt(0) ? ethers.utils.formatUnits(currentCapWei, 18) : '');
      setBountyEdits(initialBountyEdits);
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, project?.id]);

  // Validation: warn (not block) when newCap < spent — contract reverts CapBelowCommitted.
  const newCapWei = useMemo(() => {
    if (!hasCap) return ethers.BigNumber.from(0);
    if (!capInput) return null;
    try {
      return ethers.utils.parseUnits(capInput, 18);
    } catch {
      return null;
    }
  }, [hasCap, capInput]);

  const capWarning =
    newCapWei && newCapWei.gt(0) && newCapWei.lt(currentSpentWei)
      ? `New cap (${ethers.utils.formatUnits(newCapWei, 18)}) is below already-spent (${ethers.utils.formatUnits(currentSpentWei, 18)} ${tokenLabel}). Contract will revert CapBelowCommitted.`
      : null;

  const bountyValidation = useMemo(() => {
    const issues = [];
    for (const bc of project?.bountyCaps || []) {
      const edit = bountyEdits[bc.token];
      if (!edit) continue;
      const tokenInfo = getTokenByAddress(bc.token);
      const decimals = tokenInfo.decimals || 18;
      if (edit.unlimited) continue;
      if (!edit.cap) {
        issues.push(`${tokenInfo.symbol}: enter an amount or check Unlimited`);
        continue;
      }
      let proposed;
      try {
        proposed = ethers.utils.parseUnits(edit.cap, decimals);
      } catch {
        issues.push(`${tokenInfo.symbol}: invalid amount`);
        continue;
      }
      // cap = 0 has the contract semantic "DISABLED" for bounty budgets
      // (different from PT cap, where 0 means unlimited). Block it explicitly
      // so users don't accidentally turn a token off when they meant unlimited.
      if (proposed.isZero()) {
        issues.push(`${tokenInfo.symbol}: 0 disables the bounty — use Unlimited or a positive amount.`);
        continue;
      }
      if (proposed.gt(MAX_PAYOUT)) {
        issues.push(`${tokenInfo.symbol}: exceeds contract MAX_PAYOUT — use Unlimited instead`);
      }
      const spent = liveSpent.bounty[bc.token] ?? toBN(bc.spent);
      if (proposed.lt(spent)) {
        issues.push(
          `${tokenInfo.symbol}: new cap (${edit.cap}) is below spent (${formatTokenAmount(spent.toString(), decimals, decimals <= 6 ? 2 : 2)}). Contract will revert CapBelowCommitted.`
        );
      }
    }
    return issues;
  }, [bountyEdits, project?.bountyCaps, liveSpent]);

  // Compute the set of changes once so both the Save button label and the
  // submit path agree. Each entry corresponds to a separate on-chain tx
  // (setConfig has no batch endpoint for cap keys).
  const pendingChanges = useMemo(() => {
    const out = [];
    const targetCap = hasCap ? newCapWei : ethers.BigNumber.from(0);
    if (newCapWei !== null && !targetCap.eq(currentCapWei)) {
      out.push({ kind: 'projectCap', targetCap });
    }
    for (const bc of project?.bountyCaps || []) {
      const edit = bountyEdits[bc.token];
      if (!edit) continue;
      const tokenInfo = getTokenByAddress(bc.token);
      const decimals = tokenInfo.decimals || 18;
      let proposed;
      if (edit.unlimited) {
        proposed = UNLIMITED;
      } else if (!edit.cap) {
        continue;
      } else {
        try {
          proposed = ethers.utils.parseUnits(edit.cap, decimals);
        } catch {
          continue;
        }
        if (proposed.isZero()) continue;
      }
      if (!proposed.eq(toBN(bc.cap))) {
        out.push({ kind: 'bountyCap', token: bc.token, proposed, symbol: tokenInfo.symbol });
      }
    }
    return out;
  }, [hasCap, newCapWei, currentCapWei, bountyEdits, project?.bountyCaps]);

  const handleSave = async () => {
    if (saving) return; // double-click guard
    if (!taskService || !taskManagerContractAddress || !project?.id) return;
    if (newCapWei === null && hasCap) {
      toast({ title: 'Enter a valid cap amount', status: 'error', duration: 3000 });
      return;
    }
    if (bountyValidation.length > 0) {
      toast({ title: 'Fix the issues above before saving', status: 'error', duration: 3000 });
      return;
    }
    if (pendingChanges.length === 0) {
      toast({ title: 'No changes', status: 'info', duration: 2500 });
      return;
    }

    setSaving(true);
    let allOk = true;
    try {
      for (const change of pendingChanges) {
        const run =
          change.kind === 'projectCap'
            ? () => taskService.setProjectCap(taskManagerContractAddress, project.id, change.targetCap)
            : () => taskService.setBountyCap(taskManagerContractAddress, project.id, change.token, change.proposed);
        const pending =
          change.kind === 'projectCap'
            ? 'Updating project cap...'
            : `Updating ${change.symbol} cap...`;
        const success =
          change.kind === 'projectCap'
            ? 'Project cap updated.'
            : `${change.symbol} cap updated.`;

        const result = await executeWithNotification(run, {
          pendingMessage: pending,
          successMessage: success,
          refreshEvent: RefreshEvent.PROJECT_BUDGET_UPDATED,
        });
        if (!result?.success) {
          allOk = false;
          break;
        }
      }
    } finally {
      setSaving(false);
    }
    if (allOk) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Edit Project Budget</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <Alert status="info" borderRadius="md" fontSize="sm">
              <AlertIcon />
              Requires a role with the BUDGET permission. Project managers are NOT
              implicitly authorized — the contract gate is strict.
            </Alert>

            <Box>
              <Text fontSize="sm" color="gray.500">Currently spent</Text>
              <Text fontWeight="600">
                {formatTokenAmount(currentSpentWei.toString())} {tokenLabel.toLowerCase()}
              </Text>
            </Box>

            <FormControl>
              <HStack justify="space-between">
                <FormLabel mb={0}>Share Budget Cap</FormLabel>
                <Switch
                  isChecked={hasCap}
                  onChange={(e) => setHasCap(e.target.checked)}
                  colorScheme="purple"
                />
              </HStack>
            </FormControl>

            {hasCap && (
              <Box p={3} bg="gray.50" borderRadius="md">
                <FormControl>
                  <FormLabel fontSize="sm">New Cap ({tokenLabel.toLowerCase()})</FormLabel>
                  <NumberInput value={capInput} onChange={setCapInput} min={0}>
                    <NumberInputField placeholder="e.g., 10000" />
                  </NumberInput>
                </FormControl>
              </Box>
            )}

            {capWarning && (
              <Alert status="warning" borderRadius="md" fontSize="sm">
                <AlertIcon />
                {capWarning}
              </Alert>
            )}

            {(project?.bountyCaps || []).length > 0 && (
              <>
                <Divider />
                <Text fontWeight="600">Bounty Token Caps</Text>
                {project.bountyCaps.map((bc) => {
                  const tokenInfo = getTokenByAddress(bc.token);
                  const edit = bountyEdits[bc.token] || { cap: '', unlimited: false };
                  return (
                    <Box key={bc.token} p={3} bg="gray.50" borderRadius="md">
                      <HStack mb={2} spacing={2}>
                        {tokenInfo.logo && (
                          <Image
                            src={tokenInfo.logo}
                            alt={tokenInfo.symbol}
                            boxSize="20px"
                            borderRadius="full"
                            fallback={<></>}
                          />
                        )}
                        <Text fontWeight="600">{tokenInfo.symbol}</Text>
                        <Text fontSize="xs" color="gray.500">
                          Spent: {formatTokenAmount(
                            (liveSpent.bounty[bc.token] ?? toBN(bc.spent)).toString(),
                            tokenInfo.decimals,
                            2,
                          )}
                        </Text>
                      </HStack>
                      <HStack>
                        <Switch
                          size="sm"
                          isChecked={edit.unlimited}
                          onChange={(e) =>
                            setBountyEdits((prev) => ({
                              ...prev,
                              [bc.token]: { ...edit, unlimited: e.target.checked },
                            }))
                          }
                        />
                        <Text fontSize="xs">Unlimited</Text>
                        {!edit.unlimited && (
                          <NumberInput
                            size="sm"
                            value={edit.cap}
                            onChange={(value) =>
                              setBountyEdits((prev) => ({
                                ...prev,
                                [bc.token]: { ...edit, cap: value },
                              }))
                            }
                            min={0}
                            flex={1}
                          >
                            <NumberInputField placeholder={`Max ${tokenInfo.symbol}`} />
                          </NumberInput>
                        )}
                      </HStack>
                    </Box>
                  );
                })}
                {bountyValidation.length > 0 && (
                  <Alert status="warning" borderRadius="md" fontSize="sm">
                    <AlertIcon />
                    <VStack align="start" spacing={0}>
                      {bountyValidation.map((msg, i) => (
                        <Text key={i}>{msg}</Text>
                      ))}
                    </VStack>
                  </Alert>
                )}
              </>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter flexDirection="column" alignItems="stretch" gap={2}>
          {pendingChanges.length > 1 && (
            <Alert status="info" borderRadius="md" fontSize="xs">
              <AlertIcon />
              {pendingChanges.length} separate transactions — the contract has no
              batch endpoint for cap changes, so each requires its own signature.
            </Alert>
          )}
          <HStack justify="flex-end">
            <Button variant="ghost" mr={3} onClick={onClose} isDisabled={saving}>
              Cancel
            </Button>
            <Button
              colorScheme="purple"
              onClick={handleSave}
              isLoading={saving}
              loadingText={pendingChanges.length > 1 ? `Saving (${pendingChanges.length} txs)...` : 'Saving...'}
              isDisabled={pendingChanges.length === 0 || bountyValidation.length > 0}
            >
              Save Changes
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default EditBudgetModal;
