export interface NavItem {
  label: string;
  href: string;
  external?: boolean;
}

export interface DocSection {
  title: string;
  items: NavItem[];
}

export const mainNav: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Docs', href: '/docs' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'GitHub', href: 'https://github.com/momokii/thermavibe', external: true },
];

export const docSections: DocSection[] = [
  {
    title: 'Getting Started',
    items: [
      { label: 'Getting Started', href: '/docs/getting-started' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { label: 'Architecture', href: '/docs/architecture' },
      { label: 'Configuration', href: '/docs/configuration' },
      { label: 'API Reference', href: '/docs/api-reference' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Deployment', href: '/docs/deployment' },
      { label: 'Troubleshooting', href: '/docs/troubleshooting' },
    ],
  },
  {
    title: 'Contributing',
    items: [
      { label: 'Development', href: '/docs/development' },
    ],
  },
];
