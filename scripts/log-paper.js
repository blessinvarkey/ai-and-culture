#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) {
      continue;
    }
    args[key.slice(2)] = argv[index + 1] || "";
    index += 1;
  }
  return args;
}

function requireArg(args, name) {
  if (!args[name] || !args[name].trim()) {
    throw new Error(`Missing required argument: --${name}`);
  }
  return args[name].trim();
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJsonl(filePath, entries) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const body = entries.map((entry) => JSON.stringify(entry)).join("\n");
  fs.writeFileSync(filePath, body ? `${body}\n` : "");
}

function renderReadme(entries) {
  const latest = entries
    .slice()
    .reverse()
    .map((entry) => {
      const title = entry.title ? `**${entry.title}**` : "**Untitled source**";
      const tweet = entry.tweetUrl ? ` | [Tweet](${entry.tweetUrl})` : "";
      return `- ${entry.date}: ${title} | [Source](${entry.sourceUrl})${tweet}\n  ${entry.summary}`;
    })
    .join("\n");

  return `# Culture x AI Daily

A daily log of papers and news posted to [@blessinvarkey](https://x.com/blessinvarkey) about AI across culture, art, museums, galleries, cultural heritage, creative tools, and HCI.

Each entry follows a simple editorial rule:

1. What the paper or article actually studied, proposed, or did.
2. The main finding or outcome in plain language.
3. Source and tweet links.

## Latest Posts

${latest || "No entries yet."}

## Data

- [\`data/posts.jsonl\`](data/posts.jsonl): one JSON object per published tweet.
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const entry = {
    date: args.date || new Date().toISOString().slice(0, 10),
    title: args.title || "",
    sourceUrl: requireArg(args, "source"),
    tweetUrl: args.tweet || "",
    summary: requireArg(args, "summary"),
    tweetText: args.text || "",
  };

  const root = process.cwd();
  const dataPath = path.join(root, "data", "posts.jsonl");
  const readmePath = path.join(root, "README.md");
  const entries = readJsonl(dataPath);
  const existingIndex = entries.findIndex(
    (item) => item.sourceUrl === entry.sourceUrl || (entry.tweetUrl && item.tweetUrl === entry.tweetUrl),
  );

  if (existingIndex >= 0) {
    entries[existingIndex] = { ...entries[existingIndex], ...entry };
  } else {
    entries.push(entry);
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  writeJsonl(dataPath, entries);
  fs.writeFileSync(readmePath, renderReadme(entries));
  console.log(`Logged ${entry.sourceUrl}`);
}

main();
