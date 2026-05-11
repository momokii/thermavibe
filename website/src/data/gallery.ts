export interface GalleryItem {
  id: string;
  type: 'vibe-check' | 'photobooth';
  title: string;
  description: string;
  image: string;
}

export const galleryItems: GalleryItem[] = [
  {
    id: 'vibe-1',
    type: 'vibe-check',
    title: 'Cosmic Energy',
    description: 'A vibe reading that channels stellar energy and cosmic alignment.',
    image: '/images/gallery/placeholder-vibe-1.svg',
  },
  {
    id: 'vibe-2',
    type: 'vibe-check',
    title: 'Main Character',
    description: 'The protagonist energy reading — bold, confident, unforgettable.',
    image: '/images/gallery/placeholder-vibe-2.svg',
  },
  {
    id: 'vibe-3',
    type: 'vibe-check',
    title: 'Golden Hour',
    description: 'Warm, radiant personality that lights up every room.',
    image: '/images/gallery/placeholder-vibe-3.svg',
  },
  {
    id: 'vibe-4',
    type: 'vibe-check',
    title: 'Midnight Mystery',
    description: 'Enigmatic and deep — the vibe that keeps everyone guessing.',
    image: '/images/gallery/placeholder-vibe-4.svg',
  },
  {
    id: 'photo-1',
    type: 'photobooth',
    title: 'Retro Strip',
    description: 'Classic 4-photo strip with vintage color grading and white borders.',
    image: '/images/gallery/placeholder-photo-1.svg',
  },
  {
    id: 'photo-2',
    type: 'photobooth',
    title: 'Neon Nights',
    description: 'Cyberpunk-themed strip with neon pink and cyan highlights.',
    image: '/images/gallery/placeholder-photo-2.svg',
  },
  {
    id: 'photo-3',
    type: 'photobooth',
    title: 'Minimal Mono',
    description: 'Clean black and white strip with high contrast and tight crops.',
    image: '/images/gallery/placeholder-photo-3.svg',
  },
  {
    id: 'photo-4',
    type: 'photobooth',
    title: 'Party Mode',
    description: 'Colorful strip with confetti overlay and saturated tones.',
    image: '/images/gallery/placeholder-photo-4.svg',
  },
];
