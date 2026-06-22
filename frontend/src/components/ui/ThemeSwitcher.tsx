import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { THEMES, type ThemeName } from '@/config/site'

const STORAGE_KEY = 'skilltree.theme'

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme
}

/**
 * Accent-color switcher. Each swatch previews its own theme color (it sets its
 * own `data-theme`), and the choice is persisted to localStorage.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeName>('green')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeName | null
    const initial =
      saved ?? (document.documentElement.dataset.theme as ThemeName | undefined) ?? 'green'
    setTheme(initial)
    applyTheme(initial)
  }, [])

  const select = (next: ThemeName) => {
    setTheme(next)
    applyTheme(next)
    localStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <div
      role="group"
      aria-label="Accent theme"
      className={cn('flex items-center gap-1.5', className)}
    >
      {THEMES.map((t) => (
        <button
          key={t.name}
          type="button"
          data-theme={t.name}
          onClick={() => select(t.name)}
          title={t.label}
          aria-label={`${t.label} theme`}
          aria-pressed={theme === t.name}
          className={cn(
            'size-3.5 rounded-full border border-term-border bg-accent transition-transform hover:scale-110',
            theme === t.name
              ? 'scale-110 ring-2 ring-accent ring-offset-2 ring-offset-term-bg'
              : 'opacity-60',
          )}
        />
      ))}
    </div>
  )
}
