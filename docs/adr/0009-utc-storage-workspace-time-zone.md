# 0009. Store time as UTC epoch ms; compute months in the workspace time zone

- **Status:** Proposed
- **Date:** 2026-11-04
- **Applies to:** [request-review](../specs/request-review/SPEC.md)

## Context

The plan is per calendar month. Servers usually run in UTC, the cloud region is not the customer's country, and one server can host firms from Milan and Sofia. The plan month belongs to the contract with the firm, not to the machine. Italy, Spain, France and Germany use CET/CEST; Bulgaria uses `Europe/Sofia`, one hour ahead.

## Decision

All timestamps are integer epoch milliseconds, UTC. The time zone is a workspace setting, `config.timeZone`, default `Europe/Rome`. Month boundaries are computed in it with `Intl`, with no date library.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Server time zone for the month boundary | A UTC server would start the Rome month an hour or two late |
| ISO strings in the database | Format differences could break `deadline_at > now`. Numbers cannot |
| A time-zone library | Not needed: POC Q5 shows `Intl` handles months with a clock change |

## Consequences

- **Good:** Rome and Sofia boundaries differ by one hour, as they should, and tests can prove it.
- **Bad, accepted:** raw timestamps are unreadable in the database and in JSON. `monthWindow` is not tested for a clock change exactly at midnight on the 1st; Rome and Sofia do not have one.
- **Follow-ups:** add a library only if more date work appears.
