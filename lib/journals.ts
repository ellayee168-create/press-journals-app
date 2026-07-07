export interface JournalConfig {
  name: string;
  /** Primary accent color (hex) — used for title, headings, bar */
  color: string;
  /** Darker shade for the issue box and "Press Journals" wordmark */
  dark: string;
}

// Update colors here once the editors provide the official hex codes.
export const JOURNALS: JournalConfig[] = [
  {
    name: 'New Frontiers in Biology, Medicine, and Chemistry',
    color: '#2BA4C8',
    dark: '#1B3A5C',
  },
  {
    name: 'Advances in Physics, Earth Science, and Engineering',
    color: '#2BA4C8',
    dark: '#1B3A5C',
  },
  {
    name: 'Perspectives in Mathematics and Computer Science',
    color: '#2BA4C8',
    dark: '#1B3A5C',
  },
  {
    name: 'Explorations in Environmental and Social Sciences',
    color: '#2BA4C8',
    dark: '#1B3A5C',
  },
];

export function getJournalConfig(name: string): JournalConfig {
  return JOURNALS.find(j => j.name === name) ?? JOURNALS[0];
}

export function getJournalNames(): string[] {
  return JOURNALS.map(j => j.name);
}
