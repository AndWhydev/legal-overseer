#!/usr/bin/env node
/**
 * Split BitBit into two teams: Engineering + Business
 * Rename existing "BitBit" → "Engineering", create "Business"
 * Move GTM/Legal/Product/R&D/Clients projects + their issues → Business
 */
import { LinearClient } from "@linear/sdk";

const apiKey = process.env.LINEAR_API_KEY;
if (!apiKey) { console.error("Set LINEAR_API_KEY"); process.exit(1); }
const client = new LinearClient({ apiKey });

const BUSINESS_PROJECTS = [
  "GTM: Legal & Business",
  "GTM: First Revenue",
  "GTM: Beta Program",
  "GTM: Public Launch",
  "Marketing & GTM",
  "Legal & Structure",
  "Clients & Pipeline",
  "Product",
  "R&D",
];

async function main() {
  // 1. Get existing BitBit team
  const teamsResp = await client.teams();
  const bitbitTeam = teamsResp.nodes.find(t => t.name === "BitBit");
  if (!bitbitTeam) { console.error("BitBit team not found"); process.exit(1); }
  console.log(`Found BitBit team: ${bitbitTeam.id}`);

  // 2. Rename BitBit → Engineering
  await client.updateTeam(bitbitTeam.id, {
    name: "Engineering",
    key: "ENG",
    description: "Backend, frontend, agents, infrastructure — all technical work",
  });
  console.log("Renamed BitBit → Engineering (ENG)");

  // 3. Create Business team
  let businessTeam;
  try {
    const result = await client.createTeam({
      name: "Business",
      key: "BIZ",
      description: "GTM, legal, pricing, beta, marketing, revenue ops, client pipeline",
      color: "#f59e0b",
    });
    businessTeam = await result.team;
    console.log(`Created Business team: ${businessTeam.id}`);
  } catch (err) {
    console.error(`Failed to create Business team: ${err.message}`);
    process.exit(1);
  }

  // 4. Get all projects and identify which to move
  const projectsResp = await client.projects({ first: 100 });
  const projectsToMove = projectsResp.nodes.filter(p => BUSINESS_PROJECTS.includes(p.name));
  console.log(`\nMoving ${projectsToMove.length} projects to Business team...`);

  for (const project of projectsToMove) {
    try {
      await client.updateProject(project.id, { teamIds: [businessTeam.id] });
      console.log(`  Moved project: ${project.name}`);
    } catch (err) {
      console.error(`  Failed to move project "${project.name}": ${err.message}`);
    }
  }

  // 5. Move issues in those projects to Business team
  console.log("\nMoving issues to Business team...");
  const projectIds = new Set(projectsToMove.map(p => p.id));

  let cursor = undefined;
  let moved = 0;

  while (true) {
    const issuesResp = await client.issues({
      first: 50,
      after: cursor,
      filter: { team: { id: { eq: bitbitTeam.id } } },
    });

    if (issuesResp.nodes.length === 0) break;

    for (const issue of issuesResp.nodes) {
      if (issue.projectId && projectIds.has(issue.projectId)) {
        try {
          await client.updateIssue(issue.id, { teamId: businessTeam.id });
          moved++;
          if (moved % 10 === 0) console.log(`  Moved ${moved} issues...`);
        } catch (err) {
          console.error(`  Failed: ${issue.title}: ${err.message}`);
        }
      }
    }

    if (!issuesResp.pageInfo.hasNextPage) break;
    cursor = issuesResp.pageInfo.endCursor;

    if (moved % 50 === 0 && moved > 0) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log(`\nMoved ${moved} issues to Business team`);

  // 6. Summary
  console.log("\n=== Final Structure ===");
  const finalTeams = await client.teams();
  for (const team of finalTeams.nodes) {
    const projects = await team.projects({ first: 50 });
    console.log(`\n${team.name} (${team.key}): ${projects.nodes.length} projects`);
    for (const p of projects.nodes) {
      console.log(`  - ${p.name}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
