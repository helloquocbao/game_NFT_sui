import { Routes, Route } from 'react-router-dom'
import './App.css'
import Home from './pages/Home'
import Editor from './pages/Editor'
import Play from './pages/Play'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/editor" element={<Editor />} />
      <Route path="/editor/:id" element={<Editor />} />
      <Route path="/play/:id" element={<Play />} />
    </Routes>
  )
}

export default App
