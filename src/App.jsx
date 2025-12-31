import { Routes, Route } from "react-router-dom";
import GamePage from "./pages/GamePage";
import EditorGame from "./pages/EditorGame";

export default function App() {
  return (
    <Routes>
      <Route path="/editor" element={<EditorGame />} />
      <Route path="/game" element={<GamePage />} />
    </Routes>
  );
}
