// src/components/CardOption.tsx

import React from 'react';
import { Option } from '../config/naplan';

interface CardOptionProps {
  option: Option;
  onClick: () => void;
}

export const CardOption: React.FC<CardOptionProps> = ({ option, onClick }) => {
  const { year, section, title, description, enabled } = option;

  const Icon = (
    <div
      className={
        enabled
          ? 'w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-200 flex items-center justify-center'
          : 'w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center grayscale'
      }
    >
      <svg
        className={enabled ? 'w-7 h-7 text-emerald-700' : 'w-7 h-7 text-slate-500'}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {section === 'numeracy' && (
          <>
            <path d="M4 7h16" />
            <path d="M7 4v16" />
            <path d="M11 10h9" />
            <path d="M11 14h9" />
          </>
        )}
        {section === 'reading' && (
          <>
            <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20" />
            <path d="M6.5 2H20v20" />
            <path d="M6.5 2H4v17.5" />
            <path d="M8 7h10" />
            <path d="M8 11h10" />
            <path d="M8 15h7" />
          </>
        )}
        {section === 'writing' && (
          <>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" />
          </>
        )}
        {section === 'language' && (
          <>
            <path d="M4 5h16" />
            <path d="M6 19h12" />
            <path d="M8 17c2-2 3-5 4-10" />
            <path d="M12 7c1 5 2 8 4 10" />
          </>
        )}
      </svg>
    </div>
  );
  
  return (
    <div
      className={`
        group relative p-6 rounded-2xl border transition-all duration-200 cursor-pointer
        ${enabled 
          ? 'border-slate-200 bg-white hover:border-emerald-200 card-hover' 
          : 'border-slate-200 bg-white/60 cursor-not-allowed'
        }
      `}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`${title} for Year ${year}${enabled ? ' - Available' : ' - Coming soon'}`}
    >
      {/* Status Badge */}
      <div className="absolute -top-2 -right-2">
        <span 
          className={`
            px-3 py-1 text-xs font-semibold rounded-full shadow-sm border
            ${enabled 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-slate-100 text-slate-700 border-slate-200'
            }
          `}
        >
          {enabled ? 'Available' : 'Coming soon'}
        </span>
      </div>

      {/* Content */}
      <div className="flex items-start space-x-4">
        {/* Icon */}
        <div className="flex-shrink-0">{Icon}</div>
        
        {/* Text Content */}
        <div className="flex-grow min-w-0">
          <div className="flex items-center space-x-2 mb-2">
            <h3 className={`text-lg font-extrabold ${enabled ? 'text-slate-900' : 'text-slate-700'}`}>
              Year {year}
            </h3>
            <span className="text-slate-300">•</span>
            <span className={`text-sm font-semibold ${enabled ? 'text-slate-700' : 'text-slate-600'}`}>
              {title}
            </span>
          </div>
          
          <p className={`text-sm leading-relaxed ${enabled ? 'text-slate-600' : 'text-slate-600'}`}>
            {description}
          </p>
          
          {enabled && (
            <div className="mt-4">
              <div className="btn-start">
                <span>Start</span>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M13 6l6 6-6 6" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};