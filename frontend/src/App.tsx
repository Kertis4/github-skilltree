import { LandingPage } from '@/pages/LandingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { useGitHubAuth } from '@/hooks/useGitHubAuth'

export default function App() {
  const auth = useGitHubAuth()

  if (auth.view === 'dashboard') {
    return <DashboardPage auth={auth} />
  }
  return <LandingPage onStartLogin={auth.start} />
}
