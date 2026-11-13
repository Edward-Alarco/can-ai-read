/**
 * Observable technical readability score (0–100).
 *
 * This is not a measure of AI understanding, indexing or citations.
 * It only awards points from checks that can be observed in the HTTP
 * response, initial HTML and robots.txt.
 *
 * Weights (100 pts):
 *   Access (40)   — server 12, indexing directives 14, search-crawler permissions 14
 *   Content (35)  — initial HTML text 16, main heading 8, internal links 6, image alt 5
 *   Signals (25)  — title & description 12, canonical 6, structured data 7
 *
 * Award rules:
 *   pass or info          → 100% of the check weight (info never deducts)
 *   warning + high        → 0%
 *   warning + medium      → 50%
 *   warning + low         → 75%
 *   warning + none        → 100% (not treated as an actionable deduction)
 *
 * Training-crawler blocks (GPTBot, ClaudeBot) are not a scored check and never deduct.
 *
 * Hard caps (the lowest applicable cap wins):
 *   page unreachable / server response failure → max 20
 *   noindex (or equivalent indexing restriction), search crawlers blocked
 *   by robots.txt, or near-empty initial HTML text → max 40
 *
 * Each check’s award is rounded to an integer so group totals and the
 * final score stay whole numbers.
 */
export type ScoreCheck = { id: string; state: 'pass' | 'warning' | 'info'; priority: 'high' | 'medium' | 'low' | 'none' };
export type ScoreGroupId = 'access' | 'content' | 'signals';
export type ScoreCapReason = 'unreachable' | 'noindex' | 'search-blocked' | 'thin-content';
export type FindingScore = { id: string; group: ScoreGroupId; weight: number; awarded: number; deducted: number };
export type ScoreGroup = { id: ScoreGroupId; points: number; max: number };
export type PageScore = { score: number; uncapped: number; cap?: { reason: ScoreCapReason; max: number }; groups: ScoreGroup[]; perFinding: FindingScore[] };

export const SCORE_WEIGHTS = {
  access: { max: 40, checks: { server: 12, indexing: 14, 'search-access': 14 } },
  content: { max: 35, checks: { text: 16, headings: 8, links: 6, images: 5 } },
  signals: { max: 25, checks: { metadata: 12, canonical: 6, schema: 7 } },
} as const;

export const SCORE_CAPS = { unreachable: 20, noindex: 40, 'search-blocked': 40, 'thin-content': 40 } as const;

const CHECK_GROUP = Object.fromEntries(
  (Object.entries(SCORE_WEIGHTS) as [ScoreGroupId, (typeof SCORE_WEIGHTS)[ScoreGroupId]][]).flatMap(([group, spec]) =>
    Object.keys(spec.checks).map(id => [id, group]),
  ),
) as Record<string, ScoreGroupId>;

function weightOf(id: string): number {
  const group = CHECK_GROUP[id];
  if (!group) return 0;
  return (SCORE_WEIGHTS[group].checks as Record<string, number>)[id] ?? 0;
}

function awardFactor(check: ScoreCheck): number {
  if (check.state !== 'warning') return 1;
  if (check.priority === 'high') return 0;
  if (check.priority === 'medium') return 0.5;
  if (check.priority === 'low') return 0.75;
  return 1;
}

function awardFor(check: ScoreCheck): number {
  return Math.round(weightOf(check.id) * awardFactor(check));
}

function resolveCap(findings: ScoreCheck[]): PageScore['cap'] {
  const byId = new Map(findings.map(f => [f.id, f]));
  const caps: { reason: ScoreCapReason; max: number }[] = [];
  const server = byId.get('server');
  if (server && server.state !== 'pass' && server.state !== 'info') caps.push({ reason: 'unreachable', max: SCORE_CAPS.unreachable });
  const indexing = byId.get('indexing');
  if (indexing?.state === 'warning') caps.push({ reason: 'noindex', max: SCORE_CAPS.noindex });
  const search = byId.get('search-access');
  if (search?.state === 'warning') caps.push({ reason: 'search-blocked', max: SCORE_CAPS['search-blocked'] });
  const text = byId.get('text');
  if (text?.state === 'warning') caps.push({ reason: 'thin-content', max: SCORE_CAPS['thin-content'] });
  if (!caps.length) return undefined;
  return caps.reduce((lowest, cap) => cap.max < lowest.max ? cap : lowest);
}

export function computeScore(input: ScoreCheck[] | { findings: ScoreCheck[] }): PageScore {
  const findings = Array.isArray(input) ? input : input.findings;
  const seen = new Set<string>();
  const perFinding: FindingScore[] = [];
  for (const check of findings) {
    if (seen.has(check.id) || !CHECK_GROUP[check.id]) continue;
    seen.add(check.id);
    const weight = weightOf(check.id);
    const awarded = awardFor(check);
    perFinding.push({ id: check.id, group: CHECK_GROUP[check.id], weight, awarded, deducted: weight - awarded });
  }
  const groups: ScoreGroup[] = (['access', 'content', 'signals'] as const).map(id => ({
    id,
    max: SCORE_WEIGHTS[id].max,
    points: perFinding.filter(item => item.group === id).reduce((sum, item) => sum + item.awarded, 0),
  }));
  const uncapped = Math.max(0, Math.min(100, groups.reduce((sum, group) => sum + group.points, 0)));
  const cap = resolveCap(findings);
  const score = cap ? Math.min(uncapped, cap.max) : uncapped;
  return { score, uncapped, cap, groups, perFinding };
}

/** Points the overall score would gain if this check became a pass. Includes the effect of lifting a cap. */
export function recoverablePoints(input: ScoreCheck[] | { findings: ScoreCheck[] }, findingId: string): number {
  const findings = Array.isArray(input) ? input : input.findings;
  const current = computeScore(findings);
  const next = computeScore(findings.map(f => f.id === findingId ? { ...f, state: 'pass' as const, priority: 'none' as const } : f));
  return Math.max(0, next.score - current.score);
}

export const SCORE_RANGES = { good: 85, mid: 60 } as const;
export function scoreRange(score: number): 'good' | 'mid' | 'poor' {
  return score >= SCORE_RANGES.good ? 'good' : score >= SCORE_RANGES.mid ? 'mid' : 'poor';
}
