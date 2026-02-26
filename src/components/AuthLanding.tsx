import { useState } from "react";
import { Card } from "./Card";
import { getErrorMessage } from "../utils";
import { supabase } from "../supabase";
import { MapPin } from "lucide-react";

export function AuthLanding() {
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle(redirectTo?: string) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo || window.location.href }
    });
    if (error) throw error;
  }

  return (
    <div className="min-h-screen bg-[#F5F3FF] flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center space-y-6 p-8">
        <div className="flex justify-center">
          <div className="bg-[#7C3AED] p-4 rounded-2xl shadow-lg shadow-purple-200">
            <MapPin className="w-12 h-12 text-white" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-zinc-900">Partiu!</h1>
          <p className="text-zinc-500">Entre com sua conta do Google para planejar viagens em grupo.</p>
        </div>
        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await signInWithGoogle(window.location.origin);
            } catch (error) {
              alert(getErrorMessage(error));
            } finally {
              setLoading(false);
            }
          }}
          className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white py-4 rounded-xl font-semibold transition-colors shadow-md shadow-purple-100"
        >
          {loading ? "Redirecionando..." : "Entrar com Google"}
        </button>
      </Card>
    </div>
  );
}
