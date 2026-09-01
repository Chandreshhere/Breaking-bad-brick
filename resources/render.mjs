import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const jobs = process.argv.slice(2);
for (let i = 0; i < jobs.length; i += 4) {
  const [src, out, w, h] = [jobs[i], jobs[i+1], Number(jobs[i+2]), Number(jobs[i+3])];
  await sharp(readFileSync(src), { density: 400 }).resize(w, h).png().toFile(out);
  console.log('->', out, w + 'x' + h);
}
