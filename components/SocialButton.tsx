// components/SocialButton.tsx
interface SocialButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

const SocialButton: React.FC<SocialButtonProps> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="w-full bg-[#e50914] text-white font-bold py-3 rounded hover:bg-[#f40612] transition-all flex items-center justify-center gap-3"
  >
    {icon}
    <span>{label}</span>
  </button>
);

export default SocialButton;
