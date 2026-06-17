import fs from "node:fs";

const html = fs.readFileSync(process.argv[2] || ".next/analyze/client.html", "utf8");
const marker = "window.chartData = ";
const start = html.indexOf(marker) + marker.length;

let depth = 0;
let inString = false;
let escape = false;
let end = start;
for (let i = start; i < html.length; i++) {
  const c = html[i];
  if (escape) {
    escape = false;
    continue;
  }
  if (c === "\\") {
    escape = true;
    continue;
  }
  if (c === '"' && !inString) {
    inString = true;
  } else if (c === '"' && inString) {
    inString = false;
  } else if (!inString) {
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
}

const data = JSON.parse(html.slice(start, end));
const totalParsed = data.reduce((s, c) => s + c.parsedSize, 0);
const totalGzip = data.reduce((s, c) => s + c.gzipSize, 0);
console.log(
  `${data.length} chunks | parsed ${(totalParsed / 1024).toFixed(1)} KB | gzip ${(totalGzip / 1024).toFixed(1)} KB`
);
