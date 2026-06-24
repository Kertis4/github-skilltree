import { Link } from 'react-router-dom'
import { site } from '@/config/site'
import { Icon } from '@/components/ui/icons'
import { Button } from '@/components/ui/Button'
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher'

interface NavbarProps {
  onLogin?: () => void
}

/** Sticky top navigation: brand, section anchors, theme switcher, login. */
export function Navbar({ onLogin }: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-term-border bg-term-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          to="/"
          className="group flex items-center gap-2 font-display text-2xl leading-none text-accent glow-text"
        >
          <span aria-hidden>◣</span>
          <span className="tracking-wide">{site.brand}</span>
          <span aria-hidden className="animate-blink">
            _
          </span>
        </Link>
        <span className="hidden rounded border border-term-border px-1.5 py-0.5 text-[10px] text-term-dim sm:inline">
          {site.version}
        </span>

        <nav className="ml-6 hidden items-center gap-6 text-sm text-term-muted md:flex">
          {site.nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="group flex items-center gap-1 transition-colors hover:text-accent"
            >
              <span className="text-accent opacity-0 transition-opacity group-hover:opacity-100">
                /
              </span>
              {item.label}
            </a>
          ))}
          <Link
            to="/skills-viz"
            className="group flex items-center gap-1 transition-colors hover:text-accent"
            title="Interactive skill tree visualization"
          >
            <span className="text-accent opacity-0 transition-opacity group-hover:opacity-100">
              /
            </span>
            tree
          </Link>
          <Link
            to="/radar-viz"
            className="group flex items-center gap-1 transition-colors hover:text-accent"
            title="Skill proficiency radar chart"
          >
            <span className="text-accent opacity-0 transition-opacity group-hover:opacity-100">
              /
            </span>
            radar
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ThemeSwitcher />
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
            className="text-term-muted transition-colors hover:text-accent"
          >
            <Icon name="github" className="text-lg" />
          </a>
          <div className="hidden gap-2 sm:flex">
            <Link to="/skills-viz">
              <Button variant="outline" className="text-xs">
                <Icon name="tree" /> tree
              </Button>
            </Link>
            <Link to="/radar-viz">
              <Button variant="outline" className="text-xs">
                <Icon name="radar" /> radar
              </Button>
            </Link>
            <Button variant="outline" onClick={onLogin}>
              <Icon name="terminal" /> login
            </Button>
          </div>
          <div className="flex sm:hidden">
            <Button variant="outline" onClick={onLogin}>
              <Icon name="terminal" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
