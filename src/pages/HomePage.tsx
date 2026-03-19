// src/pages/HomePage.tsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllOptions, YEARS } from '../config/naplan';
import { CardOption } from '../components/CardOption';
import { useToast } from '../components/Toast';
import { AuthButton } from '../components/AuthButton';
import { useAuth } from '../auth/AuthProvider';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { userProfile } = useAuth();
  const options = getAllOptions();

  const logoUrl = `${process.env.PUBLIC_URL}/logo%20of%20arousha.art.png`;

  const handleOptionClick = (option: typeof options[0]) => {
    // Parents should not be sent into numeracy practice flows from the Home page.
    // Allow Reading/Writing content views.
    if (userProfile?.role === 'parent') {
      if (option.section === 'reading' || option.section === 'writing') {
        navigate(option.path);
      } else {
        navigate('/dashboard');
      }
      return;
    }

    if (option.enabled) {
      navigate(option.path);
    } else {
      showToast('Coming soon! This section is under development.');
    }
  };

  // Group options by year for better organization
  const optionsByYear = YEARS.map((year) => ({
    year,
    options: options.filter((opt) => opt.year === year),
  }));

  const comingSoonYears = [5, 7, 9];
  const hasAnyComingSoonYears = comingSoonYears.some((y) => optionsByYear.find((g) => g.year === (y as any))?.options?.length);

  const renderYearComingSoonCard = (label: string) => {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => showToast('Coming soon! This year level is under development.')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showToast('Coming soon! This year level is under development.');
          }
        }}
        className="relative p-6 rounded-2xl border-2 border-dashed transition-all duration-200 border-slate-300 bg-white/60 backdrop-blur cursor-not-allowed md:col-span-2"
        aria-label={`${label} - Coming soon`}
      >
        <div className="absolute -top-2 -right-2">
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-slate-600 text-white">Coming soon</span>
        </div>

        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center grayscale">
              <svg className="w-7 h-7 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20" />
                <path d="M6.5 2H20v20" />
                <path d="M6.5 2H4v17.5" />
                <path d="M8 4h10" />
                <path d="M8 7h10" />
                <path d="M8 10h10" />
              </svg>
            </div>
          </div>
          <div className="flex-grow min-w-0">
            <div className="flex items-center space-x-2 mb-2">
              <h3 className="text-lg font-bold text-slate-700">{label}</h3>
              <span className="text-slate-300">•</span>
              <span className="text-sm font-medium text-slate-500">All sections</span>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">
              Reading, Writing, Language Conventions, and Numeracy will be added soon.
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* What's New bar */}
          <div className="py-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-200">
                <svg className="w-4 h-4 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v6" />
                  <path d="M12 18v4" />
                  <path d="M4.93 4.93l4.24 4.24" />
                  <path d="M14.83 14.83l4.24 4.24" />
                  <path d="M2 12h6" />
                  <path d="M16 12h6" />
                  <path d="M4.93 19.07l4.24-4.24" />
                  <path d="M14.83 9.17l4.24-4.24" />
                </svg>
              </span>
              <span className="font-semibold">What’s New</span>
              <span className="text-emerald-800">Premium writing feedback + downloadable reports are live for Year 3.</span>
            </div>
          </div>

          {/* Navbar */}
          <div className="py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden">
                <img src={logoUrl} alt="The Art of Learning" className="h-9 w-9 object-contain" />
              </div>
              <div className="min-w-0">
                <div className="text-lg font-extrabold text-slate-900 leading-tight truncate">The Art of Learning</div>
                <div className="text-sm text-slate-600 truncate">NAPLAN-aligned practice for Years 3, 5, 7, 9</div>
              </div>
            </div>
            <div className="flex-shrink-0">
              <AuthButton />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="space-y-8">
              {optionsByYear.map(({ year, options: yearOptions }) => (
                year === 3 ? (
                <div key={year}>
                  <h2 className="text-2xl font-extrabold text-slate-900 mb-6 flex items-center">
                    <span className="bg-slate-900 text-white px-3 py-1 rounded-xl text-lg mr-3 shadow-sm">
                      Year {year}
                    </span>
                    <span className="text-slate-500 text-lg font-normal">
                      Choose a practice section
                    </span>
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {yearOptions.map((option) => (
                      <CardOption
                        key={`${option.year}-${option.section}`}
                        option={option}
                        onClick={() => handleOptionClick(option)}
                      />
                    ))}
                  </div>
                </div>
                ) : null
              ))}

              {hasAnyComingSoonYears && (
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-900 mb-6 flex items-center">
                    <span className="bg-slate-900 text-white px-3 py-1 rounded-xl text-lg mr-3 shadow-sm">Years 5/7/9</span>
                    <span className="text-slate-500 text-lg font-normal">Coming soon</span>
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {renderYearComingSoonCard('Years 5/7/9')}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Progress Roadmap */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="p-6 bg-gradient-to-br from-slate-50 to-white">
                  <h3 className="text-lg font-extrabold text-slate-900 mb-4 flex items-center">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm mr-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 4h18" />
                        <path d="M3 12h18" />
                        <path d="M3 20h18" />
                      </svg>
                    </span>
                  Progress Roadmap
                  </h3>
                
                <div className="space-y-3">
                  {/* Available */}
                  <div className="flex items-center gap-3">
                    <span className="h-6 w-6 rounded-full bg-emerald-500/15 border border-emerald-200 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    <span className="text-sm font-semibold text-slate-500">Year 3 Numeracy</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="h-6 w-6 rounded-full bg-emerald-500/15 border border-emerald-200 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    <span className="text-sm font-semibold text-slate-500">Year 3 Reading</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="h-6 w-6 rounded-full bg-emerald-500/15 border border-emerald-200 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    <span className="text-sm font-semibold text-slate-500">Year 3 Writing</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="h-6 w-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
                      <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 6v6l4 2" />
                        <circle cx="12" cy="12" r="9" />
                      </svg>
                    </span>
                    <span className="text-sm text-slate-600">Years 5/7/9 (all sections)</span>
                  </div>
                </div>
                
                <div className="mt-6 pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    New sections are being added regularly. Check back soon for updates!
                  </p>
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

    </div>
  );
};