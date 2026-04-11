/**
 * strategyScoring — Client-side strategy activation scoring
 * Replicates the shouldActivate logic from the AI engine strategies
 * for instant feedback in the Strategy Selector scenario.
 *
 * @author Subash Karki
 */

export type Complexity = 'simple' | 'moderate' | 'complex' | 'critical';
export type Risk = 'low' | 'medium' | 'high' | 'critical';

export interface StrategyInput {
  complexity: Complexity;
  risk: Risk;
  ambiguous: boolean;
  blastRadius: number;
}

export interface StrategyScore {
  name: string;
  score: number;
  reason: string;
}

/**
 * Direct Strategy — best for simple, low-risk tasks
 */
function scoreDirect(input: StrategyInput): StrategyScore {
  const { complexity, risk } = input;
  let score = 0;
  let reason = '';

  if (complexity === 'simple' && risk === 'low') {
    score = 0.9;
    reason = 'Simple task with low risk — direct execution is fastest';
  } else if (complexity === 'moderate' && risk === 'low') {
    score = 0.6;
    reason = 'Moderate complexity but low risk — direct approach viable';
  } else if (complexity === 'simple' && risk === 'medium') {
    score = 0.5;
    reason = 'Simple but medium risk — direct possible with caution';
  } else if (complexity === 'moderate' && risk === 'medium') {
    score = 0.3;
    reason = 'Moderate complexity and risk — consider more structured approach';
  } else {
    score = 0.1;
    reason = 'Too complex or risky for direct execution';
  }

  return { name: 'Direct', score, reason };
}

/**
 * Advisor Strategy — for complex or high-risk tasks needing guidance
 */
function scoreAdvisor(input: StrategyInput): StrategyScore {
  const { complexity, risk, ambiguous } = input;
  let score = 0;
  let reason = '';

  if (complexity === 'complex') {
    score = 0.8;
    reason = 'Complex task benefits from advisory guidance';
  } else if (risk === 'high') {
    score = 0.85;
    reason = 'High risk — advisor can identify potential pitfalls';
  } else if (risk === 'critical') {
    score = 0.7;
    reason = 'Critical risk — advisor helpful but debate may be better';
  } else if (ambiguous) {
    score = 0.7;
    reason = 'Ambiguous requirements — advisor can clarify approach';
  } else if (complexity === 'moderate') {
    score = 0.5;
    reason = 'Moderate complexity — advisor provides marginal value';
  } else {
    score = 0.2;
    reason = 'Simple and clear — advisor not needed';
  }

  return { name: 'Advisor', score, reason };
}

/**
 * Self-Refine Strategy — iterative improvement for moderate confidence outputs
 */
function scoreSelfRefine(input: StrategyInput): StrategyScore {
  const { complexity, risk } = input;
  let score = 0;
  let reason = '';

  if (complexity === 'moderate' && risk === 'medium') {
    score = 0.8;
    reason = 'Moderate task — iterative refinement improves output quality';
  } else if (complexity === 'complex' && risk === 'low') {
    score = 0.7;
    reason = 'Complex but safe to iterate on';
  } else if (complexity === 'simple') {
    score = 0.2;
    reason = 'Simple task — refinement adds unnecessary overhead';
  } else if (risk === 'critical') {
    score = 0.3;
    reason = 'Critical risk — need stronger validation than self-review';
  } else {
    score = 0.5;
    reason = 'Self-refinement can improve quality incrementally';
  }

  return { name: 'Self-Refine', score, reason };
}

/**
 * Tree of Thought (ToT) — for ambiguous problems requiring exploration
 */
function scoreToT(input: StrategyInput): StrategyScore {
  const { complexity, ambiguous } = input;
  let score = 0;
  let reason = '';

  if (ambiguous && complexity === 'moderate') {
    score = 0.85;
    reason = 'Ambiguous + moderate — tree exploration finds best path';
  } else if (ambiguous && complexity === 'complex') {
    score = 0.8;
    reason = 'Ambiguous and complex — branching exploration valuable';
  } else if (ambiguous) {
    score = 0.65;
    reason = 'Ambiguity warrants exploring multiple approaches';
  } else if (complexity === 'complex') {
    score = 0.5;
    reason = 'Complex but clear — some exploration may help';
  } else {
    score = 0.15;
    reason = 'Clear requirements — tree exploration unnecessary';
  }

  return { name: 'Tree of Thought', score, reason };
}

/**
 * Debate Strategy — adversarial review for critical decisions
 */
function scoreDebate(input: StrategyInput): StrategyScore {
  const { complexity, risk } = input;
  let score = 0;
  let reason = '';

  if (risk === 'critical') {
    score = 0.9;
    reason = 'Critical risk demands adversarial review';
  } else if (risk === 'high' && complexity === 'moderate') {
    score = 0.8;
    reason = 'High risk + moderate complexity — debate catches blind spots';
  } else if (risk === 'high' && complexity === 'complex') {
    score = 0.75;
    reason = 'High risk + complex — debate valuable but resource-intensive';
  } else if (risk === 'medium') {
    score = 0.35;
    reason = 'Medium risk — debate is overkill';
  } else {
    score = 0.1;
    reason = 'Low risk — no need for adversarial review';
  }

  return { name: 'Debate', score, reason };
}

/**
 * Graph of Thought (GoT) — for critical complexity with high blast radius
 */
function scoreGoT(input: StrategyInput): StrategyScore {
  const { complexity, risk, blastRadius } = input;
  let score = 0;
  let reason = '';

  if (complexity === 'critical') {
    score = 0.9;
    reason = 'Critical complexity — graph reasoning maps all dependencies';
  } else if (complexity === 'complex' && blastRadius > 50) {
    score = 0.85;
    reason = 'Complex with high blast radius — graph maps impact paths';
  } else if (complexity === 'complex' && risk === 'high') {
    score = 0.7;
    reason = 'Complex + high risk — graph reasoning adds structure';
  } else if (blastRadius > 70) {
    score = 0.6;
    reason = 'Large blast radius — graph helps trace impacts';
  } else if (complexity === 'moderate') {
    score = 0.3;
    reason = 'Moderate complexity — graph reasoning is heavy-handed';
  } else {
    score = 0.1;
    reason = 'Simple task — graph reasoning not warranted';
  }

  return { name: 'Graph of Thought', score, reason };
}

/**
 * Compute all strategy scores and return sorted by score descending
 */
export function computeStrategyScores(input: StrategyInput): StrategyScore[] {
  const scores = [
    scoreDirect(input),
    scoreAdvisor(input),
    scoreSelfRefine(input),
    scoreToT(input),
    scoreDebate(input),
    scoreGoT(input),
  ];

  return scores.sort((a, b) => b.score - a.score);
}
