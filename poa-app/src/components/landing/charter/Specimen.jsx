import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { MonoLabel, CharterLink } from "./Bones";
import { getVisitUrlForOrg } from "@/config/hostDefaultOrg";
import useLandingRegistry from "./useLandingRegistry";

const FICTIONAL_ROWS = [
  ["founded", "9 October 2024"],
  ["members", "14"],
  ["rules", "worker cooperative, adjusted"],
  ["votes", "one worker, one vote"],
  ["treasury", "$12,408.90"],
];

const FICTIONAL_DECISIONS = [
  ["no. 0006", "Hire a Saturday baker.", "passed, 9 to 4"],
  ["no. 0007", "Buy the second oven.", "passed, 11 to 2"],
];

const formatFounded = (deployedAt) => {
  const ts = parseInt(deployedAt, 10);
  if (!ts) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ts * 1000));
};

// The charter card. By default (static export, first paint, registry down)
// it shows a fictional cooperative, clearly labeled a specimen. Once the
// live registry answers, it swaps in a real organization: real name, real
// founding date, real member count, and a link to its actual books. The
// fiction is the fallback, the record is the goal.
const Specimen = () => {
  const { isLoading, featuredOrg } = useLandingRegistry();
  const live = !isLoading && featuredOrg ? featuredOrg : null;

  const liveRows = live
    ? [
        ["founded", formatFounded(live.deployedAt) || "on the public record"],
        ["members", String(live.totalMembers ?? 0)],
        ["charter", "public, in full"],
      ]
    : null;

  const liveUrl = live ? getVisitUrlForOrg(live.id) : null;

  return (
    <Box
      as="figure"
      maxW="560px"
      mx="auto"
      bg="paper.50"
      border="1px solid"
      borderColor="paper.300"
      borderRadius="2px"
      boxShadow="6px 6px 0 rgba(33, 29, 21, 0.9)"
      px={{ base: 6, md: 8 }}
      py={{ base: 6, md: 7 }}
    >
      <Flex justify="space-between" align="baseline" mb={5}>
        <MonoLabel color="ink.500">{live ? "from the registry" : "specimen"}</MonoLabel>
        <MonoLabel color={live ? "meadow.600" : "ink.500"}>{live ? "live" : "exhibit a"}</MonoLabel>
      </Flex>

      <Box borderTop="3px solid" borderColor="oxblood.600" pt={5} pb={4} textAlign="center">
        <Text fontFamily="charter" fontWeight="500" fontSize={{ base: "1.625rem", md: "1.75rem" }} lineHeight="1.2" color="ink.900">
          {live ? live.id : "Hill Street Bakery"}
        </Text>
        <Text fontFamily="charter" fontStyle="italic" fontSize="1.0625rem" color="ink.500" mt={1}>
          {live ? "a member owned organization" : "a worker owned cooperative"}
        </Text>
      </Box>

      <Box borderTop="1px solid" borderColor="ink.300">
        {(liveRows || FICTIONAL_ROWS).map(([k, v]) => (
          <Flex
            key={k}
            justify="space-between"
            align="baseline"
            gap={4}
            py={2.5}
            borderBottom="1px solid"
            borderColor="paper.300"
          >
            <Text fontFamily="ledger" fontSize="0.8125rem" letterSpacing="0.1em" textTransform="uppercase" color="ink.500">
              {k}
            </Text>
            <Text fontFamily="ledger" fontSize="0.875rem" color="ink.900" textAlign="right">
              {v}
            </Text>
          </Flex>
        ))}
      </Box>

      <Box pt={4} pb={2}>
        <Text fontFamily="ledger" fontSize="0.8125rem" letterSpacing="0.1em" textTransform="uppercase" color="ink.500" mb={3}>
          the record
        </Text>
        {live ? (
          <Text fontFamily="charter" fontSize="1rem" color="ink.900" mb={2.5}>
            Every decision this organization makes is on the public ledger.{" "}
            <CharterLink
              href={liveUrl}
              external={liveUrl?.startsWith("http")}
              fontSize="0.9375rem"
              whiteSpace="nowrap"
            >
              read its books
            </CharterLink>
          </Text>
        ) : (
          FICTIONAL_DECISIONS.map(([no, text, verdict]) => (
            <Flex key={no} gap={3} align="baseline" mb={2.5}>
              <Text fontFamily="ledger" fontSize="0.75rem" color="ink.500" flexShrink={0} w="4.25rem" whiteSpace="nowrap">
                {no}
              </Text>
              <Text fontFamily="charter" fontSize="1rem" color="ink.900">
                {text}{" "}
                <Text as="span" fontFamily="ledger" fontSize="0.8125rem" color="meadow.600" whiteSpace="nowrap">
                  {verdict}
                </Text>
              </Text>
            </Flex>
          ))
        )}
      </Box>

      <Box borderBottom="3px solid" borderColor="oxblood.600" pt={2} />

      <Text as="figcaption" srOnly>
        {live
          ? "A real organization from the public Poa registry."
          : "An illustrative example of an organization charter as it appears on Poa."}
      </Text>
    </Box>
  );
};

export default Specimen;
