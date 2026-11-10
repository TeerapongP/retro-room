/** Self rating (F28, D145): one score per member per board, 1 to 5 in steps of 0.5. */
export const RATING_VALUES: readonly number[] = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

export type Rating = { uid: string; score: number };

export function isValidRating(score: unknown): score is number {
  return typeof score === "number" && RATING_VALUES.includes(score);
}

/** Average of all scores rounded to 2 decimals, or null when nobody has rated yet. */
export function averageRating(ratings: ReadonlyArray<Rating>): number | null {
  if (ratings.length === 0) return null;
  const total = ratings.reduce((sum, rating) => sum + rating.score, 0);
  return Math.round((total / ratings.length) * 100) / 100;
}

export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
