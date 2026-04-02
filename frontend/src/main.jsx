import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { FeedbackProvider } from './components/ui/FeedbackProvider.jsx'
import { TooltipProvider } from './components/ui/tooltip.jsx'
import { Toaster } from './components/ui/sonner.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TooltipProvider>
      <FeedbackProvider>
        <App />
        <Toaster position="top-center" richColors />
      </FeedbackProvider>
    </TooltipProvider>
  </StrictMode>,
)
