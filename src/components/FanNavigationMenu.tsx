// src/components/FanNavigationMenu.tsx

import React, { useState, useEffect } from 'react';

export interface MenuOption {
  name: string;
  subhead?: string;
  link: string;
  onClick?: () => void;
}

export interface FanNavigationMenuProps {
  options: MenuOption[];
  position: 'right-middle' | 'right-bottom' | 'right-top' | 'center-middle' | 'left-middle' | 'left-top' | 'left-bottom' | 'center-top' | 'center-bottom';
  size?: number;
  fanRadius?: number;
}

export const FanNavigationMenu: React.FC<FanNavigationMenuProps> = ({
  options,
  position,
  size = 60,
  fanRadius = 30
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const getPositionStyles = () => {
    const positions = {
      'right-middle': { right: '2rem', top: '50%', transform: 'translateY(-50%)' },
      'right-bottom': { right: '2rem', bottom: '2rem' },
      'right-top': { right: '2rem', top: '2rem' },
      'center-middle': { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' },
      'left-middle': { left: '2rem', top: '50%', transform: 'translateY(-50%)' },
      'left-top': { left: '2rem', top: '2rem' },
      'left-bottom': { left: '2rem', bottom: '2rem' },
      'center-top': { left: '50%', top: '2rem', transform: 'translateX(-50%)' },
      'center-bottom': { left: '50%', bottom: '2rem', transform: 'translateX(-50%)' }
    };
    return positions[position];
  };

  const calculateMenuItemPosition = (index: number, total: number) => {
    // Calculate angle for circular distribution
    const startAngle = position.includes('right') ? 180 : 
                     position.includes('left') ? 0 : 
                     position.includes('top') ? 90 : 270;
    
    const angleSpread = 80; // degrees - reduced for tighter clustering
    const angleStep = total > 1 ? angleSpread / (total - 1) : 0;
    const angle = startAngle + (angleStep * index) - (angleSpread / 2);
    const radian = (angle * Math.PI) / 180;
    
    const x = Math.cos(radian) * fanRadius;
    const y = Math.sin(radian) * fanRadius;
    
    return { x, y };
  };

  const gradientId = `fanGradient-${position}`;
  const glowId = `fanGlow-${position}`;

  return (
    <div 
      className="fixed z-50"
      style={getPositionStyles()}
    >
      {/* SVG Container for the fan effect */}
      <div className="relative">
        <svg
          width={fanRadius * 2 + size}
          height={fanRadius * 2 + size}
          className="absolute"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none'
          }}
        >
          {/* Define gradients and effects */}
          <defs>
            <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.8)" />
              <stop offset="30%" stopColor="rgba(200, 220, 255, 0.6)" />
              <stop offset="70%" stopColor="rgba(100, 150, 255, 0.4)" />
              <stop offset="100%" stopColor="rgba(50, 100, 200, 0.2)" />
            </radialGradient>
            
            <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge> 
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            
            <linearGradient id={`${gradientId}-glass`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.4)" />
              <stop offset="50%" stopColor="rgba(255, 255, 255, 0.1)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0.2)" />
            </linearGradient>
          </defs>


        </svg>

        {/* Menu Items */}
        {isOpen && options.map((option, index) => {
          const { x, y } = calculateMenuItemPosition(index, options.length);
          
          return (
            <div
              key={index}
              className={`absolute transition-all duration-500 ease-out ${
                isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
              }`}
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                transitionDelay: `${index * 50}ms`
              }}
            >
              <button
                onClick={option.onClick}
                className="group relative bg-gradient-to-br from-white/90 to-blue-100/80 backdrop-blur-lg 
                          border border-white/20 rounded-xl px-4 py-3 shadow-lg hover:shadow-xl 
                          transition-all duration-300 hover:scale-105 hover:from-white/95 hover:to-blue-50/90
                          min-w-[120px] text-left"
                style={{
                  backdropFilter: 'blur(16px)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)'
                }}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-800 group-hover:text-blue-800">
                    {option.name}
                  </span>
                  {option.subhead && (
                    <span className="text-xs text-gray-600 group-hover:text-blue-600">
                      {option.subhead}
                    </span>
                  )}
                </div>
                
                {/* Glassy highlight */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent 
                               opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </button>
            </div>
          );
        })}

        {/* Toggle Button */}
        <button
          onClick={toggleMenu}
          className={`relative w-${size/4} h-${size/4} bg-transparent
                     transition-transform duration-300 hover:scale-110
                     focus:outline-none focus:ring-4 focus:ring-blue-300/50
                     group`}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            background: 'transparent'
          }}
        >
          {/* Icon */}
          <svg
            className={`absolute inset-0 w-6 h-6 m-auto text-gray-800 transition-transform duration-300 ${
              isOpen ? 'rotate-45' : 'rotate-0'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
            />
          </svg>
        </button>
      </div>
    </div>
  );
};