import React, { useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, Checkbox, FormControl, FormLabel, HStack, Input, SimpleGrid,
  Switch, Text, VStack,
} from '@chakra-ui/react';
import { tokensFor } from '@/components/accessV2/roleForm/formTokens';
import { DEFAULT_SPONSORSHIP } from '@/lib/accessV2/sponsorship';

export default function SponsorshipSettings({ value, onChange, config, emailConfig, onRetry, kind = 'role', emailJoining = false, variant }) {
  const t = tokensFor(variant);
  const sponsorship = { ...DEFAULT_SPONSORSHIP, ...value };
  const symbol = config?.nativeSymbol || 'native currency';
  const canConfigure = config?.ready && config?.canConfigure;
  const emailAvailable = emailConfig?.ready && emailConfig.enabled && emailConfig.authorityMatches;
  const emailSelected = emailJoining || sponsorship.includeConfiguredEmailRules;
  const change = patch => {
    const next = { ...sponsorship, ...patch };
    if (!next.enabled || !next.supportPasskeys) {
      next.includeConfiguredEmailRules = false;
      next.initializeClaimBudget = false;
    } else if (!emailJoining && !next.includeConfiguredEmailRules) next.initializeClaimBudget = false;
    onChange(next);
  };
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);
  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try { await onRetry?.(); }
    catch (error) { setRetryError(error?.message || 'Unable to reload sponsorship.'); }
    finally { setRetrying(false); }
  };

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="sm" color={t.label} fontWeight="medium">Sponsorship</Text>
        <Text fontSize="xs" color={t.help} mt={1}>
          Cover eligible passkey actions from the organization’s funded balance. A new spending limit
          is shared by everyone holding this {kind}.
        </Text>
      </Box>
      {config?.paused && (
        <Alert status="warning" borderRadius="md" fontSize="sm">
          <AlertIcon />
          Sponsorship is currently paused. This budget will be available once sponsorship resumes and the org has funds.
        </Alert>
      )}
      {!canConfigure ? (
        <VStack align="stretch" spacing={3}>
        <Alert status="info" borderRadius="md" fontSize="sm" alignItems="flex-start">
          <AlertIcon />
          {config?.error || (!config?.ready
            ? 'Checking whether this organization’s governance can configure sponsorship…'
            : 'This organization’s governance is not authorized to set sponsorship budgets.')}
        </Alert>
        {sponsorship.enabled ? (
          <Button
            size="sm"
            variant="outline"
            colorScheme={t.accent}
            whiteSpace="normal"
            height="auto"
            py={2}
            onClick={() => change({ enabled: false })}
            data-testid="role-form-sponsorship-skip"
          >
            Continue with existing org sponsorship
          </Button>
        ) : (
          <Text fontSize="xs" color={t.help}>This proposal will keep existing org sponsorship without adding a new budget.</Text>
        )}
        {onRetry && (
          <Button size="sm" variant="ghost" colorScheme={t.accent} onClick={retry} isLoading={retrying}>
            Recheck sponsorship
          </Button>
        )}
        {retryError && <Text fontSize="xs" color={t.help}>{retryError}</Text>}
        </VStack>
      ) : (
        <>
          <HStack justify="space-between" align="start">
            <Box pr={3}>
              <Text fontSize="sm" color={t.label}>Set a sponsored action budget</Text>
              <Text fontSize="xs" color={t.help}>
                Starts at {sponsorship.capNative} {symbol} every {sponsorship.epochDays} days.
              </Text>
            </Box>
            <Switch
              aria-label="Set a sponsored action budget"
              isChecked={sponsorship.enabled}
              onChange={(e) => change({ enabled: e.target.checked })}
              colorScheme={t.accent}
              data-testid="role-form-sponsorship-enabled"
            />
          </HStack>
          {sponsorship.enabled && (
            <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
              <FormControl>
                <FormLabel color={t.label} fontSize="xs">Shared sponsorship limit ({symbol})</FormLabel>
                <Input
                  value={sponsorship.capNative}
                  onChange={(e) => change({ capNative: e.target.value })}
                  inputMode="decimal"
                  size="sm"
                  data-testid="role-form-sponsorship-cap"
                  {...t.input}
                />
              </FormControl>
              <FormControl>
                <FormLabel color={t.label} fontSize="xs">Budget resets every (days)</FormLabel>
                <Input
                  value={sponsorship.epochDays}
                  onChange={(e) => change({ epochDays: e.target.value })}
                  inputMode="decimal"
                  size="sm"
                  data-testid="role-form-sponsorship-epoch"
                  {...t.input}
                />
              </FormControl>
            </SimpleGrid>
          )}
          {sponsorship.enabled && (
            <Checkbox
              isChecked={sponsorship.supportPasskeys}
              onChange={(e) => change({ supportPasskeys: e.target.checked })}
              colorScheme={t.accent}
              alignItems="flex-start"
              data-testid="role-form-sponsorship-passkeys"
            >
              <VStack align="start" spacing={0} ml={1}>
                <Text fontSize="sm" color={t.label}>Allow membership actions with passkeys</Text>
                <Text fontSize="xs" color={t.help}>
                  Enable the org’s sponsorship rules for claiming and leaving roles, vouching,
                  and delegated membership actions. These rules apply across the organization.
                </Text>
              </VStack>
            </Checkbox>
          )}
          {sponsorship.enabled && sponsorship.supportPasskeys && (
            <VStack align="stretch" spacing={3}>
              <Checkbox
                isChecked={sponsorship.includeConfiguredEmailRules}
                isDisabled={!emailAvailable && !sponsorship.includeConfiguredEmailRules}
                onChange={(e) => change({ includeConfiguredEmailRules: e.target.checked })}
                colorScheme={t.accent}
                alignItems="flex-start"
                data-testid="role-form-sponsorship-email-rules"
              >
                <VStack align="start" spacing={0} ml={1}>
                  <Text fontSize="sm" color={t.label}>Sponsor configured email joining actions</Text>
                  <Text fontSize="xs" color={t.help}>
                    Include the organization’s existing verified email joining options. This changes
                    sponsorship across the organization. Email addresses or domains selected for this
                    role already include their needed joining actions.
                  </Text>
                </VStack>
              </Checkbox>
              {!emailAvailable && <Text fontSize="xs" color={t.help}>
                {emailConfig?.error || (!emailConfig?.ready ? 'Checking email joining options…' : 'Email joining is not available for this organization.')}
              </Text>}
              {emailSelected && config?.claimBudgetMissing && (
                <Checkbox
                  isChecked={sponsorship.initializeClaimBudget}
                  onChange={(e) => change({ initializeClaimBudget: e.target.checked })}
                  colorScheme={t.accent}
                  alignItems="flex-start"
                  data-testid="role-form-sponsorship-claim-budget"
                >
                  <VStack align="start" spacing={0} ml={1}>
                    <Text fontSize="sm" color={t.label}>Start the shared email joining budget</Text>
                    <Text fontSize="xs" color={t.help}>
                      Allow up to {sponsorship.capNative} {symbol} every {sponsorship.epochDays} days
                      so people can join before holding a role. All new email joiners across the
                      organization share this budget. Select this to continue with sponsored email joining.
                    </Text>
                  </VStack>
                </Checkbox>
              )}
              {emailSelected && !config?.claimBudgetReady && !config?.claimBudgetMissing && (
                <Text fontSize="xs" color={t.help}>The shared email joining budget could not be verified. Recheck sponsorship before review.</Text>
              )}
              {emailSelected && !config?.claimBudgetMissing && sponsorship.initializeClaimBudget && (
                <Checkbox isChecked onChange={() => change({ initializeClaimBudget: false })} colorScheme={t.accent}
                  data-testid="role-form-sponsorship-claim-budget">
                  <Text fontSize="xs" color={t.help}>Keep permission to start the shared email joining budget if it is missing at review.</Text>
                </Checkbox>
              )}
            </VStack>
          )}
          <Text fontSize="xs" color={t.help}>
            The org must fund its sponsorship balance. Turning this off leaves its other sponsorship budgets in place.
          </Text>
        </>
      )}
      <Box borderTop="1px solid" borderColor={t.panelBorder} pt={3}>
        <Text fontSize="xs" color={t.label} fontWeight="medium">Passkey actions</Text>
        <Text fontSize="xs" color={t.help} mt={1}>
          Eligible actions still require the member’s usual permissions. Spending limits and the org’s
          available sponsorship balance also apply. This budget does not grant additional permissions.
        </Text>
        {config?.actionsError && <Text fontSize="xs" color={t.help} mt={2}>{config.actionsError}</Text>}
      </Box>
    </VStack>
  );
}
