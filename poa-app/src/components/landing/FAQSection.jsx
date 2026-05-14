import React from "react";
import Link from "next/link";
import {
  Box,
  Container,
  Heading,
  Text,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  chakra,
} from "@chakra-ui/react";
import { motion } from "framer-motion";

const MotionBox = chakra(motion.div);

// Q&A copy MUST match the FAQPage JSON-LD in pages/index.js exactly. Google
// validates that each Question's `name` appears as visible text on the page.
//
// Editorial rule for this section: the "How do payments and money management
// work?" entry is the only place we mention blockchain or DAO language. Every
// other answer stays in plain product language. If you find yourself adding
// crypto vocabulary to a non-payments answer, rewrite the answer instead.
const FAQS = [
  {
    q: "How is Poa different from Slack, Notion, or Google Workspace?",
    a: (
      <>
        Those tools help you talk and collaborate. They&apos;re good at that.
        What they don&apos;t do is give the members real authority over the
        money, the rules, or who holds what role. The final word still sits
        with whoever owns the workspace. Poa is built the other way around.
        Every vote, every spending decision, every role change is governed by
        the community&apos;s own rules. The founder is just another member.
      </>
    ),
  },
  {
    q: "Can a student organization or worker cooperative actually use this?",
    a: (
      <>
        Yes. Student clubs and worker co-ops are exactly who Poa is designed
        for. Members join with a passkey, the same kind your phone already
        uses for face or fingerprint sign-in. No apps. No wallets. Nothing to
        install. Officers, members, and contributors get accountability and
        transparency on every consequential decision the community makes.
      </>
    ),
  },
  {
    q: "How does contribution-based voting work?",
    a: (
      <>
        Members earn participation tokens by completing tasks and doing real
        work for the organization. Those tokens convert into voting power. The
        people building the community shape its direction. Not the loudest
        voice in the room. Not the biggest donor. The full mechanics live in
        the{" "}
        <Link
          href="/docs/contributionVoting"
          style={{ textDecoration: "underline", color: "#9055E8" }}
        >
          contribution-based voting guide
        </Link>
        .
      </>
    ),
  },
  {
    q: "What happens if a member or officer goes rogue?",
    a: (
      <>
        No single person can override the community&apos;s rules. There&apos;s
        no admin password. There&apos;s no support agent who can bypass a
        vote. There&apos;s no founder with a kill switch. Every consequential
        action, including spending money, changing rules, and adding or
        removing members, requires a community vote according to the
        governance model your group chose at the start.
      </>
    ),
  },
  {
    q: "What happens if Poa as a company shuts down?",
    a: (
      <>
        Your organization keeps running. Member records, the treasury, voting
        history, and the rules of the organization all live in shared
        infrastructure that does not depend on us as a company. We built it
        that way on purpose. Even we could not take it away from you if we
        wanted to. That is the deal we are offering.
      </>
    ),
  },
  {
    q: "Is Poa free to use?",
    a: (
      <>
        The platform is free. Each organization covers a small amount of
        infrastructure cost for the actions it takes, and most groups get this
        sponsored automatically by Poa&apos;s shared community fund. You&apos;ll
        see exactly what&apos;s covered when you set up your organization. No
        card required to start.
      </>
    ),
  },
  {
    q: "How do payments and money management work?",
    a: (
      <>
        Every Poa organization has a shared treasury. Think of it as a
        checking account the community owns together. Spending requires a
        community vote. Every transaction is publicly visible to members. No
        outside party can freeze the funds. Not a bank. Not a payment
        processor. Not a platform admin. Not us.
        <br />
        <br />
        We build this on blockchain infrastructure (Poa is a DAO platform
        under the hood) because it&apos;s the only honest way to deliver
        what we&apos;re promising. The rules are enforced by code and
        cryptography, not by a company&apos;s policy team. If a bank
        doesn&apos;t like your community, they can close your account. If a
        software provider changes their terms, they can lock you out. Poa
        was built so that the rules of your organization, including who
        controls the money, are enforced by the infrastructure itself. The
        same infrastructure keeps working even if we shut the company down
        tomorrow. Full mechanics in the{" "}
        <Link
          href="/docs/treasury-management"
          style={{ textDecoration: "underline", color: "#9055E8" }}
        >
          treasury management guide
        </Link>
        .
      </>
    ),
  },
];

const FAQSection = () => (
  <Box as="section" py={["12", "16", "20"]} px={[4, 6, 8]}>
    <Container maxW="container.md">
      <MotionBox
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.6 }}
      >
        <Box mb={[8, 10]} textAlign={["center", "center", "left"]}>
          <Text
            fontSize="sm"
            fontWeight="600"
            color="warmGray.400"
            letterSpacing="0.08em"
            textTransform="uppercase"
            mb={[2, 3]}
          >
            Frequently asked questions
          </Text>
          <Heading
            as="h2"
            fontSize={["2xl", "3xl", "4xl"]}
            fontWeight="700"
            letterSpacing="-0.01em"
          >
            What people ask before starting an organization on Poa
          </Heading>
        </Box>

        <Accordion allowMultiple>
          {FAQS.map(({ q, a }) => (
            <AccordionItem
              key={q}
              borderTop="1px solid"
              borderColor="warmGray.100"
              _last={{ borderBottom: "1px solid", borderColor: "warmGray.100" }}
            >
              <h3>
                <AccordionButton py={5} _hover={{ bg: "warmGray.50" }}>
                  <Box
                    as="span"
                    flex="1"
                    textAlign="left"
                    fontWeight="600"
                    fontSize={["md", "lg"]}
                    color="warmGray.900"
                  >
                    {q}
                  </Box>
                  <AccordionIcon color="warmGray.500" />
                </AccordionButton>
              </h3>
              <AccordionPanel pb={5} pt={1}>
                <Text
                  as="div"
                  fontSize={["md", "md"]}
                  color="warmGray.600"
                  lineHeight="1.7"
                  fontWeight="500"
                >
                  {a}
                </Text>
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      </MotionBox>
    </Container>
  </Box>
);

export default FAQSection;
