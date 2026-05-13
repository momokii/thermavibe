export interface GalleryItem {
  id: string;
  type: 'vibe-check' | 'photobooth';
  title: string;
  description: string;
  image: string;
}

export const galleryItems: GalleryItem[] = [
  {
    id: 'vibe-demo-1',
    type: 'vibe-check',
    title: 'Vibe Check — Capture & AI Analysis',
    description: 'See the complete flow: camera preview, photo capture, AI personality reading generation, and the final printed receipt.',
    image: '/images/gallery/thermavibe1-vibechek-demo.gif',
  },
  {
    id: 'vibe-demo-2',
    type: 'vibe-check',
    title: 'Vibe Check — AI Reading Reveal',
    description: 'Watch the AI-generated personality reading appear with the signature dithered receipt aesthetic and custom footer.',
    image: '/images/gallery/thermavibe2-vibecheck-demo2.gif',
  },
  {
    id: 'photo-demo-1',
    type: 'photobooth',
    title: 'Photobooth — Multi-Photo Strip',
    description: 'Capture 2-8 photos with a countdown timer, review your shots, and receive a composite photo strip with custom themes.',
    image: '/images/gallery/thermavibe2-1-photobooth-demo.gif',
  },
  {
    id: 'vibe-demo-3',
    type: 'vibe-check',
    title: 'Analytics Dashboard',
    description: 'Real-time session analytics with drop-off funnel, period-over-period comparisons, and CSV/PDF export.',
    image: '/images/gallery/thermavibe3-3-analytics.gif',
  },
  {
    id: 'photo-demo-2',
    type: 'photobooth',
    title: 'Print Template Config',
    description: 'Customize receipt footers with brand name, timezone-aware timestamps, and per-element toggles.',
    image: '/images/gallery/thermavibe3-4-print-template.gif',
  },
  {
    id: 'photo-demo-3',
    type: 'photobooth',
    title: 'Access Code System',
    description: 'Generate batches of pre-paid codes with QR codes, track redemptions, and print physical receipts for event distribution.',
    image: '/images/gallery/thermavibe3-5-access-code.gif',
  },
  {
    id: 'photo-demo-4',
    type: 'photobooth',
    title: 'Gallery Management',
    description: 'Browse, view, and manage all past sessions. Delete items or manually reprint directly from the admin panel.',
    image: '/images/gallery/thermavibe3-5-gallery.gif',
  },
  {
    id: 'photo-demo-5',
    type: 'photobooth',
    title: 'Access Code QR & Print',
    description: 'Each access code gets a scannable QR code. Print them as physical receipts to hand out at events.',
    image: '/images/gallery/thermavibe3-6-test-access-code.gif',
  },
];
