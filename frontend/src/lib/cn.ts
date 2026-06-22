/**
 * Tiny className joiner — keeps conditional classes readable without pulling in
 * a dependency. Falsy values are dropped.
 *
 *   cn('a', cond && 'b', undefined) // => "a b" (when cond is true)
 */
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(' ')
}
