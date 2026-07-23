/**
 * Ability estimation by EAP (expected a posteriori).
 *
 * WHY EAP AND NOT MAXIMUM LIKELIHOOD. With only 20 items, two response patterns are not merely
 * possible but genuinely common: all correct, and all incorrect. The likelihood function for
 * either is monotonic, so the maximum-likelihood estimate diverges to +/- infinity and there is
 * no finite standard error to report. Bayesian EAP places a standard normal prior over ability
 * and integrates, which always yields a finite estimate together with a posterior standard
 * deviation — exactly the standard error the confidence interval needs. The cost is a known,
 * documented shrinkage of extreme scores towards the mean, which for a screening instrument of
 * this length is the honest behaviour: a 20-item test genuinely cannot justify an extreme claim.
 *
 * The integral is evaluated by fixed quadrature over a grid, which is deterministic, fast, and
 * has no convergence failures.
 */

import type { ItemParameters, ScoredResponse } from "../types";
import { normalPdf, probabilityCorrect } from "./irt";

/** Quadrature grid: 81 nodes across +/- 4 logits, i.e. IQ 40 to 160. */
const GRID_MIN = -4;
const GRID_MAX = 4;
const GRID_NODES = 81;

export interface AbilityEstimate {
  /** Posterior mean ability on the logit scale. */
  theta: number;
  /** Posterior standard deviation — the standard error of measurement. */
  sem: number;
  /**
   * Marginal reliability, 1 - SEM^2 under a unit-variance prior. Reported as a diagnostic of
   * how much the test actually narrowed the prior; near 0 means the responses carried little
   * information.
   */
  reliability: number;
}

interface QuadratureGrid {
  nodes: number[];
  priorWeights: number[];
}

function buildGrid(priorMean: number, priorSd: number): QuadratureGrid {
  const nodes: number[] = [];
  const priorWeights: number[] = [];
  const step = (GRID_MAX - GRID_MIN) / (GRID_NODES - 1);

  for (let i = 0; i < GRID_NODES; i += 1) {
    const theta = GRID_MIN + i * step;
    nodes.push(theta);
    priorWeights.push(normalPdf(theta, priorMean, priorSd));
  }

  return { nodes, priorWeights };
}

const STANDARD_GRID = buildGrid(0, 1);

/**
 * Estimate ability from a set of scored responses.
 *
 * With no responses this returns the prior itself (theta 0, sem 1), which is the correct answer
 * to "what do we know about this person?" — nothing.
 */
export function estimateAbility(
  responses: readonly { parameters: ItemParameters; correct: boolean }[],
  options: { priorMean?: number; priorSd?: number } = {},
): AbilityEstimate {
  const { priorMean = 0, priorSd = 1 } = options;
  const grid =
    priorMean === 0 && priorSd === 1 ? STANDARD_GRID : buildGrid(priorMean, priorSd);

  const { nodes, priorWeights } = grid;

  // Accumulate the log-likelihood rather than the likelihood. With 20 items the raw product
  // underflows to zero for poorly-fitting abilities, which would silently distort the posterior.
  const logLikelihood = nodes.map((theta) => {
    let total = 0;
    for (const response of responses) {
      const p = probabilityCorrect(theta, response.parameters);
      // Clamp away from 0 and 1 so log() stays finite even for extreme parameters.
      const safe = Math.min(1 - 1e-12, Math.max(1e-12, p));
      total += response.correct ? Math.log(safe) : Math.log(1 - safe);
    }
    return total;
  });

  // Subtract the maximum before exponentiating (the log-sum-exp trick) to avoid underflow.
  const maxLog = Math.max(...logLikelihood);

  let sumWeights = 0;
  let sumTheta = 0;
  const posterior: number[] = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const weight = (priorWeights[i] ?? 0) * Math.exp((logLikelihood[i] ?? 0) - maxLog);
    posterior.push(weight);
    sumWeights += weight;
    sumTheta += weight * (nodes[i] ?? 0);
  }

  if (sumWeights === 0 || !Number.isFinite(sumWeights)) {
    // Defensive: cannot occur with a proper prior and clamped probabilities, but returning the
    // prior is the only defensible fallback if it ever did.
    return { theta: priorMean, sem: priorSd, reliability: 0 };
  }

  const theta = sumTheta / sumWeights;

  let variance = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    const diff = (nodes[i] ?? 0) - theta;
    variance += (posterior[i] ?? 0) * diff * diff;
  }
  variance /= sumWeights;

  const sem = Math.sqrt(Math.max(0, variance));
  // Reliability relative to the unit prior variance. Clamped because a posterior wider than the
  // prior (possible with contradictory responses) would otherwise report negative reliability.
  const reliability = Math.min(1, Math.max(0, 1 - variance / (priorSd * priorSd)));

  return { theta, sem, reliability };
}

/** Convenience wrapper for the full `ScoredResponse` shape used by the scoring service. */
export function estimateAbilityFromResponses(responses: readonly ScoredResponse[]): AbilityEstimate {
  return estimateAbility(
    responses.map((r) => ({ parameters: r.parameters, correct: r.correct })),
  );
}
