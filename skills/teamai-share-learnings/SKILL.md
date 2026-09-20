---
name: teamai-share-learnings
description: "Contribute — share session learnings to the team knowledge base"
---

# Contribute — share session learnings to the team knowledge base

Summarize what this AI coding session learned and push it to the team knowledge base.

**Write the document in the team's shared knowledge-base language if one is established (check existing files under `learnings/` for the prevailing language); otherwise use the same language as this conversation.**

## When to Use

- When teamai suggests this session has valuable content worth sharing
- When you've solved a tricky problem and want to document the solution
- When you've discovered a useful workflow or pattern
- After a long session with diverse tool usage

## How It Works

1. **Summarize**: review this session's tool usage, the problem solved, and any patterns discovered
2. **Generate the document**: write a Markdown document covering:
   - What the task/problem was
   - Key decisions and why
   - The solution, workaround, or pattern discovered
   - Which tools/skills were especially useful
   - Pitfalls and things to watch out for
3. **Save to a temp file**: write it to a temporary file
4. **Push to the team**: run `teamai contribute --file <path> --title "<title>"`

## Document Template

**The document must include YAML frontmatter, used for search indexing and knowledge discovery.**

```markdown
---
title: "<short title describing the core problem or finding>"
author: <username>
date: <YYYY-MM-DD>
tags: [tag1, tag2, tag3]
---

## Background
What were you doing? What problem did you run into?

## Solution
How was it solved? What were the key steps?

## Takeaways
- Takeaway 1
- Takeaway 2

## Related Skills
- skill-name-1
- skill-name-2
```

### Frontmatter fields

| Field | Required | Description | Example |
|------|------|------|------|
| title | ✅ | Short title (<60 chars) | "K8s Pod OOM troubleshooting guide" |
| author | ✅ | Contributor username | jeffyxu |
| date | ✅ | Date, YYYY-MM-DD | 2026-03-28 |
| tags | ✅ | 2-5 key tags | [k8s, oom, troubleshooting] |

### Choosing tags

Pick 2-5 from these categories:
- **Tech stack**: python, typescript, go, k8s, docker, sglang, cuda
- **Problem type**: troubleshooting, performance, deployment, config, api
- **Pattern**: workflow, pattern, tool-usage, best-practice
- **Scenario**: debugging, testing, monitoring, security

## Example

```bash
# After the AI generates the summary doc at /tmp/session-summary.md
teamai contribute --file /tmp/session-summary.md --title "K8s pod startup timeout troubleshooting"
```

## Important

- Run this as a **sub-agent** (Agent tool) to avoid polluting the main session's context
- The document is pushed directly to master in the team repo's `learnings/` directory
- Team members will see it on their next `teamai pull`
- Keep summaries concise and actionable — this is a knowledge base, not a diary
