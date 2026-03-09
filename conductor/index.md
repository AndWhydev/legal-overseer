# BitBit conductor index

Read these artifacts before starting any work on the project.

## Context artifacts

| Artifact | What it covers | Verified |
|----------|---------------|---------------|
| [product.md](./product.md) | What BitBit is, who it's for, what's built, what's next | 2026-03-09 |
| [product-guidelines.md](./product-guidelines.md) | Brand voice, terminology, how BitBit should feel | 2026-03-09 |
| [tech-stack.md](./tech-stack.md) | Technologies, dependencies, infrastructure | 2026-03-09 |
| [workflow.md](./workflow.md) | Development practices, testing, deployment | 2026-03-09 |
| [tracks.md](./tracks.md) | Current and planned work | 2026-03-09 |

## Quick start

1. Read `product.md` to understand what we're building and for whom
2. Read `product-guidelines.md` to understand how BitBit should feel as an entity
3. Read `tech-stack.md` for technology decisions
4. Read `workflow.md` for how we develop
5. Check `tracks.md` for what's in progress

## Track workflow

When starting new work:

1. Add an entry to tracks.md with status planned
2. Create a directory at `tracks/<track-id>/`
3. Write spec.md with requirements and acceptance criteria
4. Write plan.md with phased implementation tasks
5. Update tracks.md as work progresses
6. Mark complete when done

## Principles

**Context comes before code.** Check that the artifacts are current before starting implementation. If something is outdated, fix it first.

**Living documents.** These files change as the project changes. Treat them like code, not like a wiki nobody maintains.

**One place per thing.** If information belongs somewhere, put it there. Don't scatter the same fact across multiple files.

**Consistency for AI sessions.** These artifacts ensure that every development session, whether human or AI assisted, starts from the same understanding of what BitBit is and how it should work.
