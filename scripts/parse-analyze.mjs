import fs from "node:fs";

const html = fs.readFileSync(".next/analyze/client.html", "utf8");
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

const json = html.slice(start, end);
const data = JSON.parse(json);

function flattenGroups(groups, prefix = "") {
  const out = [];
  for (const g of groups || []) {
    const label = prefix ? `${prefix}/${g.label}` : g.label;
    if (g.groups && g.groups.length > 0) {
      out.push(...flattenGroups(g.groups, label));
    } else {
      out.push({ ...g, label });
    }
  }
  return out;
}

const targetChunks = [...data]
  .filter((chunk) => {
    const flat = flattenGroups(chunk.groups);
    return flat.some((g) => g.label.includes("valibot") || g.label.includes("zod"));
  })
  .sort((a, b) => b.parsedSize - a.parsedSize);

console.log("Chunks containing valibot or zod:\n");
for (const chunk of targetChunks) {
  console.log(`--- ${chunk.label} ---`);
  console.log(`  stat: ${(chunk.statSize / 1024).toFixed(1)} KB`);
  console.log(`  parsed: ${(chunk.parsedSize / 1024).toFixed(1)} KB`);
  console.log(`  gzip: ${(chunk.gzipSize / 1024).toFixed(1)} KB`);

  const flat = flattenGroups(chunk.groups).filter(
    (g) => g.label.includes("valibot") || g.label.includes("zod")
  );
  for (const g of flat) {
    console.log(`    ${(g.parsedSize / 1024).toFixed(1)} KB - ${g.label}`);
  }
  console.log();
}
