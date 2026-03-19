import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './BookMenu.css';

export interface MenuOption {
  name: string;
  subhead?: string;
  link: string;
  onClick?: () => void;
}

export interface BookMenuProps {
  options: MenuOption[];
  position:
    | 'right-middle'
    | 'right-bottom'
    | 'right-top'
    | 'center-middle'
    | 'left-middle'
    | 'left-top'
    | 'left-bottom'
    | 'center-top'
    | 'center-bottom';
  size?: number;
  fanRadius?: number;
}

function getPositionStyles(position: BookMenuProps['position']): React.CSSProperties {
  const positions: Record<BookMenuProps['position'], React.CSSProperties> = {
    'right-middle': { right: '2rem', top: '50%', transform: 'translateY(-50%)' },
    'right-bottom': { right: '2rem', bottom: '2rem' },
    'right-top': { right: '2rem', top: '2rem' },
    'center-middle': { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' },
    'left-middle': { left: '2rem', top: '50%', transform: 'translateY(-50%)' },
    'left-top': { left: '2rem', top: '2rem' },
    'left-bottom': { left: '2rem', bottom: '2rem' },
    'center-top': { left: '50%', top: '2rem', transform: 'translateX(-50%)' },
    'center-bottom': { left: '50%', bottom: '2rem', transform: 'translateX(-50%)' },
  };

  return positions[position];
}

function positionClass(position: BookMenuProps['position']) {
  if (position.includes('right')) return 'book-pos-right';
  if (position.includes('left')) return 'book-pos-left';
  return 'book-pos-center';
}

export const BookMenu: React.FC<BookMenuProps> = ({ options, position, size = 70 }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const closeMenu = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Always drive toward collapsed.
    setIsOpen(false);
    if (isExpanded) {
      timeoutRef.current = window.setTimeout(() => {
        setIsExpanded(false);
        timeoutRef.current = null;
      }, 260);
    } else {
      setIsExpanded(false);
    }
  }, [isExpanded]);

  // Whenever we navigate, reset the menu so it doesn't stay open across pages.
  useEffect(() => {
    closeMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleBook = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Closed -> (expand) -> open
    if (!isExpanded) {
      setIsExpanded(true);
      timeoutRef.current = window.setTimeout(() => {
        setIsOpen(true);
        timeoutRef.current = null;
      }, 260);
      return;
    }

    // Open -> close -> (shrink)
    if (isOpen) {
      setIsOpen(false);
      timeoutRef.current = window.setTimeout(() => {
        setIsExpanded(false);
        timeoutRef.current = null;
      }, 260);
      return;
    }

    // Expanded but closed -> open
    setIsOpen(true);
  };

  const handleLinkClick = (e: React.MouseEvent, option: MenuOption) => {
    e.stopPropagation();

    closeMenu();

    if (option.onClick) {
      option.onClick();
      return;
    }

    if (option.link) {
      navigate(option.link);
    }
  };

  const [leftOptions, rightOptions] = useMemo(() => {
    const splitIndex = Math.ceil(options.length / 2);
    return [options.slice(0, splitIndex), options.slice(splitIndex)];
  }, [options]);

  const sceneSize = useMemo(() => {
    // Existing callers pass size≈70. Map that to a book that is usable but not full-screen.
    const width = Math.round(size * 4);
    const height = Math.round(size * 5);
    return { width, height };
  }, [size]);

  return (
    <div
      className={`book-container ${positionClass(position)} ${isExpanded ? 'book-expanded' : 'book-collapsed'}`}
      style={{
        ...getPositionStyles(position),
        // CSS variables for sizing (used in BookMenu.css)
        ['--book-w' as any]: `${sceneSize.width}px`,
        ['--book-h' as any]: `${sceneSize.height}px`,
      }}
    >
      <div className="book-shell">
        <div className="scene">
          <div className={`book ${isOpen ? 'open' : ''}`} onClick={toggleBook} role="button" tabIndex={0}>
          {/* The Moving Part (Cover + Left Page) */}
          <div className="front-wrapper">
            {/* Front Cover Design */}
            <div className="front-cover">
              <div className="book-cover-icon" aria-hidden="true">
                <svg
                  width="52"
                  height="52"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 6h16" />
                  <path d="M4 12h16" />
                  <path d="M4 18h16" />
                </svg>
              </div>
            </div>

            {/* Left Page Menu (Visible when open) */}
            <div className="left-page">
              <h2 className="book-page-title" aria-label="Main">
                <span className="sr-only">Main</span>
                {/* Home icon */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 10.5 12 3l9 7.5" />
                  <path d="M5 10v10h14V10" />
                  <path d="M9 20v-6h6v6" />
                </svg>
              </h2>
              <ul className="book-menu">
                {leftOptions.map((option) => (
                  <li key={option.link || option.name}>
                    <button
                      type="button"
                      className="book-link"
                      onClick={(e) => handleLinkClick(e, option)}
                    >
                      {option.name}
                    </button>
                    {option.subhead ? <div className="book-sublink">{option.subhead}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* The Static Part (Right Page) */}
          <div className="right-page">
            <h2 className="book-page-title" aria-label="Works">
              <span className="sr-only">Works</span>
              {/* Grid icon */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4h7v7H4z" />
                <path d="M13 4h7v7h-7z" />
                <path d="M4 13h7v7H4z" />
                <path d="M13 13h7v7h-7z" />
              </svg>
            </h2>
            <ul className="book-menu">
              {rightOptions.map((option) => (
                <li key={option.link || option.name}>
                  <button
                    type="button"
                    className="book-link"
                    onClick={(e) => handleLinkClick(e, option)}
                  >
                    {option.name}
                  </button>
                  {option.subhead ? <div className="book-sublink">{option.subhead}</div> : null}
                </li>
              ))}
            </ul>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};
