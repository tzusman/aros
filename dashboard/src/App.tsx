import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "@/context/app-context";
import { ReviewPage } from "@/pages/review-page";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/review" replace />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/reviews/:id" element={<ReviewPage />} />
        </Routes>
        <Toaster />
      </AppProvider>
    </BrowserRouter>
  );
}
