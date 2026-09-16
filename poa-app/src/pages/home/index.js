import Page from '@/features/application/pages/HomePage';

// Keep metadata available above the application providers during initial load.
Page.seo = {
    "title": "Organization Home",
    "description": "Organization overview and activity.",
    "path": "/home",
    "noIndex": true
  };

export default Page;
