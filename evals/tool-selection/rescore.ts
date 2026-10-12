// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Re-grade existing results from their saved transcripts, without calling the
 * API. Use after changing the grader or a case's `expect` so old rows are
 * scored the same way as new ones.
 *
 *   npx tsx evals/tool-selection/rescore.ts baseline v1
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gradeCase, loadCases } from './harness.ts';

const FLOW = '.claude/hillclimb/tool-selection';

const cases = new Map(loadCases().map((c) => [c.id, c]));

for (const variant of process.argv.slice(2)) {
  const path = join(FLOW, variant, 'results.jsonl');
  const rows = readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);

  let changed = 0;
  for (const row of rows) {
    const c = cases.get(String(row.prompt_id));
    if (!c) throw new Error(`${variant}: no case for ${row.prompt_id}`);
    const transcript = JSON.parse(
      readFileSync(
        join(FLOW, variant, 'traces', `${row.prompt_id}_rep${row.rep}.json`),
        'utf8'
      )
    ) as Array<Record<string, unknown>>;
    const trajectory = String(row.trajectory ?? '');
    const g = await gradeCase(c, {
      tool_calls: trajectory ? trajectory.split(' > ') : [],
      transcript
    });
    if (JSON.stringify(g.grade) !== JSON.stringify(row.grade)) changed++;
    row.grade = g.grade;
    row.explanation = g.explanation;
  }
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`${variant}: ${rows.length} rows, ${changed} grades changed`);
}
process.exit(0);
