# Tool Description Testing

This directory contains tests for validating tool description quality and semantic matching capabilities.

## Test Suites

### 1. Description Quality Tests (`description-quality.test.ts`)

Validates that tool descriptions meet quality standards:

- ✅ Minimum length (>200 characters)
- ✅ Includes use cases and examples
- ✅ Contains relevant keywords for semantic matching
- ✅ Cross-references related tools
- ✅ Follows consistent structure

**Run:** `npm test -- test/tools/description-quality.test.ts`

### 2. Description Baseline Tests (`description-baseline.test.ts`)

Prevents regression of description quality over time:

- ✅ Maintains minimum word/phrase counts per tool
- ✅ Preserves semantic richness (vocabulary diversity)
- ✅ Ensures domain-specific terminology
- ✅ Validates consistent structure patterns

**Run:** `npm test -- test/tools/description-baseline.test.ts`

### 3. Semantic Tool Selection Tests (`semantic-tool-selection.test.ts`)

**⚠️ Requires OpenAI API Key**

Validates that tool descriptions work correctly with RAG-based semantic matching using OpenAI embeddings (text-embedding-3-small model).

Tests query-to-tool matching:

- ✅ "find coffee shops nearby" → `category_search_tool`
- ✅ "where is Starbucks" → `search_and_geocode_tool`
- ✅ "driving directions" → `directions_tool`
- ✅ "areas reachable in 30 minutes" → `isochrone_tool`
- ✅ Category vs specific place disambiguation
- ✅ Semantic similarity thresholds (>0.5 for relevant tools)

#### Running Semantic Tests

**Local Development:**

```bash
export OPENAI_API_KEY="your-key-here"
npm test -- test/tools/semantic-tool-selection.test.ts
```

**CI/CD:**
Set `OPENAI_API_KEY` as a GitHub secret and tests will run automatically.

**Without API Key:**
Tests are automatically skipped if `OPENAI_API_KEY` is not set.

## Test Philosophy

These tests align with our RAG optimization goals:

1. **Quality Tests** - Maintain description standards
2. **Baseline Tests** - Prevent regressions over time
3. **Semantic Tests** - Validate actual tool selection performance

The semantic tests are the **core validation** that descriptions work as intended for RAG-based tool selection, while quality/baseline tests ensure consistency.

## Expected Results

After RAG-optimized descriptions (PR #78):

- Average description length: ~1,260 characters
- Vocabulary diversity: 44-52% unique words
- Semantic similarity for relevant queries: >0.5

## Updating Baselines

If you intentionally improve descriptions beyond current baselines, update the thresholds in `description-baseline.test.ts`:

```typescript
const baselines: Record<
  string,
  { minLength: number; minWords: number; minPhrases: number }
> = {
  search_and_geocode_tool: {
    minLength: 800, // Update if improved
    minWords: 120,
    minPhrases: 15
  }
  // ...
};
```
