// src/App.tsx

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { ToastProvider } from './components/Toast';
import { LoginPage } from './pages/auth/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { StudentsDashboard } from './pages/dashboard/StudentsDashboard';
import { DashboardAssessmentPage } from './pages/dashboard/DashboardAssessmentPage';
import { OwnerHome } from './pages/owner/OwnerHome';
import { OwnerBanksY3LanguageConventions } from './pages/owner/OwnerBanksY3LanguageConventions';
import { OwnerReadingMagazineY3 } from './pages/owner/OwnerReadingMagazineY3';
import { OwnerUsers } from './pages/owner/OwnerUsers';
import { WritingPromptsDashboard } from './pages/dashboard/WritingPromptsDashboard';
import { HomePage } from './pages/HomePage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { Year3NumeracyPage } from './pages/y3/numeracy/Year3NumeracyPage';
import { MultiplicationLayout } from './pages/y3/numeracy/multiplication/MultiplicationLayout';
import { Y3MultiplicationPractice } from './pages/y3/numeracy/Y3MultiplicationPractice';
import { Y3MultiplicationHistory } from './pages/y3/numeracy/multiplication/Y3MultiplicationHistory';
import { SubtractionLayout } from './pages/y3/numeracy/subtraction/SubtractionLayout';
import { Y3SubtractionPractice } from './pages/y3/numeracy/subtraction/Y3SubtractionPractice';
import { Y3SubtractionHistory } from './pages/y3/numeracy/subtraction/Y3SubtractionHistory';
import { Y3SubtractionReview } from './pages/y3/numeracy/subtraction/Y3SubtractionReview';
import { AdditionLayout } from './pages/y3/numeracy/addition/AdditionLayout';
import { Y3AdditionPractice } from './pages/y3/numeracy/addition/Y3AdditionPractice';
import { Y3AdditionHistory } from './pages/y3/numeracy/addition/Y3AdditionHistory';
import { Y3AdditionReview } from './pages/y3/numeracy/addition/Y3AdditionReview';
import { Y3HistoryPage } from './pages/y3/history/Y3HistoryPage';
import { Y3MultiplicationReview } from './pages/y3/numeracy/multiplication/Y3MultiplicationReview';
import { MeasurementLayout } from './pages/y3/numeracy/measurement/MeasurementLayout';
import { Y3MeasurementPractice } from './pages/y3/numeracy/measurement/Y3MeasurementPractice';
import { Y3MeasurementHistory } from './pages/y3/numeracy/measurement/Y3MeasurementHistory';
import { Y3MeasurementReview } from './pages/y3/numeracy/measurement/Y3MeasurementReview';
import { Y3GeometryPractice } from './pages/y3/numeracy/geometry/Y3GeometryPractice';
import { Y3GeometryReview } from './pages/y3/numeracy/geometry/Y3GeometryReview';
import { GeometryLayout } from './pages/y3/numeracy/geometry/GeometryLayout';
import { Y3GeometryHistory } from './pages/y3/numeracy/geometry/Y3GeometryHistory';
import { DataProbabilityLayout, Y3DataProbabilityHistory, Y3DataProbabilityPractice } from './pages/y3/numeracy/dataProbability';
import { Y3LanguageConventions } from './pages/y3/languageConventions/Y3LanguageConventions';
import { Y3LanguageConventionsPractice } from './pages/y3/languageConventions/Y3LanguageConventionsPractice';
import { Y3LanguageConventionsHistory } from './pages/y3/languageConventions/Y3LanguageConventionsHistory';
import { Y3LanguageConventionsReview } from './pages/y3/languageConventions/Y3LanguageConventionsReview';
import { Y3ReadingMagazine } from './pages/y3/readingMagazine/Y3ReadingMagazine';
import { Y3WritingPage } from './pages/y3/writing/Y3WritingPage';
import { Y3WritingReview } from './pages/y3/writing/Y3WritingReview';
import { isProjectOwner } from './lib/isProjectOwner';
import { IntroSplash } from './components/IntroSplash';
import { useIntroGate } from './lib/intro/useIntroGate';
import { BookMenu, MenuOption as BookMenuOption } from './components/BookMenu';
import { SiteFooter } from './components/SiteFooter';
import { GlassyHome } from './components/glassyHome/GlassyHome';
import { TermsPage } from './pages/TermsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { GhHistoryPage } from './pages/gh/history/GhHistoryPage';
import { GhHistoryDeltaPage } from './pages/gh/history/GhHistoryDeltaPage';
import { GhHistoryMasteryPage } from './pages/gh/history/GhHistoryMasteryPage';
import { GhHistoryConePage } from './pages/gh/history/GhHistoryConePage';

// Protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, userProfile, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const role = userProfile?.role ?? 'student';
  const isAssessor = role === 'parent' || role === 'teacher';
  if (isAssessor) {
    const p = location.pathname;
    const hasBackground = !!(location.state as any)?.backgroundLocation;
    const allowed =
      p === '/' ||
      p.startsWith('/dashboard') ||
      p.startsWith('/y3/history') ||
      p.startsWith('/gh/history') ||
      (hasBackground && (p.startsWith('/y3/numeracy') || p.startsWith('/y3/language-conventions') || p.startsWith('/y3/reading-magazine')));
    if (!allowed) {
      return <Navigate to="/dashboard" replace />;
    }
  }
  
  return <>{children}</>;
};

const OwnerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, userProfile, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!isProjectOwner(currentUser, userProfile)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const ModalFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const close = () => navigate(-1);

  return (
    <div className="fixed inset-0 z-60">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="absolute inset-0 p-2 sm:p-4 flex items-center justify-center">
        <div className="relative w-full h-full max-w-[1200px] max-h-[95vh] bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="absolute top-2 right-2 z-10">
            <button
              type="button"
              onClick={close}
              className="px-3 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200"
            >
              Close
            </button>
          </div>
          <div className="w-full h-full overflow-auto">{children}</div>
        </div>
      </div>
    </div>
  );
};

const AppRoutes: React.FC = () => {
  const location = useLocation();
  const stateAny = location.state as any;
  const backgroundLocation = stateAny?.backgroundLocation as any | undefined;
  const { currentUser, userProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const hideGlobalMenu = location.pathname === '/home1' || location.pathname.startsWith('/gh/y3/practice');

  const globalMenuOptions: BookMenuOption[] = React.useMemo(() => {
    const opts: BookMenuOption[] = [{ name: 'Home', subhead: 'Main page', link: '/' }];

    if (!currentUser) {
      opts.push({ name: 'Login', subhead: 'Sign in', link: '/login' });
      return opts;
    }

    const role = userProfile?.role ?? 'student';

    opts.push(
      { name: 'Dashboard', subhead: 'Your hub', link: '/dashboard' },
      { name: 'Numeracy', subhead: 'Year 3', link: '/y3/numeracy' },
      { name: 'Reading', subhead: 'Magazine', link: '/y3/reading-magazine' },
      { name: 'Writing', subhead: 'Year 3', link: '/y3/writing' },
      { name: 'Language', subhead: 'Year 3', link: '/y3/language-conventions' }
    );

    // The combined /y3/history report is for parents/teachers/owners.
    if (role !== 'student') {
      opts.push({ name: 'History', subhead: 'Sessions', link: '/y3/history' });
    }

    if (userProfile?.role === 'owner') {
      opts.push({ name: 'Owner', subhead: 'Admin', link: '/owner' });
    }

    opts.push({
      name: 'Logout',
      subhead: 'Sign out',
      link: '',
      onClick: async () => {
        await signOut();
        navigate('/');
      },
    });

    return opts;
  }, [currentUser, navigate, signOut, userProfile?.role]);

  return (
    <>
      {!hideGlobalMenu && <BookMenu options={globalMenuOptions} position="right-top" size={64} fanRadius={140} />}
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<HomePage />} />
        <Route path="/home1" element={<GlassyHome />} />
        <Route path="/gh/y3/practice" element={<GlassyHome />} />
        <Route
          path="/gh/history"
          element={
            <ProtectedRoute>
              <GhHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/gh/history/delta"
          element={
            <ProtectedRoute>
              <GhHistoryDeltaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/gh/history/mastery"
          element={
            <ProtectedRoute>
              <GhHistoryMasteryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/gh/history/cone"
          element={
            <ProtectedRoute>
              <GhHistoryConePage />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/students"
          element={
            <ProtectedRoute>
              <StudentsDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/assessment"
          element={
            <ProtectedRoute>
              <DashboardAssessmentPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/owner"
          element={
            <OwnerRoute>
              <OwnerHome />
            </OwnerRoute>
          }
        />

        <Route
          path="/owner/users/"
          element={
            <OwnerRoute>
              <OwnerUsers />
            </OwnerRoute>
          }
        />

        <Route
          path="/owner/banks/y3/language-conventions"
          element={
            <OwnerRoute>
              <OwnerBanksY3LanguageConventions />
            </OwnerRoute>
          }
        />

        <Route
          path="/owner/banks/y3/reading-magazine"
          element={
            <OwnerRoute>
              <OwnerReadingMagazineY3 />
            </OwnerRoute>
          }
        />

        <Route
          path="/owner/banks/y3/writing"
          element={
            <OwnerRoute>
              <WritingPromptsDashboard />
            </OwnerRoute>
          }
        />

        <Route
          path="/y3/numeracy"
          element={
            <ProtectedRoute>
              <Year3NumeracyPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/y3/numeracy/multiplication"
          element={
            <ProtectedRoute>
              <MultiplicationLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Y3MultiplicationPractice />} />
          <Route path="history" element={<Y3MultiplicationHistory />} />
        </Route>

        <Route
          path="/y3/numeracy/measurement"
          element={
            <ProtectedRoute>
              <MeasurementLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Y3MeasurementPractice />} />
          <Route path="history" element={<Y3MeasurementHistory />} />
        </Route>

        <Route
          path="/y3/numeracy/geometry"
          element={
            <ProtectedRoute>
              <GeometryLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Y3GeometryPractice />} />
          <Route path="history" element={<Y3GeometryHistory />} />
        </Route>

        <Route
          path="/y3/numeracy/data-probability"
          element={
            <ProtectedRoute>
              <DataProbabilityLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Y3DataProbabilityPractice />} />
          <Route path="history" element={<Y3DataProbabilityHistory />} />
        </Route>

        <Route
          path="/y3/numeracy/addition"
          element={
            <ProtectedRoute>
              <AdditionLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Y3AdditionPractice />} />
          <Route path="history" element={<Y3AdditionHistory />} />
        </Route>

        <Route
          path="/y3/language-conventions"
          element={
            <ProtectedRoute>
              <Y3LanguageConventions />
            </ProtectedRoute>
          }
        >
          <Route index element={<Y3LanguageConventionsPractice />} />
          <Route path="history" element={<Y3LanguageConventionsHistory />} />
          <Route path="review" element={<Y3LanguageConventionsReview />} />
        </Route>

        <Route
          path="/y3/reading-magazine/*"
          element={
            <ProtectedRoute>
              <Y3ReadingMagazine />
            </ProtectedRoute>
          }
        />

        <Route
          path="/y3/writing/*"
          element={
            <ProtectedRoute>
              <Y3WritingPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/y3/history/*"
          element={
            <ProtectedRoute>
              {(userProfile?.role ?? 'student') === 'student' ? <Navigate to="/dashboard" replace /> : <Y3HistoryPage />}
            </ProtectedRoute>
          }
        />

        <Route
          path="/y3/history/review"
          element={
            <ProtectedRoute>
              <Y3SubtractionReview />
            </ProtectedRoute>
          }
        />

        <Route
          path="/y3/history/review/multiplication"
          element={
            <ProtectedRoute>
              <Y3MultiplicationReview />
            </ProtectedRoute>
          }
        />

        <Route
          path="/y3/history/review/addition"
          element={
            <ProtectedRoute>
              <Y3AdditionReview />
            </ProtectedRoute>
          }
        />

        <Route
          path="/y3/history/review/measurement"
          element={
            <ProtectedRoute>
              <Y3MeasurementReview />
            </ProtectedRoute>
          }
        />

        <Route
          path="/y3/history/review/geometry"
          element={
            <ProtectedRoute>
              <Y3GeometryReview />
            </ProtectedRoute>
          }
        />

        <Route
          path="/y3/history/review/writing"
          element={
            <ProtectedRoute>
              <Y3WritingReview />
            </ProtectedRoute>
          }
        />

        <Route
          path="/y3/numeracy/subtraction"
          element={
            <ProtectedRoute>
              <SubtractionLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Y3SubtractionPractice />} />
          <Route path="history" element={<Y3SubtractionHistory />} />
          <Route path="history/review" element={<Y3SubtractionReview />} />
        </Route>

        <Route path="/coming-soon" element={<ComingSoonPage />} />
      </Routes>

      <SiteFooter />

      {backgroundLocation && (
        <Routes>
          <Route
            path="/y3/history/review"
            element={
              <ProtectedRoute>
                <ModalFrame>
                  <Y3SubtractionReview />
                </ModalFrame>
              </ProtectedRoute>
            }
          />
          <Route
            path="/y3/history/review/multiplication"
            element={
              <ProtectedRoute>
                <ModalFrame>
                  <Y3MultiplicationReview />
                </ModalFrame>
              </ProtectedRoute>
            }
          />
          <Route
            path="/y3/history/review/addition"
            element={
              <ProtectedRoute>
                <ModalFrame>
                  <Y3AdditionReview />
                </ModalFrame>
              </ProtectedRoute>
            }
          />

          <Route
            path="/y3/history/review/measurement"
            element={
              <ProtectedRoute>
                <ModalFrame>
                  <Y3MeasurementReview />
                </ModalFrame>
              </ProtectedRoute>
            }
          />

          <Route
            path="/y3/history/review/geometry"
            element={
              <ProtectedRoute>
                <ModalFrame>
                  <Y3GeometryReview />
                </ModalFrame>
              </ProtectedRoute>
            }
          />

          <Route
            path="/y3/history/review/writing"
            element={
              <ProtectedRoute>
                <ModalFrame>
                  <Y3WritingReview />
                </ModalFrame>
              </ProtectedRoute>
            }
          />

          <Route
            path="/y3/numeracy/measurement/*"
            element={
              <ProtectedRoute>
                <ModalFrame>
                  <MeasurementLayout />
                </ModalFrame>
              </ProtectedRoute>
            }
          >
            <Route index element={<Y3MeasurementPractice />} />
            <Route path="history" element={<Y3MeasurementHistory />} />
          </Route>

          <Route
            path="/y3/numeracy/geometry/*"
            element={
              <ProtectedRoute>
                <ModalFrame>
                  <GeometryLayout />
                </ModalFrame>
              </ProtectedRoute>
            }
          >
            <Route index element={<Y3GeometryPractice />} />
            <Route path="history" element={<Y3GeometryHistory />} />
          </Route>

          <Route
            path="/y3/numeracy/data-probability/*"
            element={
              <ProtectedRoute>
                <ModalFrame>
                  <DataProbabilityLayout />
                </ModalFrame>
              </ProtectedRoute>
            }
          >
            <Route index element={<Y3DataProbabilityPractice />} />
            <Route path="history" element={<Y3DataProbabilityHistory />} />
          </Route>

          <Route
            path="/y3/language-conventions/review"
            element={
              <ProtectedRoute>
                <ModalFrame>
                  <Y3LanguageConventionsReview />
                </ModalFrame>
              </ProtectedRoute>
            }
          />
        </Routes>
      )}
    </>
  );
};

const App: React.FC = () => {
  const { showIntro, markDone } = useIntroGate();

  return (
    <ToastProvider>
      <AuthProvider>
        {showIntro ? (
          <IntroSplash onDone={markDone} />
        ) : (
          <Router>
            <AppRoutes />
          </Router>
        )}
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
