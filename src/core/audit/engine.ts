import { AUDIT_RULES, type AuditContext, type AuditRule } from '@/core/audit/rules';

export interface AuditRuleResult {
  id: string;
  title: string;
  category: string;
  weight: number;
  passed: boolean;
  recommendation: string;
}

export interface AuditResult {
  /** Weighted score, 0–100. */
  score: number;
  maxScore: number;
  rules: AuditRuleResult[];
  /** Titles of failed rules (what's missing). */
  missing: string[];
  /** Recommendations for failed rules. */
  recommendations: string[];
}

/**
 * Evaluate every rule against the context and compute a weighted score:
 * `round(100 × passedWeight / totalWeight)`. Pure and deterministic — the same
 * context always yields the same report.
 */
export function runAudit(ctx: AuditContext, rules: AuditRule[] = AUDIT_RULES): AuditResult {
  const evaluated: AuditRuleResult[] = rules.map((rule) => ({
    id: rule.id,
    title: rule.title,
    category: rule.category,
    weight: rule.weight,
    passed: rule.passes(ctx),
    recommendation: rule.recommendation,
  }));

  const totalWeight = evaluated.reduce((sum, r) => sum + r.weight, 0);
  const passedWeight = evaluated.filter((r) => r.passed).reduce((sum, r) => sum + r.weight, 0);
  const score = totalWeight === 0 ? 100 : Math.round((passedWeight / totalWeight) * 100);

  const failed = evaluated.filter((r) => !r.passed);

  return {
    score,
    maxScore: 100,
    rules: evaluated,
    missing: failed.map((r) => r.title),
    recommendations: failed.map((r) => r.recommendation),
  };
}
