#!/usr/bin/env node
/**
 * Counts server.tool( registrations in src/tools/*.ts and updates all locations
 * that reference tool counts. Exit 0 = no changes, exit 1 = files were modified.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function countTools(file: string): number {
  const src = readFileSync(resolve(root, file), "utf-8");
  return (src.match(/server\.tool\(/g) || []).length;
}

const numbers = countTools("src/tools/numbers.ts");
const pages = countTools("src/tools/pages.ts");
const keynote = countTools("src/tools/keynote.ts");
const total = numbers + pages + keynote;

console.log(`Tool counts: ${total} total (${numbers} Numbers, ${pages} Pages, ${keynote} Keynote)`);

type Replacement = {
  file: string;
  search: RegExp;
  replace: string;
};

// MEMORY.md lives in the Claude projects dir, keyed by the absolute path to this repo
const projectKey = root.replace(/\//g, "-");
const memoryPath = resolve(homedir(), ".claude/projects", projectKey, "memory/MEMORY.md");

const replacements: Replacement[] = [
  // package.json description
  {
    file: "package.json",
    search: /\d+ tools for Numbers, Pages, and Keynote/,
    replace: `${total} tools for Numbers, Pages, and Keynote`,
  },
  // README.md header line
  {
    file: "README.md",
    search: /\d+ tools for Numbers, Pages, and Keynote/,
    replace: `${total} tools for Numbers, Pages, and Keynote`,
  },
  // README.md section headers
  {
    file: "README.md",
    search: /### Numbers \(\d+ tools\)/,
    replace: `### Numbers (${numbers} tools)`,
  },
  {
    file: "README.md",
    search: /### Pages \(\d+ tools\)/,
    replace: `### Pages (${pages} tools)`,
  },
  {
    file: "README.md",
    search: /### Keynote \(\d+ tools\)/,
    replace: `### Keynote (${keynote} tools)`,
  },
  // registration.test.ts assertions
  {
    file: "test/registration.test.ts",
    search: /registers all \d+ tools/,
    replace: `registers all ${total} tools`,
  },
  {
    file: "test/registration.test.ts",
    search: /(assert\.equal\(tools\.length,) \d+\)/,
    replace: `$1 ${total})`,
  },
  {
    file: "test/registration.test.ts",
    search: /registers \d+ Numbers tools/,
    replace: `registers ${numbers} Numbers tools`,
  },
  {
    file: "test/registration.test.ts",
    search: /(assert\.equal\(numbers\.length,) \d+\)/,
    replace: `$1 ${numbers})`,
  },
  {
    file: "test/registration.test.ts",
    search: /registers \d+ Pages tools/,
    replace: `registers ${pages} Pages tools`,
  },
  {
    file: "test/registration.test.ts",
    search: /(assert\.equal\(pages\.length,) \d+\)/,
    replace: `$1 ${pages})`,
  },
  {
    file: "test/registration.test.ts",
    search: /registers \d+ Keynote tools/,
    replace: `registers ${keynote} Keynote tools`,
  },
  {
    file: "test/registration.test.ts",
    search: /(assert\.equal\(keynote\.length,) \d+\)/,
    replace: `$1 ${keynote})`,
  },
  // src/install.ts success message
  {
    file: "src/install.ts",
    search: /\d+ tools for Numbers, Pages, and Keynote/,
    replace: `${total} tools for Numbers, Pages, and Keynote`,
  },
  // MEMORY.md (absolute path, outside repo)
  {
    file: memoryPath,
    search: /\d+ tools total: \d+ Numbers, \d+ Pages, \d+ Keynote/,
    replace: `${total} tools total: ${numbers} Numbers, ${pages} Pages, ${keynote} Keynote`,
  },
];

let changed = false;

for (const { file, search, replace } of replacements) {
  const filePath = resolve(root, file);
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    console.log(`  SKIP ${file} (not found)`);
    continue;
  }
  const updated = content.replace(search, replace);
  if (updated !== content) {
    writeFileSync(filePath, updated);
    console.log(`  UPDATED ${file}`);
    changed = true;
  }
}

if (changed) {
  console.log("Files were updated.");
  process.exit(1);
} else {
  console.log("All counts up to date.");
}
