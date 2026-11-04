# 0015. A superseded version uses the same page, with no request button

- **Status:** Proposed. Settles the open point in [0004](0004-superseded-versions-are-read-only.md).
- **Date:** 2026-11-04
- **Applies to:** [documents-list](../specs/documents-list/SPEC.md), [request-review](../specs/request-review/SPEC.md), [read-result](../specs/read-result/SPEC.md)

## Context

UC3c said the button is disabled for a superseded version, and UC9 said there is no button. The list and the document page both show such a version.

## Decision

A superseded version is marked "Read-only" in the list and on its page. The page is the same page and the same components as for a current version; it just has no "Request review" button.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| A disabled button with a reason | Offers an action that can never work on this version |
| A separate page for old versions | More components for the same content |

## Consequences

- **Good:** nothing to click, no extra page. The state is visible already in the list.
- **Bad, accepted:** the page decides whether to show the button, from data given by the API.
- **Follow-ups:** none. The server still rejects a request with `document_superseded`.
