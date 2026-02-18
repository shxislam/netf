// components/Logo.tsx
const Logo: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.901 1.153h3.68l-3.716 4.53 3.716 4.53h-3.68l-3.716-4.53 3.716-4.53zM7.744 18.901h-3.68L0 14.371l3.716-4.53h3.68l-3.716 4.53 3.716 4.53zM18.901 1.153L0 14.371l3.716 4.53L22.581 5.683l-3.68-4.53z"/>
  </svg>
);
export default Logo;
