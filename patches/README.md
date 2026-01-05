# MCP SDK Patches

This directory contains patches for npm dependencies that are automatically applied after `npm install`.

## @modelcontextprotocol/sdk

**File:** `@modelcontextprotocol+sdk+1.21.1.patch`

**Purpose:** Makes MCP output schema validation non-fatal to improve resilience and user experience.

**Problem:** The MCP SDK enforces strict output schema validation, which causes the entire tool call to fail when there are minor schema mismatches. This creates unnecessary risk and poor user experience - most MCP clients can gracefully handle responses that don't perfectly match the declared schema.

**Solution:** This patch modifies the MCP SDK to log warnings instead of throwing errors when output validation fails. This provides a better balance between:

- **Schema documentation** - Output schemas still serve as documentation for expected response structure
- **Resilience** - Tools continue working even with minor variations in response format
- **Observability** - Validation issues are logged for monitoring and debugging
- **User experience** - Clients receive the actual data instead of an error

**Benefits:**

- Prevents tool failures due to minor schema variations
- Allows graceful degradation when APIs evolve or return edge cases
- Maintains backward compatibility while improving reliability
- Clients that need strict validation can implement it themselves

**Changes:**

- Converts validation errors to console warnings with `[MCP SDK Patch]` prefix
- Allows tools to return structured content even when it doesn't match the schema exactly
- Preserves all existing functionality while removing unnecessary strictness

**Maintenance:**

- This patch is automatically applied after `npm install` via the `postinstall` script
- If the MCP SDK is updated, you may need to recreate this patch:
  1. Remove the old patch file
  2. Make the same modifications to the new SDK version
  3. Run `npx patch-package @modelcontextprotocol/sdk`

**Philosophy:** This patch follows the robustness principle: "Be conservative in what you send, be liberal in what you accept." Output schemas remain valuable for documentation and tooling, but shouldn't cause failures when the real-world data varies slightly from the ideal schema.
