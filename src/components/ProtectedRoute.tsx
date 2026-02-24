import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

export function ProtectedRoute({ session, children }: { session: Session | null; children: React.ReactElement }) {
  if (!session) return <Navigate to="/" replace />;
  return children;
}
