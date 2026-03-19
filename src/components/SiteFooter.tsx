import React from 'react';
import { Link } from 'react-router-dom';

export const SiteFooter: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-slate-800 bg-slate-950 text-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div>
            <div className="text-lg font-extrabold tracking-tight text-white">The Art of Learning</div>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              NAPLAN-aligned practice for Years 3, 5, 7, 9 — built for students, parents, and teachers.
            </p>
          </div>

          <div>
            <div className="text-sm font-semibold text-white">Legal</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link to="/terms" className="text-slate-400 hover:text-white transition-colors">
                  Terms
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-slate-400 hover:text-white transition-colors">
                  Privacy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="text-sm font-semibold text-white">Support</div>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Questions or feedback? Contact support (placeholder).
            </p>
            <a
              href="mailto:support@example.com"
              className="mt-3 inline-flex text-sm font-semibold text-slate-200 hover:text-white transition-colors"
            >
              support@example.com
            </a>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-800 pt-6 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">© {year} The Art of Learning. All rights reserved.</div>
          <div className="text-xs text-slate-500">Placeholder links • Replace before launch</div>
        </div>
      </div>
    </footer>
  );
};
