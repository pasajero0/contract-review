import { describe, expect, it } from 'vitest';
import { orderFindings } from './findingOrder.ts';
import type { IncomingFinding } from './review.ts';

function finding(severity: string, clause: string | null, title = `${severity} ${clause}`): IncomingFinding {
  return { clause, title, severity, excerpt: null, explanation: 'Why' };
}

function titles(findings: IncomingFinding[]): string[] {
  return findings.map((item) => item.title);
}

describe('orderFindings', () => {
  it('read-result AC-2: puts high first, then medium, then low', () => {
    const sorted = orderFindings([
      finding('low', '1'),
      finding('medium', '1'),
      finding('high', '1'),
      finding('medium', '2'),
    ]);

    expect(sorted.map((item) => item.severity)).toEqual(['high', 'medium', 'medium', 'low']);
  });

  it('read-result AC-2: orders clause numbers naturally, not as text: 4.2 before 12.1', () => {
    const sorted = orderFindings([finding('high', '12.1'), finding('high', '4.2')]);

    expect(sorted.map((item) => item.clause)).toEqual(['4.2', '12.1']);
  });

  it('read-result AC-2: orders 2 before 10', () => {
    const sorted = orderFindings([finding('low', '10'), finding('low', '2')]);

    expect(sorted.map((item) => item.clause)).toEqual(['2', '10']);
  });

  it('read-result AC-2: orders 3.1 before 3.1.2 and 3.1.2 before 3.2', () => {
    const sorted = orderFindings([finding('medium', '3.2'), finding('medium', '3.1.2'), finding('medium', '3.1')]);

    expect(sorted.map((item) => item.clause)).toEqual(['3.1', '3.1.2', '3.2']);
  });

  it('read-result AC-2: puts findings without a clause last within their severity', () => {
    const sorted = orderFindings([
      finding('high', null, 'high none'),
      finding('high', '9', 'high 9'),
      finding('medium', null, 'medium none'),
      finding('low', '1', 'low 1'),
      finding('medium', '1', 'medium 1'),
    ]);

    expect(titles(sorted)).toEqual(['high 9', 'high none', 'medium 1', 'medium none', 'low 1']);
  });

  it('read-result AC-2: keeps arrival order for equal keys and does not change its input', () => {
    const input = [
      finding('high', '3.1', 'first'),
      finding('high', null, 'none first'),
      finding('high', '3.1', 'second'),
      finding('high', null, 'none second'),
      finding('low', '1', 'low'),
    ];
    const copy = input.map((item) => ({ ...item }));

    const sorted = orderFindings(input);

    expect(titles(sorted)).toEqual(['first', 'second', 'none first', 'none second', 'low']);
    expect(sorted).not.toBe(input);
    expect(input).toEqual(copy);
  });
});
