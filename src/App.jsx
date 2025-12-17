import { Routes, Route } from "react-router-dom";
import GamePage from "./pages/GamePage";

export default function App() {
  return (
    <Routes>
      <Route path="/game" element={<GamePage />} />
    </Routes>
  );
}
