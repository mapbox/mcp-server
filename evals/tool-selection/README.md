# Tool-selection eval

Measures which tools Claude picks for a prompt, given this server's tool descriptions and server instructions. Use it to catch routing regressions when you change a description, the server instructions, or the render hint that data tools append to their results.

It is not part of `npm test`: it calls the Claude API and costs money. Mapbox APIs are never called, since every tool result is a canned stub.

## How it works

- **Tool surface:** `harness.ts` builds a real `McpServer` the same way the hosted deployment does (`publishJsonSchema2020`, `installTo`, `buildServerInstructions`) and reads `tools/list` and the server instructions back over an in-memory MCP connection.
- **Host simulation:** two host tools sit next to the Mapbox tools. `web_search` and `places_map_display_v0` let us see whether our descriptions crowd out other sources. A case can add `write_file` through `host_tools`, for agents building a page or file.
- **Two modes per case:**
  - `eager`: every tool description is loaded up front.
  - `deferred`: Mapbox tools are marked `defer_loading` behind the API's tool search. This approximates hosts like Claude Desktop that only load tools on demand, where the server instructions do most of the routing.
- **Conversation:** up to 5 model calls per case. Tool calls get stub results, and data tools get the server's real render hint appended, with a distinct ref per result.
- **Grading:** programmatic, against each case's `expect` in `cases.json`:
  - `first`: acceptable first tool
  - `must`: tools that must all be called
  - `any_of`: at least one of these must be called
  - `must_not`: none may be called; `*mapbox*` means any Mapbox tool
- **Metrics:**
  - `pass` (all checks hold), `first_ok` and `no_forbidden`
  - `ref_ok`: every `render_map_tool` call passes refs it was actually given, unchanged, and doesn't hand-build a map when a ref was available
  - `no_token_ask`: the agent neither asks the user for a Mapbox token nor writes a placeholder token (`YOUR_MAPBOX_...`, `pk...`) into a file

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

## OpenAI models

The same cases, stubs and grader can run against an OpenAI model through the Responses API, to check that a description change doesn't regress routing for ChatGPT-style hosts. Results go to a separate flow, `.claude/hillclimb/tool-selection-openai`, so comparisons never mix providers.

```bash
npm run eval:tools:openai -- --variant baseline --reps 3 --model <OpenAI model id>
EVAL_SERVER_ROOT=../mcp-server-pr npm run eval:tools:openai -- --variant v1 --reps 3 --model <same id>
npm run eval:tools:report:openai
```

- **Key:** the runner reads `OPENAI_API_KEY`.
- **`--model` is required:** the runner's default is a Claude model, so an OpenAI run without `--model` refuses to start.
- **Which model:**
  - `chat-latest` is the closest proxy for ChatGPT, but it only supports tools loaded up front (tool search returns a 400). Run it with `EVAL_MODES=eager`. It also reports itself as `chat-latest`, not a dated snapshot, so run the two branches back to back to keep the comparison on one model.
  - `gpt-6.1-sol` supports both modes and stands in for API-based hosts. (Checked 2026-10-12.)
- **Deferred mode:** uses OpenAI's server-executed tool search (`{type: "tool_search", execution: "server"}`) with `defer_loading` on the Mapbox functions.
- **Turns:** chained with `previous_response_id`.
- **Schemas:** passed with `strict: false`, so the 2020-12 schemas aren't rewritten for strict mode.
- **Usage:** recorded in the same shape as Claude's. Cached tokens go to `cache_read_input_tokens`. The report has no OpenAI prices, so cost isn't computed.

**What this does and doesn't measure.** It measures how an OpenAI model routes given our descriptions, server instructions and render hint. It doesn't reproduce ChatGPT itself. ChatGPT's system prompt, how it exposes connector tools, whether it passes MCP server instructions to the model, and its own built-in tools are not public. Treat a regression here as a strong signal, and a pass as "no regression at the model level".

## Adding cases

Add an entry to `cases.json` with a `why` that names the description or instruction it exercises.

Give it `stubs` for every tool the prompt might reasonably call, written about the place in the prompt. A canned answer about the wrong place makes Claude retry or switch tools, and that gets scored as a routing failure. Calls without a stub return "No results" and are counted in the `unstubbed` column. A non-zero count means the case needs another stub, not that the model misrouted.

The grader throws if a case names a tool that doesn't exist, so a renamed tool can't turn a `must_not` into a silent pass. A case can list tools in `needs_tools` instead: on a server without one of them, the case fails with "needs X, which this server doesn't have" rather than throwing. The site-building cases use this for `export_map_html_tool` (#275), so on main they show the baseline behavior instead of crashing the run.

The stubs return canned output, so a stubbed `export_map_html_tool` result is a placeholder page. An agent that notices sometimes writes its own page or offers to rebuild it with a token, which `no_token_ask` flags. Read those transcripts before counting them as regressions. The noise floor for a pass rate is roughly `1/sqrt(rows x reps)`. At 34 rows x 3 reps that's about ±10 points overall, and much wider for any single case.

## Files

- `harness.ts`: tool surface, host tools, stubs, conversation loop, grader
- `cases.json`: prompts and expected trajectories
- `run-eval.mjs`: runner, vendored from the claude-api skill's eval scaffold (resume, backoff, wall-clock ceiling, served-model check, failure sidecar)
- `build-report-lite.mjs`: static report builder, vendored from the same skill
