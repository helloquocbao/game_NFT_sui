import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@mysten/dapp-kit/dist/index.css'
import './index.css'
import App from './App.jsx'
import { SuiProviders } from './providers/SuiProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SuiProviders>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SuiProviders>
  </StrictMode>,
)
