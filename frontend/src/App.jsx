import { Component } from 'react'
import { Toaster } from 'react-hot-toast'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import AnalysisPage from './pages/AnalysisPage'
import PortfolioPage from './pages/PortfolioPage'
import ModelMonitorPage from './pages/ModelMonitorPage'
import DiscoverPage from './pages/DiscoverPage'
import useStore from './store/useStore'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '60vh', gap: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24,
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Something went wrong</div>
          <div style={{ fontSize: 12, maxWidth: 400, lineHeight: 1.6, fontFamily: 'monospace', color: 'var(--sell)' }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => { this.setState({ error: null }); localStorage.clear() }}
            style={{
              marginTop: 8, padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: 'var(--primary)', border: 'none', color: '#fff', cursor: 'pointer',
            }}
          >
            Clear data &amp; reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const { activeTab } = useStore()

  return (
    <div className="app-layout">
      <Header />
      <Sidebar />
      <main style={{ gridArea: 'main', overflowY: 'auto' }}>
        <ErrorBoundary key={activeTab}>
          {activeTab === 'analysis'  && <AnalysisPage />}
          {activeTab === 'portfolio' && <PortfolioPage />}
          {activeTab === 'models'    && <ModelMonitorPage />}
          {activeTab === 'discover'  && <DiscoverPage />}
        </ErrorBoundary>
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
