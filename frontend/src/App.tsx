import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/useAuth'
import { HomeShelf } from './pages/HomeShelf'
import { LoginPage } from './pages/LoginPage'
import { ReaderView } from './pages/ReaderView'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth()
  const location = useLocation()

  if (initializing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        <p className="mt-3 text-xs">正在验证登录状态...</p>
      </div>
    )
  }

  if (!user) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to="/login" state={{ from }} replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomeShelf />
              </ProtectedRoute>
            }
          />
          <Route
            path="/read/:bookId"
            element={
              <ProtectedRoute>
                <ReaderView />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
