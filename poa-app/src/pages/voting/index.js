import Page from '@/features/application/pages/VotingPage';

// Keep metadata available above the application providers during initial load.
Page.seo = {
    "title": "Voting",
    "description": "Vote on organization proposals.",
    "path": "/voting",
    "noIndex": true
  };

export default Page;
