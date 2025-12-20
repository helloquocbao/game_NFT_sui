import { Routes, Route } from "react-router-dom";
import GamePage from "./pages/GamePage";
import EditorGame from "./pages/EditorGame";
import StartGame from "./pages/StartGame";

export default function App() {
  return (
    <Routes>
      <Route path="/editor" element={<EditorGame />} />
      <Route path="/game" element={<GamePage />} />
      <Route path="/start" element={<StartGame />} />
    </Routes>
  );
}
