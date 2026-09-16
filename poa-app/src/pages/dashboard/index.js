import Page from '@/features/application/pages/DashboardPage';

// Keep metadata available above the application providers during initial load.
Page.seo = {
    "title": "Dashboard",
    "description": "Your organization dashboard.",
    "path": "/dashboard",
    "noIndex": true
  };

export default Page;
