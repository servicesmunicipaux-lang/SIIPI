import React from 'react';

interface LogoProps {
  className?: string;
  variant?: 'full' | 'compact' | 'icon' | 'badge';
  theme?: 'dark' | 'light' | 'auto';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * FNCT - Fédération Nationale des Communes Tunisiennes
 * شبكة التصرف في النفايات / Waste Management Network
 */
export const FNCTLogo: React.FC<LogoProps> = ({ 
  className = '', 
  variant = 'full', 
  theme = 'auto',
  size = 'md' 
}) => {
  const isDark = theme === 'dark' || theme === 'auto';
  
  // Responsive / sizing scale
  const sizeClasses = {
    sm: 'h-7',
    md: 'h-10',
    lg: 'h-14',
    xl: 'h-20'
  };

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* Multi-color Circular Arc Symbol */}
      <svg 
        viewBox="0 0 100 100" 
        className={`${sizeClasses[size]} w-auto shrink-0 drop-shadow-sm`}
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer Dark Blue / Purple Arc */}
        <path 
          d="M 15 50 A 35 35 0 0 1 85 50" 
          stroke="#252466" 
          strokeWidth="11" 
          strokeLinecap="round"
        />
        {/* Red Arc */}
        <path 
          d="M 24 50 A 26 26 0 0 1 76 50" 
          stroke="#E20E17" 
          strokeWidth="9" 
          strokeLinecap="round"
        />
        {/* Cyan / Teal Lower Arc */}
        <path 
          d="M 15 50 A 35 35 0 0 0 50 85" 
          stroke="#00AEEF" 
          strokeWidth="11" 
          strokeLinecap="round"
        />
        {/* Yellow Lower Arc */}
        <path 
          d="M 26 50 A 24 24 0 0 0 70 74" 
          stroke="#FFC20E" 
          strokeWidth="9" 
          strokeLinecap="round"
        />
        {/* Inner Green Arc / Leaf Segment */}
        <path 
          d="M 45 32 A 18 18 0 0 1 68 50 A 18 18 0 0 1 45 68" 
          stroke="#7AC143" 
          strokeWidth="8" 
          strokeLinecap="round"
        />
      </svg>

      {/* Typography Section */}
      {variant !== 'icon' && (
        <div className="flex flex-col justify-center leading-tight">
          <div className="flex flex-col">
            <span className={`font-black tracking-tight text-right ${isDark ? 'text-white' : 'text-slate-900'} ${size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-sm'}`} dir="rtl" style={{ fontFamily: 'Cairo, sans-serif' }}>
              الجامعة الوطنية للبلديات التونسية
            </span>
            <span className={`font-extrabold uppercase tracking-wider text-[9px] sm:text-[10px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Fédération Nationale des Communes Tunisiennes
            </span>
          </div>

          {(variant === 'full' || variant === 'badge') && (
            <div className="mt-1 pt-0.5 border-t border-slate-700/60 flex items-center justify-between gap-2">
              <span className="font-bold text-[#7AC143] text-[10px] sm:text-xs" dir="rtl" style={{ fontFamily: 'Cairo, sans-serif' }}>
                شبكة التصرف في النفايات
              </span>
              <span className="font-semibold text-cyan-400 text-[9px] sm:text-[10px] uppercase font-mono">
                Waste Management Network
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Tunisian Republic Coat of Arms (Armoiries de la République Tunisienne)
 * Shield with Golden Galley, Scales of Justice, Lion with Sword & Motto
 */
export const TunisianCoatOfArmsLogo: React.FC<LogoProps> = ({ 
  className = '', 
  size = 'md' 
}) => {
  const sizeClasses = {
    sm: 'h-8',
    md: 'h-11',
    lg: 'h-16',
    xl: 'h-24'
  };

  return (
    <div className={`inline-flex items-center shrink-0 ${className}`}>
      <svg 
        viewBox="0 0 200 290" 
        className={`${sizeClasses[size]} w-auto drop-shadow-md`}
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Top Crest: Tunisian National Emblem in Red Circle */}
        <circle cx="100" cy="35" r="30" fill="#E20E17" stroke="#FFFFFF" strokeWidth="3" />
        <circle cx="100" cy="35" r="24" fill="#FFFFFF" />
        <circle cx="100" cy="35" r="18" fill="#E20E17" />
        <circle cx="105" cy="35" r="15" fill="#FFFFFF" />
        {/* Five-pointed star */}
        <polygon 
          points="102,26 104,32 110,32 105,36 107,42 102,38 97,42 99,36 94,32 100,32" 
          fill="#E20E17" 
        />

        {/* Main Golden Shield */}
        <path 
          d="M 20 80 Q 50 65 100 65 Q 150 65 180 80 Q 185 180 100 275 Q 15 180 20 80 Z" 
          fill="#E6B828" 
          stroke="#1E1E1E" 
          strokeWidth="5" 
        />
        
        {/* Inner Shield Border */}
        <path 
          d="M 26 84 Q 52 71 100 71 Q 148 71 174 84 Q 178 175 100 265 Q 22 175 26 84 Z" 
          fill="#F5CC38" 
          stroke="#B38600" 
          strokeWidth="2" 
        />

        {/* Top Section: Marine Galley (Punic / Carthage Sailing Ship) */}
        {/* Blue Sea line */}
        <path d="M 24 135 Q 100 130 176 135 L 176 142 Q 100 137 24 142 Z" fill="#0080FF" />
        {/* Ship Hull */}
        <path d="M 45 130 Q 100 138 155 125 L 148 112 Q 100 120 52 115 Z" fill="#994D1A" stroke="#4A2500" strokeWidth="2" />
        {/* Sails */}
        <path d="M 60 114 Q 55 85 80 82 Q 78 114 60 114 Z" fill="#FFFFFF" stroke="#333333" strokeWidth="1.5" />
        <path d="M 85 114 Q 82 78 118 75 Q 112 114 85 114 Z" fill="#FFFFFF" stroke="#333333" strokeWidth="1.5" />
        <path d="M 122 114 Q 120 80 152 82 Q 145 114 122 114 Z" fill="#FFFFFF" stroke="#333333" strokeWidth="1.5" />

        {/* Central National Motto Ribbon: حرية - نظام - عدالة */}
        <path 
          d="M 20 152 Q 100 140 180 152 L 175 168 Q 100 155 25 168 Z" 
          fill="#E6B828" 
          stroke="#1E1E1E" 
          strokeWidth="2.5" 
        />
        <text 
          x="100" 
          y="163" 
          textAnchor="middle" 
          fill="#000000" 
          fontSize="11" 
          fontWeight="900" 
          fontFamily="Cairo, sans-serif"
        >
          حرية • نظام • عدالة
        </text>

        {/* Vertical divider */}
        <line x1="100" y1="168" x2="100" y2="265" stroke="#1E1E1E" strokeWidth="3" />

        {/* Left Section: Balance of Justice (الميزان) */}
        <g transform="translate(32, 175)">
          <line x1="28" y1="5" x2="28" y2="65" stroke="#1E1E1E" strokeWidth="2.5" />
          <line x1="8" y1="15" x2="48" y2="15" stroke="#1E1E1E" strokeWidth="2.5" />
          {/* Left Pan */}
          <line x1="8" y1="15" x2="2" y2="35" stroke="#1E1E1E" strokeWidth="1.5" />
          <line x1="8" y1="15" x2="14" y2="35" stroke="#1E1E1E" strokeWidth="1.5" />
          <path d="M 0 35 Q 8 42 16 35 Z" fill="#1E1E1E" />
          {/* Right Pan */}
          <line x1="48" y1="15" x2="42" y2="35" stroke="#1E1E1E" strokeWidth="1.5" />
          <line x1="48" y1="15" x2="54" y2="35" stroke="#1E1E1E" strokeWidth="1.5" />
          <path d="M 40 35 Q 48 42 56 35 Z" fill="#1E1E1E" />
        </g>

        {/* Right Section: Black Lion with Scimitar (الأسد الحامل للسيف) */}
        <g transform="translate(112, 175)">
          {/* Lion silhouette */}
          <path 
            d="M 35 15 Q 42 10 40 22 Q 45 25 38 32 Q 42 40 38 48 Q 45 55 42 68 L 32 68 Q 30 58 25 55 Q 20 62 18 68 L 10 68 Q 12 55 18 45 Q 15 35 22 28 Q 20 22 28 20 Q 25 15 35 15 Z" 
            fill="#1E1E1E" 
          />
          {/* Lion Tail */}
          <path d="M 38 48 Q 55 42 52 28 Q 48 20 54 18" stroke="#1E1E1E" strokeWidth="3" fill="none" />
          {/* Sword / Scimitar in hand */}
          <path d="M 22 22 L 10 12 Q 12 8 18 10 Z" fill="#C0C0C0" stroke="#1E1E1E" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
};

/**
 * ANGeD - Agence Nationale de Gestion des Déchets
 * الوكالة الوطنية للتصرف في النفايات
 */
export const ANGeDLogo: React.FC<LogoProps> = ({ 
  className = '', 
  variant = 'full', 
  theme = 'auto',
  size = 'md' 
}) => {
  const isDark = theme === 'dark' || theme === 'auto';

  const sizeClasses = {
    sm: 'h-8',
    md: 'h-11',
    lg: 'h-14',
    xl: 'h-20'
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Circular Dynamic Arrow Symbol */}
      <svg 
        viewBox="0 0 100 100" 
        className={`${sizeClasses[size]} w-auto shrink-0 drop-shadow-sm`}
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background Sphere: Split Green & Orange */}
        <circle cx="50" cy="50" r="44" fill="#F7A823" />
        <path d="M 50 6 A 44 44 0 0 0 50 94 Z" fill="#00A859" />

        {/* Dynamic White Overlay Arrows (Recycling & Flow) */}
        {/* Top-Right Arrow */}
        <path d="M 38 60 L 52 42 L 68 28 L 74 44 L 84 22 L 58 18 L 64 28 L 48 42 Z" fill="#FFFFFF" />
        {/* Bottom-Right Arrow */}
        <path d="M 40 40 L 46 56 L 62 70 L 68 62 L 78 84 L 56 80 L 60 72 L 46 58 Z" fill="#FFFFFF" />
        {/* Top-Left Arrow */}
        <path d="M 58 48 L 42 38 L 26 26 L 24 38 L 14 18 L 36 20 L 30 30 L 44 40 Z" fill="#FFFFFF" />
      </svg>

      {/* Typography */}
      {variant !== 'icon' && (
        <div className="flex flex-col justify-center leading-tight">
          <span 
            className="font-black text-[#00A859] tracking-tight text-right text-xs sm:text-sm" 
            dir="rtl" 
            style={{ fontFamily: 'Cairo, sans-serif' }}
          >
            الوكالة الوطنية للتصرف في النفايات
          </span>
          <div className="flex items-center gap-2 border-t border-[#F7A823] pt-0.5 mt-0.5">
            <span className="font-black italic text-lg sm:text-xl text-[#00A859] tracking-tighter">
              ANGed
            </span>
            <span className={`text-[9px] uppercase font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Agence Nationale de Gestion des Déchets
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Official Tunisian Flag Badge
 */
export const TunisianFlagBadge: React.FC<{ className?: string; size?: 'sm' | 'md' | 'lg' }> = ({ 
  className = '',
  size = 'md' 
}) => {
  const sizeClasses = {
    sm: 'w-6 h-4',
    md: 'w-8 h-5.5',
    lg: 'w-12 h-8'
  };

  return (
    <svg 
      className={`${sizeClasses[size]} rounded shadow-sm border border-slate-200/20 shrink-0 ${className}`} 
      viewBox="0 0 30 20" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="30" height="20" fill="#E20E17" />
      <circle cx="15" cy="10" r="6" fill="#FFFFFF" />
      <circle cx="15.5" cy="10" r="4.8" fill="#E20E17" />
      <circle cx="16.2" cy="10" r="4.1" fill="#FFFFFF" />
      <path d="M16 10L14.4 11.2L15 9.3L13.4 8.1L15.4 8.1L16 6.2L16.6 8.1L18.6 8.1L17 9.3L17.6 11.2L16 10Z" fill="#E20E17" />
    </svg>
  );
};

/**
 * Institutional Banner with 3 Official Logos:
 * 1. FNCT (Fédération Nationale des Communes Tunisiennes - Waste Management Network)
 * 2. Armoiries de la République Tunisienne
 * 3. ANGeD (Agence Nationale de Gestion des Déchets)
 */
export const InstitutionalLogosBanner: React.FC<{
  className?: string;
  theme?: 'dark' | 'light' | 'auto';
  compact?: boolean;
}> = ({ className = '', theme = 'auto', compact = false }) => {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl ${className}`}>
      {/* FNCT Waste Management Network */}
      <div className="flex items-center gap-3">
        <FNCTLogo variant={compact ? "compact" : "full"} theme={theme} size={compact ? "sm" : "md"} />
      </div>

      {/* Armoiries Nationales & Titre */}
      <div className="flex items-center gap-3 border-x border-slate-800 px-4 py-1">
        <TunisianCoatOfArmsLogo size={compact ? "sm" : "md"} />
        <div className="text-center hidden sm:block">
          <span className="text-xs font-black text-amber-400 uppercase tracking-wider block">
            الجمهورية التونسية
          </span>
          <span className="text-[10px] text-slate-400 font-bold block">
            République Tunisienne
          </span>
        </div>
      </div>

      {/* ANGeD */}
      <div className="flex items-center gap-3">
        <ANGeDLogo variant={compact ? "compact" : "full"} theme={theme} size={compact ? "sm" : "md"} />
      </div>
    </div>
  );
};
