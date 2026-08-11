import fs from 'fs';
import { parseSectionsFromPdf } from './lib/parse-sections';
import { buildArticleHtml } from './lib/article-template';
import { htmlToPdf } from './lib/pdf-gen';
import { getJournalConfig } from './lib/journals';
import { currentIssueSeason } from './lib/db';

const meta = JSON.parse(fs.readFileSync('/tmp/sophia.json','utf8'));
const pdfPath = '/Users/ellayee/Downloads/Unlocking the Predictive Power of Cancer Genetics through the Development of Novel Machine Learning Methods.docx.pdf';
const sections = await parseSectionsFromPdf(pdfPath);

const figs = JSON.parse(meta.figures || '[]').map((f:any) => ({ ...f, path: '/tmp/sophia_figs/fig1.png' }));

const data:any = {
  id: 'sophia-preview',
  firstName: meta.first_name, lastName: meta.last_name, affiliation: meta.affiliation,
  email: meta.email, isCorresponding: meta.is_corresponding === 1, coAuthors: [],
  articleType: meta.article_type, title: meta.title, abstract: meta.abstract,
  keywords: JSON.parse(meta.keywords||'[]'), journal: meta.journal, coi: meta.coi,
  acknowledgments: meta.acknowledgments, sections, figures: figs,
  issueSeason: currentIssueSeason(), issueNumber: '001',
};

const html = buildArticleHtml(data, true);
const cfg = getJournalConfig(meta.journal);
const pdf = await htmlToPdf(html, `${meta.last_name}, ${meta.first_name}`, cfg.color, true);
fs.writeFileSync('/tmp/Sophia_Lui_formatted_NEW.pdf', pdf);
console.log('sections:', sections.body.map((s:any)=>s.heading));
console.log('tables:', (sections.tables||[]).length, '| figure:', figs.length);
console.log('written: /tmp/Sophia_Lui_formatted_NEW.pdf', fs.statSync('/tmp/Sophia_Lui_formatted_NEW.pdf').size, 'bytes');
