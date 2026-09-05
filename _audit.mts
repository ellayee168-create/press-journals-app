// Sweep every submission for rendering anomalies, using the current parser.
// Reports only problems — a clean submission prints nothing.
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { parseSectionsFromDocx, parseSectionsFromPdf, applyFigureSectionMatches } from './lib/parse-sections';
import { buildArticleHtml } from './lib/article-template';
import { dropFloatsDuplicatingTables, assignFloatLabels, buildArticleLayout, placementTargetsFor } from './lib/article-layout';
import type { Figure } from './lib/db';

const VOL = '/private/tmp/claude-501/-Users-ellayee-Desktop-press-journals-app/0d573464-45cc-422b-b5b1-f513651341a7/scratchpad/vol';
const db = new Database(path.join(VOL, 'press-journals.db'), { readonly: true });
const rows = db.prepare('SELECT * FROM submissions ORDER BY created_at DESC').all() as any[];

let totalIssues = 0;
const tally = new Map<string, number>();
const note = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);

for (const row of rows) {
  const issues: string[] = [];
  const dir = path.join(VOL, row.id);
  const mp = row.manuscript_path ? path.join(dir, path.basename(row.manuscript_path)) : null;
  if (!mp || !fs.existsSync(mp)) { issues.push('manuscript file missing'); note('manuscript missing'); }

  let sections: any = null;
  if (mp && fs.existsSync(mp)) {
    const ov = row.section_overrides ? JSON.parse(row.section_overrides) : {};
    try {
      sections = mp.endsWith('.docx')
        ? await parseSectionsFromDocx(mp, ov)
        : await parseSectionsFromPdf(mp, ov);
    } catch (e) { issues.push(`parse threw: ${String(e).slice(0, 80)}`); note('parse threw'); }
  }

  if (sections) {
    if (sections.raw) { issues.push('NO STRUCTURE — renders as one raw block'); note('no structure'); }
    else if (sections.body.length === 0) { issues.push('zero body sections'); note('zero body sections'); }
    if (!sections.references && !row.references_raw) { issues.push('no References detected'); note('no references'); }

    const figures: Figure[] = JSON.parse(row.figures || '[]').map((f: Figure) => ({ ...f, path: path.join(dir, f.filename) }));
    const missing = figures.filter(f => !fs.existsSync(f.path));
    if (missing.length) { issues.push(`${missing.length}/${figures.length} figure files missing`); note('figure file missing'); }

    applyFigureSectionMatches(figures, sections);
    const unmatched = figures.filter(f => f.sectionName?.trim() && f.sectionMatchStatus !== 'matched');
    if (unmatched.length) {
      issues.push(`${unmatched.length} figure(s) named a section that did not match: ${unmatched.map(u => JSON.stringify(u.sectionName?.slice(0, 40))).slice(0, 3).join(', ')}`);
      note('section name unmatched');
    }

    const { kept } = dropFloatsDuplicatingTables(figures, sections);
    const labels = assignFloatLabels(kept);
    const layout = buildArticleLayout(sections, kept);
    if (layout.trailingFigures.length) { issues.push(`${layout.trailingFigures.length} figure(s) stranded at the end`); note('stranded figures'); }

    const ls = kept.map(f => labels.get(f)!.label);
    const dup = ls.filter((l, i) => ls.indexOf(l) !== i);
    if (dup.length) { issues.push(`duplicate float labels: ${[...new Set(dup)].join(', ')}`); note('duplicate labels'); }

    // Tables whose header row does not span the same number of columns as the body.
    const allTables: string[] = [
      ...(sections.tables ?? []),
      ...sections.body.flatMap((s: any) => [...(s.tables ?? []), ...s.subsections.flatMap((x: any) => x.tables ?? [])]),
    ];
    let ragged = 0;
    for (const t of allTables) {
      const widths = Array.from(t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((m: any) =>
        Array.from(m[1].matchAll(/<t[dh]([^>]*)>/gi)).reduce((n: number, c: any) =>
          n + Math.max(1, Number(/colspan\s*=\s*"?(\d{1,2})/i.exec(c[1])?.[1] ?? 1)), 0));
      if (widths.length < 2) continue;
      const freq = new Map<number, number>();
      widths.forEach(w => freq.set(w, (freq.get(w) ?? 0) + 1));
      const modal = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
      if (widths[0] !== modal) ragged++;
    }
    if (ragged) { issues.push(`${ragged}/${allTables.length} table(s) have a header row narrower than their body`); note('ragged table'); }

    try {
      const html = buildArticleHtml({
        id: row.id, firstName: row.first_name, lastName: row.last_name,
        affiliation: row.affiliation, email: row.email, isCorresponding: row.is_corresponding === 1,
        coAuthors: JSON.parse(row.co_authors || '[]'), articleType: row.article_type,
        title: row.title, abstract: row.abstract, keywords: JSON.parse(row.keywords || '[]'),
        journal: row.journal, acknowledgments: row.acknowledgments, coi: row.coi,
        sections, referencesRaw: row.references_raw || undefined, figures,
      }, false);
      const caps = Array.from(html.matchAll(/<p class="fig-caption"><strong>([^<]*)<\/strong>\s*([^<]{0,40})/g));
      const doubled = caps.filter(m => /^\s*(figure|table|fig)\s*S?\d/i.test(m[2]));
      if (doubled.length) { issues.push(`${doubled.length} caption(s) still print two numbers`); note('doubled caption'); }
    } catch (e) { issues.push(`render threw: ${String(e).slice(0, 80)}`); note('render threw'); }
  }

  if (issues.length) {
    totalIssues++;
    console.log(`\n${row.id.slice(0, 8)}  ${row.last_name}, ${row.first_name}  — ${(row.title || '').slice(0, 46)}`);
    for (const i of issues) console.log(`    • ${i}`);
  }
}

console.log(`\n${'='.repeat(64)}`);
console.log(`${rows.length} submissions scanned; ${totalIssues} with problems, ${rows.length - totalIssues} clean`);
console.log('by kind:');
for (const [k, v] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
