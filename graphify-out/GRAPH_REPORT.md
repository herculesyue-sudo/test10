# Graph Report - .  (2026-08-10)

## Corpus Check
- Corpus is ~4 words - fits in a single context window. You may not need a graph.

## Summary
- 2 nodes · 1 edges · 1 communities (0 shown, 1 thin omitted)
- Extraction: 0% EXTRACTED · 0% INFERRED · 100% AMBIGUOUS
- Token cost: 39,337 input · 0 output

## Community Hubs (Navigation)
- Project README

## God Nodes (most connected - your core abstractions)
1. `My Project` - 1 edges
2. `test10` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (1 total, 1 thin omitted)

## Ambiguous Edges - Review These
- `My Project` → `test10`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **2 isolated node(s):** `My Project`, `test10`
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.
- **High ambiguity: 100% of edges are AMBIGUOUS.** Review the Ambiguous Edges section above.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `My Project` and `test10`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What connects `My Project`, `test10` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._