#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const username = "adriancho91s";
const throughDate = process.argv[2] ?? new Date().toISOString().slice(0, 10);

if (!/^\d{4}-\d{2}-\d{2}$/.test(throughDate) || new Date(`${throughDate}T00:00:00Z`).toISOString().slice(0, 10) !== throughDate) {
  throw new Error("Usage: node scripts/refresh-github-activity.mjs [YYYY-MM-DD]");
}

const through = new Date(`${throughDate}T00:00:00Z`);
const from = new Date(through);
from.setUTCDate(from.getUTCDate() - 364);
const fromDate = from.toISOString().slice(0, 10);
const endExclusive = new Date(through);
endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

const query = `query($from: DateTime!, $to: DateTime!) {
  user(login: "${username}") {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount date } }
      }
      restrictedContributionsCount
    }
  }
}`;

const response = execFileSync("gh", [
  "api", "graphql",
  "-f", `query=${query}`,
  "-F", `from=${fromDate}T00:00:00Z`,
  "-F", `to=${endExclusive.toISOString().slice(0, 10)}T00:00:00Z`,
], { encoding: "utf8" });

const payload = JSON.parse(response);
if (payload.errors?.length) throw new Error(`GitHub GraphQL query failed: ${payload.errors.map((error) => error.message).join("; ")}`);
const collection = payload.data?.user?.contributionsCollection;
const calendar = collection?.contributionCalendar;
if (!calendar || !Number.isInteger(calendar.totalContributions)) throw new Error("GitHub did not return a contribution calendar.");
if (!Number.isInteger(collection.restrictedContributionsCount) || collection.restrictedContributionsCount <= 0) {
  throw new Error("GitHub did not confirm restricted/private contribution activity. Verify that `gh` is authenticated as adriancho91s and that private-contribution counts are visible on the profile before refreshing this public + private snapshot.");
}

const days = calendar.weeks.flatMap((week) => week.contributionDays)
  .filter((day) => day.date >= fromDate && day.date <= throughDate)
  .sort((a, b) => a.date.localeCompare(b.date));
const total = days.reduce((sum, day) => sum + day.contributionCount, 0);
if (days.length !== 365 || total !== calendar.totalContributions) {
  throw new Error(`Contribution calendar did not match the requested 365-day window (${days.length} days; ${total} daily vs ${calendar.totalContributions} total).`);
}

const activeDays = days.filter((day) => day.contributionCount > 0).length;
const themes = {
  light: {
    bg: "#f6f8fa", border: "#d1d9e0", text: "#1f2328", muted: "#59636e",
    levels: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  },
  dark: {
    bg: "#0d1117", border: "#30363d", text: "#e6edf3", muted: "#8b949e",
    levels: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
  },
};

function renderSvg(theme) {
  const cell = 10;
  const gap = 3;
  const step = cell + gap;
  const gridX = 430;
  const gridY = 86;
  const firstWeekday = new Date(`${fromDate}T00:00:00Z`).getUTCDay();
  const maxCount = Math.max(...days.map((day) => day.contributionCount));
  const monthLabels = new Map();
  const cells = days.map((day, index) => {
    const date = new Date(`${day.date}T00:00:00Z`);
    const dayOffset = Math.round((date - from) / 86_400_000);
    const column = Math.floor((firstWeekday + dayOffset) / 7);
    const row = date.getUTCDay();
    if (date.getUTCDate() === 1 || index === 0) {
      monthLabels.set(column, date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }));
    }
    const count = day.contributionCount;
    const level = count === 0 ? 0 : count <= 3 ? 1 : count <= 9 ? 2 : count <= 24 ? 3 : 4;
    const x = gridX + column * step;
    const y = gridY + row * step;
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${theme.levels[level]}"><title>${day.date}: ${count} contributions</title></rect>`;
  }).join("");
  const monthText = [...monthLabels.entries()].map(([column, month]) =>
    `<text x="${gridX + column * step}" y="68" fill="${theme.muted}" font-size="12">${month}</text>`).join("");
  const dayLabels = [
    `<text x="389" y="${gridY + 2 * step + 9}" fill="${theme.muted}" font-size="11">Tue</text>`,
    `<text x="389" y="${gridY + 4 * step + 9}" fill="${theme.muted}" font-size="11">Thu</text>`,
  ].join("");
  const legend = theme.levels.map((color, index) =>
    `<rect x="${gridX + 452 + index * 17}" y="190" width="10" height="10" rx="2" fill="${color}"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 226" role="img" aria-labelledby="title description">
  <title id="title">GitHub contribution activity, ${fromDate} to ${throughDate}</title>
  <desc id="description">${calendar.totalContributions.toLocaleString("en-US")} total contributions across ${activeDays} active days in 365 days. Private activity is represented only in aggregate.</desc>
  <rect x="1" y="1" width="1198" height="224" rx="16" fill="${theme.bg}" stroke="${theme.border}"/>
  <text x="34" y="49" fill="${theme.muted}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="14" font-weight="600" letter-spacing="1.4">GITHUB ACTIVITY · 365 DAYS</text>
  <text x="34" y="119" fill="${theme.text}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="54" font-weight="700">${calendar.totalContributions.toLocaleString("en-US")}</text>
  <text x="36" y="145" fill="${theme.muted}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="15">public + private contributions</text>
  <text x="36" y="185" fill="${theme.text}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="15" font-weight="600">${activeDays} active days</text>
  <text x="430" y="37" fill="${theme.muted}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="12">${fromDate} — ${throughDate} · UTC</text>
  ${monthText}
  ${dayLabels}
  ${cells}
  <text x="${gridX + 405}" y="199" fill="${theme.muted}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="11">Less</text>
  ${legend}
  <text x="${gridX + 547}" y="199" fill="${theme.muted}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="11">More</text>
  <text x="34" y="211" fill="${theme.muted}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="11">Private activity shown only as aggregate counts; repository details are not included.</text>
</svg>
`;
}

const assetsDir = path.join(repoRoot, "assets");
mkdirSync(assetsDir, { recursive: true });
for (const [name, theme] of Object.entries(themes)) {
  writeFileSync(path.join(assetsDir, `github-activity-${name}.svg`), renderSvg(theme));
}

const summaryStart = "<!-- github-activity-summary:start -->";
const summaryEnd = "<!-- github-activity-summary:end -->";
const readmePath = path.join(repoRoot, "README.md");
const readme = readFileSync(readmePath, "utf8");
const summaryPattern = /<!-- github-activity-summary:start -->[\s\S]*?<!-- github-activity-summary:end -->/;
if (!summaryPattern.test(readme)) throw new Error("README is missing the generated activity summary markers.");
const summary = `${summaryStart}\n**${calendar.totalContributions.toLocaleString("en-US")} public + private contributions · ${activeDays} active days**<br>\n*${fromDate} – ${throughDate} · UTC. Private activity is shown only as aggregate counts.*\n${summaryEnd}`;
writeFileSync(readmePath, readme.replace(summaryPattern, summary));

console.log(`Updated aggregate GitHub activity: ${calendar.totalContributions.toLocaleString("en-US")} contributions, ${activeDays} active days (${fromDate}–${throughDate} UTC).`);
