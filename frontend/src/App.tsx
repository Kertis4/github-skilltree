import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LandingPage } from '@/pages/LandingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { useGitHubAuth } from '@/hooks/useGitHubAuth'
import { SkillTreeDemoPage } from '@/pages/SkillTreeDemoPage'
import { SkillRadarDemoPage } from '@/pages/SkillRadarDemoPage'

export default function App() {
  const auth = useGitHubAuth()

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            auth.view === 'dashboard' ? (
              <DashboardPage auth={auth} />
            ) : (
              <LandingPage onStartLogin={auth.start} />
            )
          }
        />
        <Route path="/skills-viz" element={<SkillTreeDemoPage />} />
        <Route path="/radar-viz" element={<SkillRadarDemoPage />} />
      </Routes>
    </BrowserRouter>
  )
}
