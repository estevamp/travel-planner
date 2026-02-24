import { useState } from "react";
import { Card } from "./Card";
import { getErrorMessage } from "../utils";
import { supabase } from "../supabase";

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
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center space-y-4">
        <h1 className="text-3xl font-bold">Viajando</h1>
        <p className="text-zinc-500">Entre com sua conta do Google para planejar viagens em grupo.</p>
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
          className="w-full bg-black text-white py-3 rounded-xl font-semibold"
        >
          {loading ? "Redirecionando..." : "Entrar com Google"}
        </button>
      </Card>
    </div>
  );
}
