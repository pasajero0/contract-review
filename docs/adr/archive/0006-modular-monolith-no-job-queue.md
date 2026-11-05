# 0006. One process, with no job queue

- **Status:** Accepted
- **Date:** 2026-11-04
- **Applies to:** [request-review](../specs/request-review/SPEC.md)

## Context

An AI review can take up to 120 seconds, so it cannot run inside the HTTP request. A running review must survive a restart in a defined way, and any review still running at 60 seconds has failed permanently.

## Decision

We run one Node process with layers. A runner and a sweeper work in the background inside it. An interrupted review expires on its own through the deadline stored in its row.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Job queue with a worker (Redis, BullMQ) | Infrastructure and another process to run. Its main benefit, surviving a restart, already comes from the 60-second rule |
| Microservices or serverless | Network and deployment cost with no benefit for the rules |

## Consequences

- **Good:** one command to run. POC Q6: after `kill -9` and a restart, the review failed at 60 s and the document was free.
- **Bad, accepted:** a restart loses the running AI task, so that review ends as `timeout`. `node --watch` does the same on every code edit. A slow engine keeps running past the deadline until it ends.
- **Follow-ups:** none for the case; a real model would need a way to cancel the task.
