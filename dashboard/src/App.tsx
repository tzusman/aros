import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

function ReviewPage() {
  return <div className="p-4">Review Workspace</div>;
}

function PipelinePage() {
  return <div className="p-4">Pipeline Monitor</div>;
}

function PoliciesPage() {
  return <div className="p-4">Policies Manager</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/review" replace />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="/policies" element={<PoliciesPage />} />
      </Routes>
    </BrowserRouter>
  );
}
