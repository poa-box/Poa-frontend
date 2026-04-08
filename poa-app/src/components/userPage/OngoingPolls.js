//react component gets poll data from votingcontext and displays ongoing polls in cards

import React, { useMemo } from 'react';


import CountDown from '../../templateComponents/studentOrgDAO/voting/countDown';


import {
    Box,
    HStack,
    Heading,
    Text,
    VStack,
    Badge
    } from '@chakra-ui/react';

    import Link2 from 'next/link';
    import { useRouter } from "next/router";

const glassLayerStyle = {
    position: 'absolute',
    width: '100%',
    height: '100%',
    zIndex: -1,
    borderRadius: 'inherit',
    backgroundColor: 'rgba(0, 0, 0, .9)',
};


const OngoingPolls = ({OngoingPolls}) => {

    // check if ongoing polsl exist
    const router = useRouter();
    const userDAO = router.query.org || router.query.userDAO || '';
    const ongoingPollsExist = OngoingPolls && OngoingPolls.length > 0;
    if (!ongoingPollsExist) {
        return <Text mt="4" ml="7">No ongoing polls available</Text>;
    }

    // Take first 3 polls without mutating the prop array
    const randomPolls = useMemo(() => [...OngoingPolls].slice(0, 3), [OngoingPolls]);


    function calculateRemainingTime(expirationTimestamp) {
        // Current timestamp in seconds
        const currentTimestamp = Math.floor(Date.now() / 1000);
        
        // Calculate the duration
        const duration = expirationTimestamp - currentTimestamp;
        return duration;
    }

    return (
            <HStack ml={0} mr={8} spacing="3.5%" >
                        {randomPolls.map((poll) => (
                            
                            
                            <Box
                                _hover={{ transform: 'scale(1.07)' }}
                                key={poll.id}
                                bg="transparent"
                                borderRadius="2xl"
                                p={2}
                                position="relative"
                                w="31%"
                                mt="-4"
                            >
                                
                                <div style={glassLayerStyle}/>
                                
                                <Link2  href={`/voting/?poll=${poll.id}&org=${userDAO}`}>
                                <VStack textColor="white"  spacing={2}>

                                    <Heading  ml={4} fontWeight="extrabold" mt={2} size="sm">{poll.title}</Heading>

                                    <Box pl="4" mt="0"><CountDown duration={calculateRemainingTime(poll?.endTimestamp)}/></Box>
                                    <Box alignSelf={"flex-start"} ml="4" mt="0">
                                        <Badge colorScheme="blue">{poll.type}</Badge>
                                    </Box>
                                </VStack>
                                </Link2>
                                
                            </Box>
                        

                        ))}
            </HStack>
    );

}

export default OngoingPolls;