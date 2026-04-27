import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import LoginSignupPage from "./pages/LoginSignupPage";
import Index from "./pages/Index";
import RoomPage from "./pages/RoomPage";
import FriendsPage from "./pages/FriendsPage";
import RoomsPage from "./pages/RoomsPage";
import { checkAPIStatus } from "./services/api";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { isDesktop } from "./utils/platform";
import SettingsPage from "./pages/SettingsPage";
import Loader from "./components/Loader";
import { RoomVoiceProvider } from "./context/RoomVoiceContext";
import ChatPage from "./pages/ChatPage";

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    console.log(isDesktop() ? "I am desktop" : "I am browser");

    const checkAPI = async () => {
      const isAvailable = await checkAPIStatus();
      setApiAvailable(isAvailable);

      if (!isAvailable) {
        console.warn("API is unavailable. Retrying...");
      }
    };

    checkAPI();

    const interval = setInterval(() => {
      checkAPI();
    }, apiAvailable ? 60000 : 10000);

    return () => clearInterval(interval);
  }, []);

  if (apiAvailable === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--pc-bg)] px-4 text-[var(--pc-text)]">
        <div className="w-full max-w-xl border-2 border-[var(--pc-border)] bg-[var(--pc-panel)] p-8 text-center">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pc-text-muted)]">
            Power-Call // Bootstrap
          </div>
          <h1 className="mt-4 text-2xl font-semibold">Checking API status</h1>
          <p className="mt-2 text-sm text-[var(--pc-text-muted)]">
            Please wait while the client verifies backend availability.
          </p>
          <Loader />
        </div>
      </div>
    );
  }

  if (apiAvailable === false) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--pc-bg)] px-4 text-[var(--pc-text)]">
        <div className="w-full max-w-2xl border-2 border-[var(--pc-border)] bg-[var(--pc-panel)] p-8 text-center">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pc-text-muted)]">
            Power-Call // Link Lost
          </div>
          <h1 className="mt-4 text-3xl font-semibold">Server Unavailable</h1>
          <p className="mt-3 text-lg">The client cannot connect to the backend server.</p>
          <p className="mt-2 text-sm text-[var(--pc-text-muted)]">
            Please check whether the API is running. The system will retry automatically.
          </p>
          <div className="mt-6 inline-flex border-2 border-[var(--pc-border)] px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-muted)]">
            Awaiting backend signal
          </div>
          <Loader />
        </div>
      </div>
    );
  }

  return (
    <Router>
      <AuthProvider>
        <RoomVoiceProvider>
          <Routes>
            <Route path="/login" element={<LoginSignupPage />} />
            {/* Protected routes inside common Layout */}
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/home" element={<Index />} />
              <Route path="/friends" element={<FriendsPage />} />
              <Route path="/rooms" element={<RoomsPage />} />
              <Route path="/room/:roomID" element={<RoomPage />} />
              <Route path="/chat/:friendId" element={<ChatPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/" element={<Navigate to="/home" />} />
            </Route>
          </Routes>
        </RoomVoiceProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
