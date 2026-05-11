export interface Feature {
  title: string;
  description: string;
  icon: string;
}

export const features: Feature[] = [
  {
    title: 'Vibe Check',
    description:
      'Snap a single photo and get an AI-generated personality reading printed on a thermal receipt. Perfect for events, parties, and pop-ups where guests want a fun, shareable takeaway.',
    icon: 'sparkles',
  },
  {
    title: 'Photobooth Mode',
    description:
      'Capture multi-photo strips with customizable themes, filters, and layouts. Guests choose from curated visual styles and walk away with a printed strip in seconds.',
    icon: 'camera',
  },
  {
    title: '5 AI Providers',
    description:
      'Switch between OpenAI, Anthropic, Google Vision, Ollama (local), or the built-in mock provider with zero code changes. Automatic fallback ensures the booth never goes down.',
    icon: 'brain',
  },
  {
    title: 'QRIS Payments',
    description:
      'Accept payments via Midtrans or Xendit with standard QRIS codes. Toggle payments on or per-event, or use the mock provider for free-mode deployments.',
    icon: 'credit-card',
  },
  {
    title: 'Access Codes',
    description:
      'Generate batch access codes for events with QR codes for quick scanning. Track redemption, set expiry, and manage capacity all from the admin dashboard.',
    icon: 'ticket',
  },
  {
    title: 'Admin Dashboard',
    description:
      'Monitor real-time analytics, revenue heatmaps, session funnels, and print statistics from a web dashboard. Everything you need to run a profitable kiosk operation.',
    icon: 'bar-chart-3',
  },
];
