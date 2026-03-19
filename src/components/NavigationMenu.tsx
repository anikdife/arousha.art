import React, { useState } from 'react';

export interface MenuOption {
  label: string;
  sublabel?: string;
  onClick: () => void;
  color?: string;
}

export interface NavigationMenuProps {
  options: MenuOption[];
  radius?: number;
  thickness?: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'middle-left' | 'middle-right';
  iconSize?: number;
  fontSize?: {
    main: number;
    sub: number;
    center: number;
    centerSub: number;
  };
  colors?: {
    primary: string;
    secondary: string;
    background: string;
  };
}

const DEFAULT_COLORS = ['#8B5CF6', '#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#EF4444'];

const getPositionClasses = (position: string) => {
  switch (position) {
    case 'top-left': return 'top-4 left-4';
    case 'top-right': return 'top-4 right-4';
    case 'bottom-left': return 'bottom-4 left-4';
    case 'bottom-right': return 'bottom-4 right-4';
    case 'middle-left': return 'top-1/2 left-4 -translate-y-1/2';
    case 'middle-right': return 'top-1/2 right-4 -translate-y-1/2';
    default: return 'top-1/2 right-4 -translate-y-1/2';
  }
};

const createFanPath = (
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
) => {
  const startAngleRad = (startAngle * Math.PI) / 180;
  const endAngleRad = (endAngle * Math.PI) / 180;

  const x1 = centerX + innerRadius * Math.cos(startAngleRad);
  const y1 = centerY + innerRadius * Math.sin(startAngleRad);
  const x2 = centerX + outerRadius * Math.cos(startAngleRad);
  const y2 = centerY + outerRadius * Math.sin(startAngleRad);

  const x3 = centerX + outerRadius * Math.cos(endAngleRad);
  const y3 = centerY + outerRadius * Math.sin(endAngleRad);
  const x4 = centerX + innerRadius * Math.cos(endAngleRad);
  const y4 = centerY + innerRadius * Math.sin(endAngleRad);

  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M", x1, y1,
    "L", x2, y2,
    "A", outerRadius, outerRadius, 0, largeArcFlag, 1, x3, y3,
    "L", x4, y4,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 0, x1, y1,
    "Z"
  ].join(" ");
};

export const NavigationMenu: React.FC<NavigationMenuProps> = ({
  options,
  radius = 140,
  thickness = 120,
  position = 'middle-right',
  iconSize = 16,
  fontSize = { main: 18, sub: 14, center: 16, centerSub: 12 },
  colors = { primary: '#8B5CF6', secondary: '#EC4899', background: '#1F2937' }
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  // Calculate geometry
  const svgSize = radius * 2 + 40;
  const centerX = svgSize / 2;
  const centerY = svgSize / 2;
  const innerRadius = 15; // Much smaller inner radius, just enough space for toggle button
  const anglePerSegment = 180 / options.length;
  const startAngle = 90; // Start from bottom to create left semicircle

  const positionClasses = getPositionClasses(position);

  return (
    <div className={`fixed ${positionClasses} transform z-50`}>
      {/* Toggle Button */}
      <button
        onClick={toggleMenu}
        className={`relative text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-purple-300`}
        style={{
          background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
          width: `${iconSize + 24}px`,
          height: `${iconSize + 24}px`,
          marginTop: `-${radius + 12}px`,
          zIndex: 60
        }}
        aria-label="Toggle navigation menu"
      >
        <svg 
          width={iconSize}
          height={iconSize}
          className={`transition-transform duration-300 ${isMenuOpen ? 'rotate-45' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          {isMenuOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Fan Menu SVG */}
      <div 
        className={`absolute top-1/2 transform -translate-y-1/2 transition-all duration-300 ${
          position.includes('right') 
            ? `right-full ${isMenuOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-75 translate-x-8 pointer-events-none'}`
            : `left-full ${isMenuOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-75 -translate-x-8 pointer-events-none'}`
        }`}
        style={{
          marginRight: position.includes('right') ? '12px' : undefined,
          marginLeft: position.includes('left') ? '12px' : undefined
        }}
      >
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          className="drop-shadow-lg"
        >
          {/* Gradient Definitions */}
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge> 
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            {options.map((_, index) => (
              <radialGradient key={`grad-${index}`} id={`gradient-${index}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={DEFAULT_COLORS[index % DEFAULT_COLORS.length]} stopOpacity="0.9" />
                <stop offset="100%" stopColor={DEFAULT_COLORS[index % DEFAULT_COLORS.length]} stopOpacity="0.6" />
              </radialGradient>
            ))}
          </defs>

          {/* Fan Segments */}
          {options.map((option, index) => {
            const segmentStartAngle = startAngle + (index * anglePerSegment);
            const segmentEndAngle = segmentStartAngle + anglePerSegment - 2; // 2deg gap
            const path = createFanPath(centerX, centerY, innerRadius, radius, segmentStartAngle, segmentEndAngle);
            
            // Calculate text position
            const textAngle = ((segmentStartAngle + segmentEndAngle) / 2) * Math.PI / 180;
            const textRadius = innerRadius + (thickness * 0.6);
            const textX = centerX + textRadius * Math.cos(textAngle);
            const textY = centerY + textRadius * Math.sin(textAngle);

            return (
              <g key={index}>
                {/* Segment Path */}
                <path
                  d={path}
                  fill={`url(#gradient-${index})`}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1"
                  className="cursor-pointer transition-all duration-200 hover:brightness-110"
                  filter="url(#glow)"
                  onClick={option.onClick}
                />
                
                {/* Main Label */}
                <text
                  x={textX}
                  y={textY - 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={fontSize.main}
                  fontWeight="600"
                  fill="rgba(255,255,255,0.92)"
                  stroke="rgba(0,0,0,0.25)"
                  strokeWidth="1"
                  className="pointer-events-none select-none cursor-pointer"
                  onClick={option.onClick}
                >
                  {option.label}
                </text>

                {/* Sublabel */}
                {option.sublabel && (
                  <text
                    x={textX}
                    y={textY + fontSize.main}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fontSize.sub}
                    fontWeight="500"
                    fill="rgba(255,255,255,0.72)"
                    stroke="rgba(0,0,0,0.18)"
                    strokeWidth="1"
                    className="pointer-events-none select-none cursor-pointer"
                    onClick={option.onClick}
                  >
                    {option.sublabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};