import { useState } from 'react'
import { cn } from '@/lib/cn'
import { TerminalWindow } from '@/components/terminal/TerminalWindow'
import { Cursor } from '@/components/terminal/Cursor'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/icons'
import { useBootSequence } from '@/hooks/useBootSequence'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { bootLines, type BootTone } from '@/data/bootLines'
import { loginWithGitHub, OAUTH_SCOPES } from '@/lib/auth'

const toneColor: Record<BootTone, string> = {
  ok: 'text-term-green',
  warn: 'text-term-amber',
  info: 'text-term-cyan',
  rdy: 'text-accent',
}

/** Fixed-width status labels keep the boot log columns aligned. */
const toneLabel: Record<BootTone, string> = {
  ok: '  ok  ',
  warn: ' warn ',
  info: ' info ',
  rdy: ' rdy  ',
}

type Status = 'idle' | 'connecting' | 'stub'

interface LoginPanelProps {
  id?: string
  className?: string
}

/**
 * The hero's interactive console. It streams a fake boot log, then reveals the
 * GitHub OAuth call-to-action. Login is wired to `loginWithGitHub`, which falls
 * back to an honest "not configured yet" message during the frontend preview.
 */
export function LoginPanel({ id, className }: LoginPanelProps) {
  const reduced = useReducedMotion()
  const { visible, done } = useBootSequence(bootLines.length, {
    enabled: !reduced,
    interval: 140,
    startDelay: 350,
  })
  const [status, setStatus] = useState<Status>('idle')

  const handleLogin = () => {
    setStatus('connecting')
    const result = loginWithGitHub()
    if (!result.ok) {
      // No client id / backend yet — surface a friendly, accurate message.
      window.setTimeout(() => setStatus('stub'), 950)
    }
  }

  return (
    <div id={id} className={cn('w-full', className)}>
      <TerminalWindow
        title="guest@skilltree: ~"
        glow
        toolbar={
          <>
            <Icon name="shield" className="text-sm text-term-green" />
            <span>ssl</span>
          </>
        }
        bodyClassName="space-y-3"
      >
        {/* boot log */}
        <div className="space-y-0.5 text-xs sm:text-sm">
          {bootLines.slice(0, visible).map((line, i) => (
            <div key={i} className="flex items-start gap-2 animate-rise">
              <span className={cn('shrink-0 select-none whitespace-pre', toneColor[line.tone])}>
                [{toneLabel[line.tone]}]
              </span>
              <span className="text-term-muted">{line.text}</span>
            </div>
          ))}
          {!done && <Cursor />}
        </div>

        {/* auth call to action — revealed once boot completes */}
        {done && (
          <div className="space-y-3 border-t border-term-border pt-3 animate-rise">
            <p className="text-xs text-term-dim sm:text-sm">// authenticate to continue</p>

            <Button
              variant="solid"
              onClick={handleLogin}
              disabled={status === 'connecting'}
              className="w-full justify-center py-2.5 text-sm sm:text-base"
            >
              <Icon name="github" className="text-lg" />
              {status === 'connecting' ? 'establishing session…' : 'Authenticate with GitHub'}
            </Button>

            <div className="min-h-[3.25rem] rounded border border-term-border bg-term-bg/50 p-2.5 text-xs">
              {status === 'idle' && (
                <span className="text-term-dim">
                  scopes: <span className="text-term-muted">{OAUTH_SCOPES.join(' · ')}</span> ·
                  public only
                </span>
              )}
              {status === 'connecting' && (
                <span className="text-term-cyan">
                  › redirecting to github.com/login/oauth/authorize …
                </span>
              )}
              {status === 'stub' && (
                <div className="space-y-1">
                  <p className="text-term-amber">! oauth endpoint not wired (frontend preview)</p>
                  <p className="text-term-dim">
                    set <span className="text-accent">VITE_GITHUB_CLIENT_ID</span> &amp; backend{' '}
                    <span className="text-accent">/auth/github</span> to go live.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </TerminalWindow>
    </div>
  )
}
