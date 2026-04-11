#!/usr/bin/env node
/**
 * Reorganize Linear workspace: create 5 teams, move projects + issues.
 * Usage: LINEAR_API_KEY=lin_api_xxx node scripts/linear-reorganize.mjs
 */
import { LinearClient } from "@linear/sdk";

const apiKey = process.env.LINEAR_API_KEY;
if (!apiKey) { console.error("Set LINEAR_API_KEY"); process.exit(1); }
const client = new LinearClient({ apiKey });

// Team definitions
const TEAM_DEFS = [
  { name: "Backend", key: "BE", icon: "⚙️", color: "#3b82f6", description: "Agent engine, channels, context engine, API routes, DI refactor, DB migrations" },
  { name: "Frontend", key: "FE", icon: "🖥️", color: "#8b5cf6", description: "Dashboard, components, UX, mobile responsiveness, onboarding" },
  { name: "Agents", key: "AG", icon: "🤖", color: "#ef4444", description: "All 10 agent implementations — Sentry, Lead Swarm, Invoice Flow, etc." },
  { name: "Infrastructure", key: "INF", icon: "🚀", color: "#10b981", description: "Deployment, CI/CD, VPS, monitoring, security" },
  { name: "GTM", key: "GTM", icon: "📈", color: "#f59e0b", description: "Legal, pricing, beta, marketing, revenue ops" },
];

// Map project name prefixes to team keys
const PROJECT_TEAM_MAP = {
  "BE: Database Migrations & Schema": "BE",
  "BE: Context Engine": "BE",
  "BE: Agent Runtime": "BE",
  "BE: Channel Adapters": "BE",
  "BE: OAuth Portal": "BE",
  "FE: Dashboard Verification": "FE",
  "FE: Command Center & UX": "FE",
  "FE: Agent & Lead UIs": "FE",
  "FE: OAuth Portal UI": "FE",
  "AG: P0 Agents": "AG",
  "AG: P1 Agents": "AG",
  "AG: P2 Agents": "AG",
  "AG: P3 Agents": "AG",
  "INF: Deployment": "INF",
  "INF: VPS & Workers": "INF",
  "INF: CI/CD & Monitoring": "INF",
  "INF: Security": "INF",
  "GTM: Legal & Business": "GTM",
  "GTM: First Revenue": "GTM",
  "GTM: Beta Program": "GTM",
  "GTM: Public Launch": "GTM",
  // Pre-existing projects
  "Development": "BE",
  "Marketing & GTM": "GTM",
  "Legal & Structure": "GTM",
  "Clients & Pipeline": "GTM",
  "Product": "GTM",
  "R&D": "GTM",
};

async function main() {
  // 1. Get existing teams
  const teamsResp = await client.teams();
  const existingTeams = {};
  teamsResp.nodes.forEach(t => { existingTeams[t.name] = t; });
  console.log(`Existing teams: ${Object.keys(existingTeams).join(", ")}`);

  // 2. Create new teams (or find existing)
  const teamMap = {}; // key -> team object
  for (const def of TEAM_DEFS) {
    if (existingTeams[def.name]) {
      teamMap[def.key] = existingTeams[def.name];
      console.log(`Team "${def.name}" already exists (${existingTeams[def.name].key})`);
    } else {
      try {
        const result = await client.createTeam({
          name: def.name,
          key: def.key,
          description: def.description,
          color: def.color,
        });
        const team = await result.team;
        teamMap[def.key] = team;
        console.log(`Created team "${def.name}" (${team.key})`);
      } catch (err) {
        console.error(`Failed to create team "${def.name}": ${err.message}`);
        // Try to find it if creation failed due to key conflict
        const refreshed = await client.teams();
        const found = refreshed.nodes.find(t => t.name === def.name || t.key === def.key);
        if (found) {
          teamMap[def.key] = found;
          console.log(`  Found existing team with key ${def.key}`);
        }
      }
    }
  }

  // 3. Get all projects
  const projectsResp = await client.projects({ first: 100 });
  const projects = projectsResp.nodes;
  console.log(`\nFound ${projects.length} projects`);

  // 4. Move projects to correct teams
  for (const project of projects) {
    const targetKey = PROJECT_TEAM_MAP[project.name];
    if (!targetKey) {
      console.log(`  Skipping project "${project.name}" (no mapping)`);
      continue;
    }
    const targetTeam = teamMap[targetKey];
    if (!targetTeam) {
      console.log(`  No team found for key "${targetKey}" (project: ${project.name})`);
      continue;
    }

    // Check if project already belongs to this team
    const projectTeams = await project.teams();
    const currentTeamIds = projectTeams.nodes.map(t => t.id);
    if (currentTeamIds.includes(targetTeam.id) && currentTeamIds.length === 1) {
      console.log(`  Project "${project.name}" already in ${targetKey}`);
      continue;
    }

    try {
      await client.updateProject(project.id, {
        teamIds: [targetTeam.id],
      });
      console.log(`  Moved project "${project.name}" → ${targetKey}`);
    } catch (err) {
      console.error(`  Failed to move project "${project.name}": ${err.message}`);
    }
  }

  // 5. Move all issues to correct teams
  console.log("\nMoving issues to correct teams...");

  // Build project name → target team ID map
  const projectToTeamId = {};
  for (const project of projects) {
    const targetKey = PROJECT_TEAM_MAP[project.name];
    if (targetKey && teamMap[targetKey]) {
      projectToTeamId[project.id] = teamMap[targetKey].id;
    }
  }

  // Fetch all issues (paginated)
  let cursor = undefined;
  let moved = 0, skipped = 0, total = 0;
  const oldTeam = existingTeams["BitBit"];

  while (true) {
    const issuesResp = await client.issues({
      first: 50,
      after: cursor,
      filter: oldTeam ? { team: { id: { eq: oldTeam.id } } } : undefined,
    });

    for (const issue of issuesResp.nodes) {
      total++;
      const targetTeamId = issue.projectId ? projectToTeamId[issue.projectId] : null;

      if (!targetTeamId) {
        // Issues without a mapped project — try to infer from title
        let inferredKey = null;
        const title = issue.title;
        if (title.match(/^\[0\.\d/)) inferredKey = "INF";
        else if (title.match(/^\[1\.\d/) || title.match(/^\[1\.5/)) inferredKey = "BE";
        else if (title.match(/^\[P2-1\.(1[1-9]|2[0-7])/)) inferredKey = "BE";
        else if (title.match(/^\[P2-1\.\d/)) inferredKey = "BE";
        else if (title.match(/^\[2\./)) inferredKey = "AG";
        else if (title.match(/^\[3\./)) inferredKey = "BE";
        else if (title.match(/^\[4\./)) inferredKey = "AG";
        else if (title.match(/^\[5\./)) inferredKey = "AG";
        else if (title.match(/^\[6\./)) inferredKey = "AG";
        else if (title.match(/^\[7\./)) inferredKey = "INF";
        else if (title.match(/^\[8\./)) inferredKey = "GTM";
        else if (title.match(/^\[9\./)) inferredKey = "INF";
        else if (title.match(/^\[OA-/)) inferredKey = "BE";
        else if (title.match(/^\[OP\]/)) inferredKey = "INF";

        if (inferredKey && teamMap[inferredKey]) {
          try {
            await client.updateIssue(issue.id, { teamId: teamMap[inferredKey].id });
            moved++;
            if (moved % 20 === 0) console.log(`  Moved ${moved} issues...`);
          } catch (err) {
            console.error(`  Failed to move "${issue.title}": ${err.message}`);
          }
        } else {
          skipped++;
        }
        continue;
      }

      if (issue.teamId === targetTeamId) {
        skipped++;
        continue;
      }

      try {
        await client.updateIssue(issue.id, { teamId: targetTeamId });
        moved++;
        if (moved % 20 === 0) console.log(`  Moved ${moved} issues...`);
      } catch (err) {
        console.error(`  Failed to move "${issue.title}": ${err.message}`);
      }

      // Rate limit
      if (moved % 50 === 0 && moved > 0) {
        console.log("  Pausing 5s for rate limit...");
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    if (!issuesResp.pageInfo.hasNextPage) break;
    cursor = issuesResp.pageInfo.endCursor;
  }

  console.log(`\nIssue migration: moved=${moved}, skipped=${skipped}, total=${total}`);

  // 6. Summary
  console.log("\n=== Final Team Structure ===");
  const finalTeams = await client.teams();
  for (const team of finalTeams.nodes) {
    const issues = await team.issues({ first: 1 });
    const projects = await team.projects({ first: 50 });
    console.log(`${team.name} (${team.key}): ${projects.nodes.length} projects, ~${issues.pageInfo.totalCount || "?"} issues`);
    for (const p of projects.nodes) {
      console.log(`  - ${p.name}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
