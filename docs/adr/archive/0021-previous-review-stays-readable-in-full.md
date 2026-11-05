# 0021. The previous review stays readable in full

- **Status:** Accepted (makes 0001 precise)
- **Date:** 2026-11-04
- **Applies to:** [request-review](../specs/request-review/SPEC.md), [read-result](../specs/read-result/SPEC.md)

## Context

0001 keeps the previous review on screen while a new one runs, but did not say how much of it. One test said no finding text at all may show during a run, while `read-result` said the previous review's findings show under its label. The product manager wants a lawyer never to wait in front of nothing. The senior partner wants nothing partial or old to read as final. 0002 forbids the findings of a review that has not completed; a previous review has completed.

## Decision

While a new review runs, or after one fails, the last completed review stays readable in full, with its findings, in a separate block labelled "Previous review". The findings of a running or failed review are never shown.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Show only its label, date and counts during a run | The lawyer loses a usable result for up to 60 seconds, and waits in front of nothing |
| Show it as the normal result | An old result could be read as the current one, which the partner refuses |

## Consequences

- **Good:** both people's needs are met: the result stays usable, and its label says it is not the new one.
- **Bad, accepted:** a lawyer can read an old result during a run; the label and the banner must be hard to miss.
- **Follow-ups:** none.
