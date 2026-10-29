import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const username = process.env.GH_USERNAME ?? "realalden27";
const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../profile/overview.svg",
);
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "profile-overview-generator",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
};

async function fetchJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}): ${url}`);
  }
  return response.json();
}

async function fetchRepositories() {
  const repositories = [];
  let page = 1;
  while (true) {
    const batch = await fetchJson(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch)) {
      throw new Error("GitHub API returned an unexpected repository list.");
    }
    repositories.push(...batch);
    if (batch.length < 100) {
      return repositories;
    }
    page += 1;
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const [profile, repositories] = await Promise.all([
  fetchJson(`https://api.github.com/users/${encodeURIComponent(username)}`),
  fetchRepositories(),
]);
const ownedRepositories = repositories.filter((repository) => !repository.fork);
const languageCounts = new Map();
for (const repository of ownedRepositories) {
  if (repository.language) {
    languageCounts.set(
      repository.language,
      (languageCounts.get(repository.language) ?? 0) + 1,
    );
  }
}
const languages = [...languageCounts.entries()]
  .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  .slice(0, 4)
  .map(([language]) => escapeXml(language))
  .join("  ·  ");
const stars = ownedRepositories.reduce(
  (sum, repository) => sum + repository.stargazers_count,
  0,
);
const stats = [
  ["Repositories", profile.public_repos ?? repositories.length],
  ["Stars", stars],
  ["Followers", profile.followers ?? 0],
];
const statMarkup = stats
  .map(
    ([label, value], index) =>
      `<text x="${64 + index * 270}" y="91" class="number">${new Intl.NumberFormat("en").format(value)}</text><text x="${64 + index * 270}" y="113" class="label">${label}</text>`,
  )
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="160" viewBox="0 0 900 160" role="img" aria-labelledby="title description">
  <title id="title">GitHub overview for ${escapeXml(profile.name || profile.login)}</title>
  <desc id="description">Repository, star, follower, and language stats for ${escapeXml(profile.login)}.</desc>
  <style>
    .panel { fill: #111827; }
    .heading { fill: #f3f4f6; font: 600 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; letter-spacing: 1.4px; }
    .number { fill: #f9fafb; font: 700 24px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; }
    .label { fill: #9ca3af; font: 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; }
    .languages { fill: #d1d5db; font: 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; }
    .accent { fill: #60a5fa; }
  </style>
  <rect class="panel" width="900" height="160" rx="8" />
  <text x="36" y="37" class="heading">GITHUB OVERVIEW</text>
  <circle cx="861" cy="33" r="4" class="accent" />
  <line x1="36" y1="53" x2="864" y2="53" stroke="#273244" />
  ${statMarkup}
  <line x1="36" y1="128" x2="864" y2="128" stroke="#273244" />
  <text x="36" y="149" class="label">Languages</text>
  <text x="112" y="149" class="languages">${languages || "No language data yet"}</text>
</svg>
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, svg, "utf8");
console.log(`Generated ${outputPath}`);
