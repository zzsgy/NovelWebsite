import { createRoot } from 'react-dom/client'
import './styles.css'
import { hydrate } from './store'
import { cloudEnabled } from './cloud'
import { startCloud } from './cloudStore'
import App from './App'
import CloudGate from './components/CloudGate'

const root = createRoot(document.getElementById('root')!)

function renderApp() {
  root.render(<App />)
}

async function boot() {
  if (cloudEnabled) {
    // 发布域名下：先检查登录态，未登录先走登录门
    const st = await startCloud()
    if (st === 'no-session') {
      root.render(
        <CloudGate
          onReady={() => {
            void (async () => {
              await startCloud()
              await hydrate()
              renderApp()
            })()
          }}
        />
      )
      return
    }
  }
  await hydrate()
  renderApp()
}

void boot()
