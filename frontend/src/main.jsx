import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { FeedbackProvider } from './components/ui/FeedbackProvider.jsx'
import { TooltipProvider } from './components/ui/tooltip.jsx'
import { Toaster } from './components/ui/sonner.jsx'
import { AiStatusProvider, AiStatusBar } from './components/AiStatusProvider.jsx'
import { AuthProvider } from './components/AuthProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TooltipProvider>
      <FeedbackProvider>
        <AuthProvider>
          <AiStatusProvider>
            <App />
            <AiStatusBar />
            <Toaster position="top-center" richColors />
          </AiStatusProvider>
        </AuthProvider>
      </FeedbackProvider>
    </TooltipProvider>
  </StrictMode>,
)
