#!/usr/bin/env node
/**
 * Import BitBit issues into Linear from CSV.
 * Usage: LINEAR_API_KEY=lin_api_xxx node scripts/linear-import.mjs
 */
import { LinearClient } from "@linear/sdk";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const apiKey = process.env.LINEAR_API_KEY;
if (!apiKey) {
  console.error("Set LINEAR_API_KEY env var. Get one at https://linear.app/settings/account/security");
  process.exit(1);
}

const client = new LinearClient({ apiKey });

// Parse CSV (simple parser — handles quoted fields with commas)
function parseCSV(text) {
  const lines = text.split("\n").filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (values[i] || "").trim());
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Cache lookups
async function buildCaches() {
  console.log("Building caches...");

  // Teams
  const teamsResp = await client.teams();
  const teams = {};
  teamsResp.nodes.forEach(t => { teams[t.name] = t; });

  // Projects
  const projectsResp = await client.projects({ first: 100 });
  const projects = {};
  projectsResp.nodes.forEach(p => { projects[p.name] = p; });

  // Labels
  const labelsResp = await client.issueLabels({ first: 100 });
  const labels = {};
  labelsResp.nodes.forEach(l => { labels[l.name] = l; });

  // Workflow states per team (for "Backlog" state)
  const states = {};
  for (const [name, team] of Object.entries(teams)) {
    const statesResp = await team.states();
    states[name] = {};
    statesResp.nodes.forEach(s => { states[name][s.name] = s; });
  }

  return { teams, projects, labels, states };
}

const PRIORITY_MAP = {
  "Urgent": 1, "High": 2, "Medium": 3, "Low": 4, "No priority": 0,
};

async function main() {
  const csvPath = resolve(__dirname, "../linear-import.csv");
  const csvText = readFileSync(csvPath, "utf-8");
  const rows = parseCSV(csvText);

  console.log(`Parsed ${rows.length} issues from CSV`);

  const { teams, projects, labels, states } = await buildCaches();

  const teamName = "BitBit";
  const team = teams[teamName];
  if (!team) { console.error(`Team "${teamName}" not found`); process.exit(1); }

  const backlogState = states[teamName]["Backlog"] || states[teamName]["Triage"];

  let created = 0, failed = 0;

  for (const row of rows) {
    const title = row["Title"];
    const description = row["Description"] || "";
    const priority = PRIORITY_MAP[row["Priority"]] ?? 0;
    const projectName = row["Project"];
    const labelNames = (row["Label"] || "").split(";").map(l => l.trim()).filter(Boolean);

    const labelIds = labelNames
      .map(n => labels[n]?.id)
      .filter(Boolean);

    const input = {
      teamId: team.id,
      title,
      description,
      priority,
      ...(projects[projectName] && { projectId: projects[projectName].id }),
      ...(labelIds.length && { labelIds }),
      ...(backlogState && { stateId: backlogState.id }),
    };

    try {
      const result = await client.createIssue(input);
      const issue = await result.issue;
      created++;
      if (created % 10 === 0) console.log(`  Created ${created}/${rows.length}...`);
    } catch (err) {
      failed++;
      console.error(`  FAIL [${title}]: ${err.message}`);
    }

    // Rate limit: Linear allows 1500 req/hr for OAuth, be safe
    if (created % 50 === 0) {
      console.log("  Pausing 5s for rate limit...");
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`\nDone! Created: ${created}, Failed: ${failed}, Total: ${rows.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
