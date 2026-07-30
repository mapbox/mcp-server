"use strict";
// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVersionInfo = getVersionInfo;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
function getVersionInfo() {
    const name = 'Mapbox MCP server';
    try {
        const dirname = __dirname;
        // Try to read from version.json first (for build artifacts)
        const versionJsonPath = node_path_1.default.resolve(dirname, '..', 'version.json');
        try {
            const versionData = (0, node_fs_1.readFileSync)(versionJsonPath, 'utf-8');
            const info = JSON.parse(versionData);
            info['name'] = name;
            return info;
        }
        catch {
            // Fall back to package.json
            const packageJsonPath = node_path_1.default.resolve(dirname, '..', '..', '..', 'package.json');
            const packageData = (0, node_fs_1.readFileSync)(packageJsonPath, 'utf-8');
            const packageInfo = JSON.parse(packageData);
            return {
                name: name,
                version: packageInfo.version || '0.0.0',
                sha: 'unknown',
                tag: 'unknown',
                branch: 'unknown'
            };
        }
    }
    catch (error) {
        console.warn(`Failed to read version info: ${error}`);
        return {
            name: name,
            version: '0.0.0',
            sha: 'unknown',
            tag: 'unknown',
            branch: 'unknown'
        };
    }
}
//# sourceMappingURL=versionUtils-cjs.cjs.map