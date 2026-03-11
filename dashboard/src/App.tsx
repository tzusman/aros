import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/shell/layout";

function ReviewPage() {
  return <div className="p-4 text-text-primary">Review Workspace</div>;
}

function PipelinePage() {
  return <div className="p-4 text-text-primary">Pipeline Monitor</div>;
}

function PoliciesPage() {
  return <div className="p-4 text-text-primary">Policies Manager</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={<Layout connectionStatus="connected" />}
        >
          <Route path="/" element={<Navigate to="/review" replace />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/policies" element={<PoliciesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
