//react component gets poll data from votingcontext and displays ongoing polls in cards

import React, { useMemo } from 'react';

import CountDown from '../../templateComponents/studentOrgDAO/voting/countDown';

import {
    HStack,
    Text,
    VStack,
    Badge,
    Center,
    Icon,
    SimpleGrid,
    Box,
} from '@chakra-ui/react';
import { FiBarChart2 } from 'react-icons/fi';

import Link2 from 'next/link';
import { useRouter } from "next/router";
import { useOrgName } from "@/hooks/useOrgName";

const OngoingPolls = ({ OngoingPolls }) => {
    const router = useRouter();
    const userDAO = useOrgName();
    const ongoingPollsExist = OngoingPolls && OngoingPolls.length > 0;

    const randomPolls = useMemo(
        () => (ongoingPollsExist ? [...OngoingPolls].slice(0, 3) : []),
        [OngoingPolls, ongoingPollsExist]
    );

    if (!ongoingPollsExist) {
        return (
            <Center py={8} flexDirection="column">
                <Icon as={FiBarChart2} boxSize={8} color="whiteAlpha.300" mb={3} />
                <Text fontSize="sm" color="whiteAlpha.500" fontWeight="medium">
                    No active polls
                </Text>
                <Text fontSize="xs" color="whiteAlpha.300" mt={1}>
                    Polls will appear here when voting is open
                </Text>
            </Center>
        );
    }

    function calculateRemainingTime(expirationTimestamp) {
        const currentTimestamp = Math.floor(Date.now() / 1000);
        return expirationTimestamp - currentTimestamp;
    }

    return (
        <SimpleGrid minChildWidth="240px" spacing={3}>
            {randomPolls.map((poll) => {
                const remaining = calculateRemainingTime(poll?.endTimestamp);
                return (
                    <Box
                        key={poll.id}
                        _hover={{ transform: "translateY(-2px)", boxShadow: "0 8px 25px rgba(0,0,0,0.3)" }}
                        transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
                        p={4}
                        borderRadius="2xl"
                        overflow="hidden"
                        bg="black"
                    >
                        <Link2 href={`/voting/?poll=${poll.id}&org=${userDAO}`}>
                            <VStack textColor="white" align="stretch" spacing={3}>
                                <Text mt="-2" fontSize="md" lineHeight="99%" fontWeight="extrabold" noOfLines={2}>
                                    {poll.title}
                                </Text>
                                <HStack justify="space-between" align="center">
                                    <Badge colorScheme="blue">{poll.type}</Badge>
                                    {remaining > 0 ? (
                                        <CountDown duration={remaining} />
                                    ) : (
                                        <Text fontSize="sm" fontWeight="bold" color="whiteAlpha.700" whiteSpace="nowrap">
                                            Voting open
                                        </Text>
                                    )}
                                </HStack>
                            </VStack>
                        </Link2>
                    </Box>
                );
            })}
        </SimpleGrid>
    );
};

export default OngoingPolls;
