import { X } from 'lucide-react';

interface MobileMenuProps {
  onClose: () => void;
}

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Docs', href: '/docs' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'GitHub', href: 'https://github.com/momokii/thermavibe', external: true },
];

export default function MobileMenu({ onClose }: MobileMenuProps) {
  return (
    <div className="fixed inset-0 bg-[#0f0a1a]/95 z-50 flex flex-col items-center justify-center gap-8">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 text-[#94a3b8] hover:text-white transition-colors"
        aria-label="Close menu"
      >
        <X size={24} />
      </button>

      {/* Nav links */}
      {navLinks.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target={link.external ? '_blank' : undefined}
          rel={link.external ? 'noopener noreferrer' : undefined}
          onClick={onClose}
          className="text-2xl font-semibold text-white no-underline hover:text-[#8b5cf6] transition-colors"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}
