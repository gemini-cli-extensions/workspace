export function enforceTokenLimit(text: string, limit: number, contextName: string = "Context"): void {
  // Approximate 1 token = 4 characters.
  const estimatedTokens = Math.ceil(text.length / 4);
  if (estimatedTokens > limit) {
    console.warn(`[token-estimator] ${contextName} exceeds token limit (${estimatedTokens} > ${limit})`);
  }
}
