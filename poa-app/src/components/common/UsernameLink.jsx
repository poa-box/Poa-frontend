import React from 'react';
import { Text } from '@chakra-ui/react';
import Link from 'next/link';

/**
 * Clickable username that links to the public profile page.
 * Stops event propagation so parent card/modal clicks don't fire.
 */
function UsernameLink({
  username,
  hasUsername = true,
  color = 'white',
  fontSize = 'sm',
  fontWeight = 'medium',
  isTruncated = false,
  maxW,
  children,
}) {
  if (!hasUsername || !username) {
    return (
      <Text color={color} fontSize={fontSize} fontWeight={fontWeight} isTruncated={isTruncated} maxW={maxW}>
        {children || username}
      </Text>
    );
  }

  return (
    <Link href={`/u?username=${encodeURIComponent(username)}`} passHref legacyBehavior>
      <Text
        as="a"
        color={color}
        fontSize={fontSize}
        fontWeight={fontWeight}
        isTruncated={isTruncated}
        maxW={maxW}
        cursor="pointer"
        _hover={{ textDecoration: 'underline', color: 'purple.300' }}
        transition="color 0.15s"
        onClick={(e) => e.stopPropagation()}
      >
        {children || username}
      </Text>
    </Link>
  );
}

export default UsernameLink;
