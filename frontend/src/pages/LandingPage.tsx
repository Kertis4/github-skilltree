import { MatrixRain } from '@/components/effects/MatrixRain'
import { Scanlines } from '@/components/effects/Scanlines'
import { Navbar } from '@/components/landing/Navbar'
import { Hero } from '@/components/landing/Hero'
import { SkillTreeSection } from '@/components/landing/SkillTreeSection'
import { AboutStrip } from '@/components/landing/AboutStrip'
import { FeatureGrid } from '@/components/landing/FeatureGrid'
import { Footer } from '@/components/landing/Footer'

/**
 * The single landing route. Layers (back to front):
 *   1. matrix rain canvas   — atmosphere
 *   2. page content         — nav / hero / sections / footer
 *   3. CRT scanline overlay  — non-interactive, sits on top
 */
export function LandingPage({ onStartLogin }: { onStartLogin?: () => boolean }) {
  const scrollToLogin = () =>
    document.getElementById('login')?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  return (
    <div className="relative min-h-svh overflow-x-hidden">
      {/* 1 — ambient digital rain */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-[1] opacity-[0.08]">
        <MatrixRain />
      </div>

      {/* 3 — CRT overlay (rendered here, fixed + above content via its own z-index) */}
      <Scanlines />

      {/* 2 — content */}
      <div className="relative z-10">
        <Navbar onLogin={scrollToLogin} />
        <main>
          <Hero onPressStart={scrollToLogin} onStartLogin={onStartLogin} />
          <SkillTreeSection />
          <AboutStrip />
          <FeatureGrid />
        </main>
        <Footer />
      </div>
    </div>
  )
}
