import React, { useEffect, useRef, useMemo } from "react";
import { VStack, Box } from "@chakra-ui/react";
import SpeechBubble from "./SpeechBubble";
import { measureTextHeight } from "../../hooks/usePretext";

const ConversationLog = ({ messages, selectionHeight }) => {
  const containerRef = useRef(null);
  const isInitialRenderRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  // Pre-calculate estimated total content height using Pretext.
  // This lets us scroll to the correct position without waiting for
  // the DOM to lay out, avoiding forced reflow via scrollHeight.
  const estimatedTotalHeight = useMemo(() => {
    if (!messages?.length) return 0;
    const width = typeof window !== 'undefined'
      ? Math.min(window.innerWidth - 80, 800) // account for padding
      : 600;
    return messages.reduce((total, msg) => {
      if (!msg.text) return total + 60; // loading/typing placeholder height
      const font = msg.speaker === 'User' ? '16px system-ui' : '16px system-ui';
      const { height } = measureTextHeight(msg.text, font, width, 24);
      // Add padding for bubble chrome (speaker label, margins, padding)
      return total + height + 72;
    }, 0);
  }, [messages]);

  // Handle auto-scrolling when messages change
  useEffect(() => {
    if (containerRef.current) {
      // Use Pretext-estimated height for immediate scroll on initial render,
      // then fall back to scrollHeight for subsequent updates (after DOM paint)
      if (isInitialRenderRef.current) {
        // Use the Pretext estimate for instant scroll — no reflow needed
        containerRef.current.scrollTop = estimatedTotalHeight;
        isInitialRenderRef.current = false;
      } else {
        // For subsequent messages, use a rAF to batch with the next paint
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        });
      }
      prevMessageCountRef.current = messages.length;
    }
  }, [messages, estimatedTotalHeight]);

  return (
    <Box
      position="relative"
      width="100%"
      height="100%"
      overflow="hidden"
    >
      <VStack
        ref={containerRef}
        align="stretch"
        spacing={4}
        overflowY="auto"
        pb={`${selectionHeight + 40}px`}
        maxHeight="80vh" 
        className="scroll-container"
        width="100%"
        pr="0"
        mr="0"
        sx={{
          '&::-webkit-scrollbar': {
            width: '8px',
            position: 'absolute',
            right: '0',
          },
          '&::-webkit-scrollbar-track': {
            width: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '24px',
          },
          paddingRight: '0',
          marginRight: '0',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255, 255, 255, 0.2) rgba(255, 255, 255, 0.05)',
        }}
      >
        {messages.map((message, index) => (
          <SpeechBubble
            key={message.id || index}
            speaker={message.speaker}
            containerRef={containerRef}
            isTyping={message.isTyping} 
            isLastMessage={index === messages.length - 1}
            isPreTyped={message.isPreTyped}
            id={message.id}
          >
            {message.text}
          </SpeechBubble>
        ))}
        <Box height="20px" width="100%" />
      </VStack>
    </Box>
  );
};

export default ConversationLog;
