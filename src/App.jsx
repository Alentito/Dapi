import { Routes, Route } from "react-router-dom";
import "./App.css";
import PhysicsBlocksSection from "./PhysicsBlocksSection.jsx";
import DroneWorkspace from "./pages/DroneWorkspace.jsx";
import LlmChatPage from "./LlmChatPage.jsx";

function App() {
  return (
    <Routes>
      <Route path="/" element={<PhysicsBlocksSection />} />
      <Route path="/drone" element={<DroneWorkspace />} />
      <Route path="/copilot" element={<LlmChatPage />} />
    </Routes>
  );
}

export default App;