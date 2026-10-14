// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// Writes the standalone map script that export_map_html_tool pages load from
// jsDelivr. Runs after tshy, from the compiled ESM output, so the file is
// byte-for-byte what standaloneMapAppScript() returns and matches the
// integrity hash the tool puts in each page.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  STANDALONE_SCRIPT_PATH,
  standaloneMapAppScript,
  standaloneScriptIntegrity
} from '../dist/esm/resources/ui-apps/mapAppStandalone.js';

mkdirSync(dirname(STANDALONE_SCRIPT_PATH), { recursive: true });
writeFileSync(STANDALONE_SCRIPT_PATH, standaloneMapAppScript());
console.log(
  `Wrote ${STANDALONE_SCRIPT_PATH} (${standaloneMapAppScript().length} bytes, ${standaloneScriptIntegrity()})`
);
