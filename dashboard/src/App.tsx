import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/shell/layout";
import { AppProvider, useApp } from "@/context/app-context";
import { ReviewPage } from "@/pages/review-page";
import { Toaster } from "@/components/ui/sonner";

function PipelinePage() {
  return <div className="p-4 text-text-primary">Pipeline Monitor</div>;
}

function PoliciesPage() {
  return <div className="p-4 text-text-primary">Policies Manager</div>;
}

function AppRoutes() {
  const { state } = useApp();
  return (
    <Routes>
      <Route element={<Layout connectionStatus={state.connectionStatus} />}>
        <Route path="/" element={<Navigate to="/review" replace />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="/policies" element={<PoliciesPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
        <Toaster />
      </AppProvider>
    </BrowserRouter>
  );
}
