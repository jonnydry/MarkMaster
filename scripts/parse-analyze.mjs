import fs from "node:fs";

const filename = process.argv[2] || ".next/analyze/client.html";
const html = fs.readFileSync(filename, "utf8");
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

const needle = process.argv[3];
const topN = needle ? 100 : 10;

const topChunks = [...data]
  .filter((chunk) => !needle || flattenGroups(chunk.groups).some((g) => g.label.toLowerCase().includes(needle.toLowerCase())))
  .sort((a, b) => b.parsedSize - a.parsedSize)
  .slice(0, topN);

console.log(`Top ${topChunks.length} chunks from ${filename}:\n`);
for (const chunk of topChunks) {
  console.log(`--- ${chunk.label} ---`);
  console.log(`  parsed: ${(chunk.parsedSize / 1024).toFixed(1)} KB`);
  console.log(`  gzip: ${(chunk.gzipSize / 1024).toFixed(1)} KB`);

  const flat = flattenGroups(chunk.groups).filter((g) => g.parsedSize > 0);
  const srcModules = flat.filter((g) => g.label.startsWith("src/"));
  const nodeModules = flat.filter((g) => g.label.startsWith("node_modules/"));

  const topSrc = srcModules.sort((a, b) => b.parsedSize - a.parsedSize).slice(0, 6);
  if (topSrc.length) {
    console.log("  top src:");
    for (const g of topSrc) {
      console.log(`    ${(g.parsedSize / 1024).toFixed(1)} KB - ${g.label}`);
    }
  }

  const topNode = nodeModules.sort((a, b) => b.parsedSize - a.parsedSize).slice(0, 6);
  if (topNode.length) {
    console.log("  top node_modules:");
    for (const g of topNode) {
      console.log(`    ${(g.parsedSize / 1024).toFixed(1)} KB - ${g.label}`);
    }
  }
  console.log();
}
