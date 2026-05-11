import { useState } from 'react';

type FilterType = 'all' | 'vibe-check' | 'photobooth';

const filters: { label: string; value: FilterType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Vibe Check', value: 'vibe-check' },
  { label: 'Photobooth', value: 'photobooth' },
];

export default function GalleryFilter() {
  const [active, setActive] = useState<FilterType>('all');

  const handleFilter = (value: FilterType) => {
    setActive(value);
    const items = document.querySelectorAll('.gallery-item');
    items.forEach((item) => {
      const el = item as HTMLElement;
      const type = el.dataset.type;
      if (value === 'all' || type === value) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  };

  return (
    <div className="flex flex-wrap justify-center gap-3 mb-8">
      {filters.map((filter) => (
        <button
          key={filter.value}
          onClick={() => handleFilter(filter.value)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            active === filter.value
              ? 'bg-[#8b5cf6] text-white'
              : 'bg-[#211c3a] text-[#94a3b8] hover:text-white'
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
