import fs from 'fs';
import { applyFigureSectionMatches } from './lib/parse-sections';
import type { Figure, ParsedSections } from './lib/db';
const S='/private/tmp/claude-501/-Users-ellayee-Desktop-press-journals-app/0d573464-45cc-422b-b5b1-f513651341a7/scratchpad';
const row=JSON.parse(fs.readFileSync(`${S}/soph_row.json`,'utf8'));
const sections:ParsedSections=JSON.parse(row.sections);
const figures:Figure[]=JSON.parse(row.figures);

// Where her own manuscript cites each figure (agrees with her emailed corrections).
const WANT:Record<number,string>={
  1:'T-ALL',
  3:'Drug resistance mechanisms',
  4:'Drug resistance mechanisms',
  8:'Socioeconomic factors in treating pediatric ALL',
};
for(const f of figures) if(WANT[f.number]) f.sectionName=WANT[f.number];
// Derive sectionIndex/status the same way the app does, so a future re-parse agrees.
applyFigureSectionMatches(figures,sections);

const targets:string[]=[]; if(sections.introduction) targets.push('Introduction');
for(const b of sections.body){ targets.push(b.heading); for(const x of b.subsections) if(x.subheading) targets.push('> '+x.subheading); }
if(sections.conclusion) targets.push('Conclusion');
for(const f of figures){
  if(!WANT[f.number]) continue;
  console.log(`  fig ${String(f.number).padStart(2)}  idx=${f.sectionIndex}  ${f.sectionMatchStatus}  -> ${targets[f.sectionIndex!]}`);
}
fs.writeFileSync(`${S}/soph_figs.json`, JSON.stringify(figures));
console.log('wrote patch');
