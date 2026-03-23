/**
 * HaloSync Logo Component
 * Falcon-inspired design with HaloSync branding
 */

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'icon';
  className?: string;
}

const sizes = {
  sm: { icon: 24, text: 'text-base' },
  md: { icon: 32, text: 'text-lg' },
  lg: { icon: 48, text: 'text-2xl' },
};

// Falcon icon SVG - stylized bird/aircraft shape
function FalconIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Gradient definitions */}
      <defs>
        <linearGradient id="falcon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6442d6" />
          <stop offset="100%" stopColor="#d14984" />
        </linearGradient>
        <linearGradient id="falcon-wing" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#21a35d" />
          <stop offset="100%" stopColor="#6442d6" />
        </linearGradient>
      </defs>

      {/* Main body - falcon shape */}
      <path
        d="M24 4L30 14L24 11L18 14L24 4Z"
        fill="url(#falcon-gradient)"
      />
      <path
        d="M24 11L30 14L38 26L30 22L24 34L18 22L10 26L18 14L24 11Z"
        fill="url(#falcon-gradient)"
      />

      {/* Wings - extended */}
      <path
        d="M10 26L18 22L14 30L6 32L10 26Z"
        fill="url(#falcon-wing)"
        opacity="0.9"
      />
      <path
        d="M38 26L30 22L34 30L42 32L38 26Z"
        fill="url(#falcon-wing)"
        opacity="0.9"
      />

      {/* Tail feathers */}
      <path
        d="M24 34L28 40L24 44L20 40L24 34Z"
        fill="url(#falcon-gradient)"
        opacity="0.8"
      />
    </svg>
  );
}

export function Logo({ size = 'md', variant = 'full', className = '' }: LogoProps) {
  const sizeConfig = sizes[size];

  if (variant === 'icon') {
    return (
      <div className={`flex-shrink-0 ${className}`}>
        <FalconIcon size={sizeConfig.icon} />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <FalconIcon size={sizeConfig.icon} />
      <div className="flex flex-col">
        <span className={`font-bold text-text-primary ${sizeConfig.text} leading-tight`}>
          PolarHub
        </span>
        <span className="text-xs text-halo-purple font-medium -mt-0.5">
          by HaloSync
        </span>
      </div>
    </div>
  );
}

// Simple falcon icon for favicons and small contexts
export function FalconMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-halo-purple to-halo-magenta rounded-lg ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 2L15 7L12 5.5L9 7L12 2Z"
          fill="white"
        />
        <path
          d="M12 5.5L15 7L19 13L15 11L12 17L9 11L5 13L9 7L12 5.5Z"
          fill="white"
        />
        <path
          d="M12 17L14 20L12 22L10 20L12 17Z"
          fill="white"
          opacity="0.8"
        />
      </svg>
    </div>
  );
}
