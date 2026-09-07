import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/features/application/pages/LearnPage'),
  {
    "title": "Learn & Earn",
    "description": "Get to know your community through short learning modules and quizzes.",
    "path": "/learn",
    "noIndex": true
  },
);
