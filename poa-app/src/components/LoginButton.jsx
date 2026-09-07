import React from 'react';
import { Button } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useUserContext } from '@/context/UserContext';
import { useOrgName } from '@/hooks/useOrgName';

const LoginButton = () => {

    const { hasMemberRole } = useUserContext();

    const userDAO = useOrgName();



    const text = hasMemberRole ? 'Profile Hub' : 'Join or Connect';
    const route = hasMemberRole ? 'profile' : 'join';

    return (
        <NextLink href={`/${route}/?org=${encodeURIComponent(userDAO)}`} passHref>
            <Button
                bgGradient="linear(to-r, teal.300, green.300)"
                color="white"
                _hover={{
                    bgGradient: "linear(to-r, teal.600, green.600)",
                }}
                _active={{
                    bgGradient: "linear(to-r, teal.700, green.700)",
                }}
                borderRadius="full"
                px="6"
                py="2"
                fontSize="lg"
                fontWeight="bold"
                textColor="black"
                onClick={(e) => {
                        // setChecked(false);
                
                }}
            >
                {text}
            </Button>
        </NextLink>
    );
};

export default LoginButton;
