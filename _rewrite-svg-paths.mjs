import fs from 'node:fs';

const files = ['src/pages/index.astro', 'src/layouts/Layout.astro', 'src/lib/report-ui.ts'];
const pattern = /(?<=["'])\/(?!icons\/)([A-Za-z0-9-]+\.svg)(?=["'])/g;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const count = [...text.matchAll(pattern)].length;
  const updated = text.replace(pattern, '/icons/$1');
  if (updated === text) {
    console.log(`NO CHANGE ${file}`);
    continue;
  }
  fs.writeFileSync(file, updated);
  console.log(`${count} ${file}`);
}
