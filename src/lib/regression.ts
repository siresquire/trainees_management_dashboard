/**
 * Pure-math regression library — no DB, no Next.js imports.
 * Called from server components (page.tsx) after features are computed.
 *
 * Feature vector for every trainee:
 *   x = [1,  quizAvgPct/100,  labRatePct/100,  kcRatePct/100]
 *         ^intercept  ^mock exams    ^lab completion  ^KC completion
 *
 * Linear target  : actualScore  (100–1000 AWS scale)
 * Logistic target: passed       (1 = pass, 0 = fail)
 */

// ── Public types ──────────────────────────────────────────────────────────────

export interface TrainingPoint {
  quizAvgPct:  number;   // 0–100  (mock exam average %)
  labRatePct:  number;   // 0–100  (lab completion %)
  kcRatePct:   number;   // 0–100  (KC completion %)
  actualScore: number;   // 100–1000
  passed:      0 | 1;
}

export interface LinearModel {
  coefficients: number[];  // [β0, β1_quiz, β2_lab, β3_kc]
  rSquared:     number;    // 0–1
  n:            number;
}

export interface LogisticModel {
  coefficients: number[];  // same shape
  accuracy:     number;    // 0–1  (fraction correctly classified on training set)
  n:            number;
}

export interface ModelBundle {
  linear:       LinearModel   | null;
  logistic:     LogisticModel | null;
  trainingSize: number;
}

/** Minimum labelled samples before regression replaces the heuristic */
export const MIN_TRAINING_SIZE = 10;

// ── Internal matrix helpers ───────────────────────────────────────────────────

function transpose(A: number[][]): number[][] {
  return A[0].map((_, j) => A.map(row => row[j]));
}

function matMul(A: number[][], B: number[][]): number[][] {
  const rows = A.length, cols = B[0].length, inner = B.length;
  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) =>
      Array.from({ length: inner }, (__, k) => A[i][k] * B[k][j])
        .reduce((s, v) => s + v, 0)
    )
  );
}

/**
 * Solve Ax = b via Gauss-Jordan elimination with partial pivoting.
 * Returns null if A is (near-)singular.
 */
function solveSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) return null;

    const pivot = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }

  return M.map(row => row[n]);
}

// ── Feature builder ───────────────────────────────────────────────────────────

function fv(p: Pick<TrainingPoint, "quizAvgPct" | "labRatePct" | "kcRatePct">): number[] {
  return [1, p.quizAvgPct / 100, p.labRatePct / 100, p.kcRatePct / 100];
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

// ── Linear regression — OLS normal equations with ridge regularisation ────────

export function fitLinear(points: TrainingPoint[]): LinearModel | null {
  if (points.length < MIN_TRAINING_SIZE) return null;

  const X = points.map(p => fv(p));
  const y = points.map(p => p.actualScore);
  const Xt  = transpose(X);
  const XtX = matMul(Xt, X);
  const Xty = Xt.map(row => row.reduce((s, v, i) => s + v * y[i], 0));

  // Ridge: add λ to diagonal (skip intercept term at [0,0])
  const λ = 1e-3;
  for (let i = 1; i < XtX.length; i++) XtX[i][i] += λ;

  const coeffs = solveSystem(XtX, Xty);
  if (!coeffs) return null;

  const predicted = X.map(row => row.reduce((s, v, i) => s + v * coeffs[i], 0));
  const yMean     = y.reduce((a, b) => a + b, 0) / y.length;
  const ssTot     = y.reduce((s, v)    => s + (v - yMean) ** 2,         0);
  const ssRes     = y.reduce((s, v, i) => s + (v - predicted[i]) ** 2,  0);

  return {
    coefficients: coeffs,
    rSquared: ssTot < 1e-10 ? 0 : 1 - ssRes / ssTot,
    n: points.length,
  };
}

// ── Logistic regression — gradient descent with L2 regularisation ─────────────

export function fitLogistic(points: TrainingPoint[]): LogisticModel | null {
  if (points.length < MIN_TRAINING_SIZE) return null;

  const X  = points.map(p => fv(p));
  const y  = points.map(p => p.passed);
  const n  = points.length;
  const k  = 4;
  const β  = new Array(k).fill(0.0);
  const lr = 0.3;
  const λ  = 0.01; // L2 strength

  for (let iter = 0; iter < 4000; iter++) {
    const grad = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const prob = sigmoid(X[i].reduce((s, v, j) => s + v * β[j], 0));
      const err  = prob - y[i];
      for (let j = 0; j < k; j++) grad[j] += (err * X[i][j]) / n;
    }
    // L2 regularisation (skip intercept)
    for (let j = 1; j < k; j++) grad[j] += (λ / n) * β[j];
    for (let j = 0; j < k; j++) β[j] -= lr * grad[j];
  }

  const correct = points.filter((p, i) => {
    const prob = sigmoid(X[i].reduce((s, v, j) => s + v * β[j], 0));
    return (prob >= 0.5 ? 1 : 0) === p.passed;
  }).length;

  return {
    coefficients: β,
    accuracy:     correct / n,
    n:            points.length,
  };
}

// ── Prediction helpers ────────────────────────────────────────────────────────

export function predictLinear(
  model: LinearModel,
  features: Pick<TrainingPoint, "quizAvgPct" | "labRatePct" | "kcRatePct">
): number {
  return fv(features).reduce((s, v, i) => s + v * model.coefficients[i], 0);
}

export function predictLogistic(
  model: LogisticModel,
  features: Pick<TrainingPoint, "quizAvgPct" | "labRatePct" | "kcRatePct">
): number {
  return sigmoid(fv(features).reduce((s, v, i) => s + v * model.coefficients[i], 0));
}

// ── Convenience: fit both models at once ─────────────────────────────────────

export function fitModels(points: TrainingPoint[]): ModelBundle {
  return {
    linear:       fitLinear(points),
    logistic:     fitLogistic(points),
    trainingSize: points.length,
  };
}
