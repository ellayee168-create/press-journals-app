export interface JournalConfig {
  name: string;
  /** Primary accent color (hex) — used for title, headings, bar */
  color: string;
  /** Darker shade for the issue box and "Press Journals" wordmark */
  dark: string;
}

// Each journal has a themed accent (used for the title, headings, and footer bar)
// and a darker shade (issue box + wordmark). Editors can refine these exact hexes.
export const JOURNALS: JournalConfig[] = [
  {
    name: 'Environment, Ecology, & Earth Protections',
    color: '#2E7D32', // green
    dark: '#1B5E20',
  },
  {
    name: 'Education & Public Health in a Changing World',
    color: '#7B3FA0', // purple
    dark: '#4A148C',
  },
  {
    name: 'Investigations of History & Society',
    color: '#8C2332', // maroon
    dark: '#5A1520',
  },
  {
    name: 'Journal of Novel Mathematical Advances',
    color: '#7A5230', // brown
    dark: '#4E3620',
  },
  {
    name: 'New Frontiers in Biology, Medicine, & Chemistry',
    color: '#2BA4C8', // blue
    dark: '#1B3A5C',
  },
  {
    name: 'Nanotechnology & Physical Sciences Quarterly',
    color: '#4A5568', // dark gray
    dark: '#2D3748',
  },
];

export function getJournalConfig(name: string): JournalConfig {
  return JOURNALS.find(j => j.name === name) ?? JOURNALS[0];
}

export function getJournalNames(): string[] {
  return JOURNALS.map(j => j.name);
}
