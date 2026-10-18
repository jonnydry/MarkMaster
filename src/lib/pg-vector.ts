/** Bound parameter for `::vector`. Rejects non-finite values before they reach SQL. */
export function toPgVectorLiteral(values: readonly number[], dims: number): string {
  if (values.length !== dims) {
    throw new Error(`Expected a ${dims}-dimensional embedding, received ${values.length}`);
  }

  const parts: string[] = [];
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error("Embedding contains a non-finite number");
    }
    parts.push(String(value));
  }

  return `[${parts.join(",")}]`;
}
