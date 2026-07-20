import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";             
import AppRouter from "./routes/AppRouter";
import { useAuthStore } from "./store/authStore";
import { queryClient } from "./lib/queryClient";
import ErrorBoundary from "./components/ErrorBoundary";

function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, []);   // runs once

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>                     {/* ✅ Wrap with Error Boundary */}
        <AppRouter />
      </ErrorBoundary>
      <Toaster position="top-right" />    {/* ✅ Toast notifications container */}
    </QueryClientProvider>
  );
}



export default App;