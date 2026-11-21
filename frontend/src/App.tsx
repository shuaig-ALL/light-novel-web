import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomeShelf } from './pages/HomeShelf'
import { ReaderView } from './pages/ReaderView'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeShelf />} />
        <Route path="/read/:bookId" element={<ReaderView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
