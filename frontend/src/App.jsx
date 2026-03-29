import { Toaster } from 'react-hot-toast'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import AnalysisPage from './pages/AnalysisPage'
import PortfolioPage from './pages/PortfolioPage'
import useStore from './store/useStore'

export default function App() {
  const { activeTab } = useStore()

  return (
    <div className="app-layout">
      <Header />
      <Sidebar />
      <main style={{ gridArea: 'main', overflowY: 'auto' }}>
        {activeTab === 'analysis'  && <AnalysisPage />}
        {activeTab === 'portfolio' && <PortfolioPage />}
      </main>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            fontSize: 13,
          },
        }}
      />
    </div>
  )
}
