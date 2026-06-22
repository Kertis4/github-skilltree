import { site } from '@/config/site'
import { Icon } from '@/components/ui/icons'

/** Vim/tmux-style status line plus a small site footer. */
export function Footer() {
  return (
    <footer className="mt-8 border-t border-term-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-term-dim sm:flex-row sm:px-6">
        <p>
          © {new Date().getFullYear()} {site.name} — hackathon build. demo-grade, not production
          auth.
        </p>
        <div className="flex items-center gap-4">
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-accent"
          >
            <Icon name="github" /> source
          </a>
          <span className="text-term-faint">·</span>
          <a href="#top" className="transition-colors hover:text-accent">
            back to top ↑
          </a>
        </div>
      </div>
    </footer>
  )
}
