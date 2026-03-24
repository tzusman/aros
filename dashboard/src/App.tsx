import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { AppProvider } from "@/context/app-context";
import { ReviewPage } from "@/pages/review-page";
import { OnboardingModal } from "@/components/shell/onboarding-modal";
import { Toaster } from "@/components/ui/sonner";

function HomeRedirect() {
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();
  return <Navigate to={`/review${search ? `?${search}` : ""}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/reviews/:id" element={<ReviewPage />} />
        </Routes>
        <OnboardingModal />
        <Toaster />
      </AppProvider>
    </BrowserRouter>
  );
}
