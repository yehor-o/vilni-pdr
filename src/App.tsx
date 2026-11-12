import { useEffect } from 'react';
import { Navigate, Outlet, RouterProvider, createHashRouter, useLocation } from 'react-router-dom';
import { QuestionsProvider } from './data/QuestionsProvider';
import { ExamResultScreen } from './screens/exam/ExamResultScreen';
import { ExamReviewScreen } from './screens/exam/ExamReviewScreen';
import { ExamRunScreen } from './screens/exam/ExamRunScreen';
import { ExamStartScreen } from './screens/exam/ExamStartScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { TopicsScreen } from './screens/TopicsScreen';
import { ProgressProvider } from './storage';
import { ImageWarmup, UpdateBanner } from './pwa/PwaUi';

function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <>
      <UpdateBanner />
      <ImageWarmup />
      <Outlet />
    </>
  );
}

// Data router (hash-based) so the exam can block navigation with useBlocker.
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomeScreen /> },
      { path: '/topics', element: <TopicsScreen /> },
      { path: '/topics/:id', element: <PracticeScreen /> },
      { path: '/exam', element: <ExamStartScreen /> },
      { path: '/exam/run', element: <ExamRunScreen /> },
      { path: '/history', element: <HistoryScreen /> },
      { path: '/history/:id', element: <ExamResultScreen /> },
      { path: '/history/:id/review', element: <ExamReviewScreen /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return (
    <QuestionsProvider>
      <ProgressProvider>
        <RouterProvider router={router} />
      </ProgressProvider>
    </QuestionsProvider>
  );
}
