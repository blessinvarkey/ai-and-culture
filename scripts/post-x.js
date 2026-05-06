#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const API_URL = "https://api.x.com/2/tweets";

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = process.env[key] || value;
  }
}

function percentEncode(value) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function makeOAuthHeader(method, url, credentials) {
  const oauthParams = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  const parameterString = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");

  const signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(parameterString),
  ].join("&");

  const signingKey = `${percentEncode(credentials.apiKeySecret)}&${percentEncode(
    credentials.accessTokenSecret,
  )}`;

  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(signatureBase)
    .digest("base64");

  return (
    "OAuth " +
    Object.entries({ ...oauthParams, oauth_signature: signature })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
      .join(", ")
  );
}

function getCredentials() {
  const credentials = {
    apiKey: process.env.X_API_KEY,
    apiKeySecret: process.env.X_API_KEY_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
  };

  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing X credentials: ${missing.join(
        ", ",
      )}. Fill .env using .env.example as the template.`,
    );
  }

  return credentials;
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    text: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--text") {
      args.text = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (!args.text) {
      args.text = arg;
    }
  }

  return args;
}

async function postTweet(text) {
  const credentials = getCredentials();
  const authHeader = makeOAuthHeader("POST", API_URL, credentials);
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`X API returned ${response.status}: ${body}`);
  }

  return JSON.parse(body);
}

async function main() {
  loadEnv(path.resolve(process.cwd(), ".env"));

  const { dryRun, text } = parseArgs(process.argv.slice(2));
  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error('Provide tweet text with --text "your post".');
  }
  if ([...trimmedText].length > 280) {
    throw new Error(`Tweet is ${[...trimmedText].length} characters; X posts must be 280 or fewer.`);
  }

  if (dryRun) {
    getCredentials();
    console.log(`Dry run OK. Tweet is ${[...trimmedText].length} characters.`);
    console.log(trimmedText);
    return;
  }

  const result = await postTweet(trimmedText);
  console.log(`Posted: https://x.com/blessinvarkey/status/${result.data.id}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
