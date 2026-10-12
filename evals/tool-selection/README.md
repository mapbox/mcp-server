# Tool-selection eval

Measures which tools Claude picks for a prompt, given this server's tool descriptions and server instructions. Use it to catch routing regressions when you change a description, the server instructions, or the render hint that data tools append to their results.

It is not part of `npm test`: it calls the Claude API and costs money. Mapbox APIs are never called, since every tool result is a canned stub.

## How it works

- **Tool surface:** `harness.ts` builds a real `McpServer` the same way the hosted deployment does (`publishJsonSchema2020`, `installTo`, `buildServerInstructions`) and reads `tools/list` and the server instructions back over an in-memory MCP connection.
- **Host simulation:** two host tools sit next to the Mapbox tools. `web_search` and `places_map_display_v0` let us see whether our descriptions crowd out other sources.
- **Two modes per case:**
  - `eager`: every tool description is loaded up front.
  - `deferred`: Mapbox tools are marked `defer_loading` behind the API's tool search. This approximates hosts like Claude Desktop that only load tools on demand, where the server instructions do most of the routing.
- **Conversation:** up to 5 model calls per case. Tool calls get stub results, and data tools get the server's real render hint appended.
- **Grading:** programmatic, against each case's `expect` in `cases.json`:
  - `first`: acceptable first tool
  - `must`: tools that must all be called
  - `any_of`: at least one of these must be called
  - `must_not`: none may be called; `*mapbox*` means any Mapbox tool
- **Metrics:** `pass` (all checks hold), `first_ok` and `no_forbidden`.

## Running

The runner reads `ANTHROPIC_API_KEY` from the environment.

```bash
# Baseline: the current checkout
npm run eval:tools -- --variant baseline --reps 3

# Compare another branch (e.g. a PR) from a worktree
git worktree add --detach ../mcp-server-pr origin/<branch>
ln -s "$PWD/node_modules" ../mcp-server-pr/node_modules
EVAL_SERVER_ROOT=../mcp-server-pr npm run eval:tools -- --variant v1 --reps 3

# Build the HTML report (baseline vs v1, per case)
npm run eval:tools:report
open .claude/hillclimb/tool-selection/report.html
```

- **Options:** `--model` (default `claude-opus-5-5`), `--reps`, `--concurrency` (default 8) and `--timeout-s` (default 600).
- **Resume:** runs pick up where they left off. Each `(case, rep)` is skipped once it has a row in `results.jsonl`.
- **Failures:** failed attempts go to `errors.jsonl` instead.
- **Variants:** a v1 run should note what changed in `.claude/hillclimb/tool-selection/v1/change.md`, so the report can explain the difference.

**First run:** the runner refuses to start until you approve the harness. Review `harness.ts` and `cases.json`, then add `--approve-harness` once. It records a hash of the runner, the lockfile and those two files in `_state.json`. Any later edit to them needs another approval.

## Adding cases

Add an entry to `cases.json` with a `why` that names the description or instruction it exercises.

Give it `stubs` for every tool the prompt might reasonably call, written about the place in the prompt. A canned answer about the wrong place makes Claude retry or switch tools, and that gets scored as a routing failure. Calls without a stub return "No results" and are counted in the `unstubbed` column. A non-zero count means the case needs another stub, not that the model misrouted.

The grader throws if a case names a tool that doesn't exist, so a renamed tool can't turn a `must_not` into a silent pass. The noise floor for a pass rate is roughly `1/sqrt(rows x reps)`. At 34 rows x 3 reps that's about ±10 points overall, and much wider for any single case.

## Files

- `harness.ts`: tool surface, host tools, stubs, conversation loop, grader
- `cases.json`: prompts and expected trajectories
- `run-eval.mjs`: runner, vendored from the claude-api skill's eval scaffold (resume, backoff, wall-clock ceiling, served-model check, failure sidecar)
- `build-report-lite.mjs`: static report builder, vendored from the same skill
