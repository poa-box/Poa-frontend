import SEOHead from "@/components/common/SEOHead";
import VotingPage from "@/components/voting/VotingPage";

const Voting = () => (
  <>
    <SEOHead
      title="Voting"
      description="Vote on organization proposals."
      path="/voting"
      noIndex
    />
    <VotingPage />
  </>
);

export default Voting;
