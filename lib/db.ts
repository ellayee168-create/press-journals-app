import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// In production set DB_PATH to a file on the persistent volume
// (e.g. /app/uploads/press-journals.db) so data survives redeploys.
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'press-journals.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  // Add columns introduced after initial schema — safe to run repeatedly.
  const migrations = [
    `ALTER TABLE submissions ADD COLUMN co_authors TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE submissions ADD COLUMN article_type TEXT NOT NULL DEFAULT 'Research Article'`,
    `ALTER TABLE submissions ADD COLUMN section_overrides TEXT NOT NULL DEFAULT '{}'`,
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      issue_number TEXT NOT NULL DEFAULT '001',
      issue_season TEXT NOT NULL DEFAULT 'Fall 2024',
      cover_photo_path TEXT,
      editors_letter TEXT,
      top_reads TEXT NOT NULL DEFAULT '[]',
      author_spotlight TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER
    );
    INSERT OR IGNORE INTO issue_settings (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',

      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      affiliation TEXT NOT NULL,
      email TEXT NOT NULL,
      guardian_email TEXT NOT NULL,
      is_corresponding INTEGER NOT NULL DEFAULT 1,

      title TEXT NOT NULL,
      abstract TEXT NOT NULL,
      keywords TEXT NOT NULL,
      journal TEXT NOT NULL,
      acknowledgments TEXT,
      coi TEXT,

      sections TEXT,
      references_raw TEXT,

      manuscript_path TEXT,
      figures TEXT NOT NULL DEFAULT '[]',
      co_authors TEXT NOT NULL DEFAULT '[]',
      article_type TEXT NOT NULL DEFAULT 'Research Article'
    );
  `);
}

export interface IssueSettings {
  id: number;
  issue_number: string;
  issue_season: string;
  cover_photo_path?: string;
  editors_letter?: string;
  top_reads: string;        // JSON: Array<{ id: string; title: string; author: string }>
  author_spotlight: string; // JSON: string[]
  updated_at?: number;
}

export interface Figure {
  path: string;
  caption: string;
  number: number;
  filename: string;
  /** 0 = intro, 1 = first body section, 2 = second body section, … (undefined = sequential) */
  sectionIndex?: number;
  /** Section name hint provided by the student */
  sectionName?: string;
  /** Result of matching sectionName against parsed headings */
  sectionMatchStatus?: 'matched' | 'unmatched' | 'ambiguous';
  /** The heading text that was actually matched */
  sectionMatchedHeading?: string;
}

export interface Section {
  heading: string;
  subsections: { subheading?: string; text: string }[];
  tables?: string[]; // clean HTML <table> strings extracted from the manuscript
}

export interface ParsedSections {
  introduction?: string;
  body: Section[];
  conclusion?: string;
  acknowledgments?: string;
  references?: string;
  tables?: string[]; // supplementary tables not tied to a body section
  raw?: string;
}

export interface Submission {
  id: string;
  created_at: number;
  status: 'pending' | 'accepted' | 'rejected';
  first_name: string;
  last_name: string;
  affiliation: string;
  email: string;
  guardian_email: string;
  is_corresponding: number;
  title: string;
  abstract: string;
  keywords: string;
  journal: string;
  acknowledgments?: string;
  coi?: string;
  sections?: string;
  references_raw?: string;
  manuscript_path?: string;
  figures: string;
  co_authors: string;    // JSON: Array<{ firstName, lastName, affiliation }>
  article_type: string;
  section_overrides: string; // JSON: { [normalizedHeading]: 'header'|'subheader'|'none' }
}

export interface CoAuthor {
  firstName: string;
  lastName: string;
  affiliation: string;
}
