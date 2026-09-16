import Page from '@/features/application/pages/VotesPage';

// Keep metadata available above the application providers during initial load.
Page.seo = {
    "title": "Vote archive",
    "description": "View past votes and proposals.",
    "path": "/votes",
    "noIndex": true
  };

export default Page;
