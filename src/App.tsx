import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { isOnboarded } from './lib/wishlist'
import { Home } from './pages/Home'
import { Matches } from './pages/Matches'
import { Scan } from './pages/Scan'
import { Welcome } from './pages/Welcome'
import './App.css'

function WelcomeGate() {
  if (isOnboarded()) return <Navigate to="/home" replace />
  return <Welcome />
}

function RequireOnboard({ children }: { children: ReactNode }) {
  if (!isOnboarded()) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<WelcomeGate />} />
        <Route
          path="/home"
          element={
            <RequireOnboard>
              <Home />
            </RequireOnboard>
          }
        />
        <Route
          path="/scan"
          element={
            <RequireOnboard>
              <Scan />
            </RequireOnboard>
          }
        />
        <Route
          path="/matches/:barcode"
          element={
            <RequireOnboard>
              <Matches />
            </RequireOnboard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
