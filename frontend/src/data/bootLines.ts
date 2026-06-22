export type BootTone = 'ok' | 'warn' | 'info' | 'rdy'

export interface BootLine {
  tone: BootTone
  text: string
}

/** Boot log streamed in the login console — every line states something the tool does. */
export const bootLines: BootLine[] = [
  { tone: 'ok', text: 'reads your public repos — no source is uploaded' },
  { tone: 'ok', text: 'detects skills from files, dependencies & config' },
  { tone: 'ok', text: 'scores XP on a transparent, explainable rubric' },
  { tone: 'info', text: 'maps languages, paradigms, tooling & quality' },
  { tone: 'rdy', text: 'connect github to build your profile' },
]
