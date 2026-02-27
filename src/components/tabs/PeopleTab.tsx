import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { UserPlus, Trash2 } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage } from "../../utils";
import type { TripMember, TripInvite, UserSettings, Trip, ExpenseWithSplits, Settlement, MemberBalance, SimplifiedTransfer } from "../../types";
import { Card } from "../Card";
import { BalancesSummary } from "../BalancesSummary";
import { TripSettlementModal } from "../TripSettlementModal";
import { calculateNetBalances, simplifyDebts } from "../../utils/splitting";

interface PeopleTabProps {
  tripId: string;
  members: TripMember[];
  invites: TripInvite[];
  currentMember: TripMember | null;
  isAdmin: boolean;
  settings: UserSettings;
  spouseByUserId: Map<string, string | null>;
  trip: Trip;
  onSettingsChange: (next: UserSettings) => void;
  onReloadTrip: () => void;
  onTripUpdate?: (updater: (prev: Trip) => Trip) => void;
}

export function PeopleTab({
  tripId,
  members,
  invites,
  currentMember,
  isAdmin,
  settings,
  spouseByUserId,
  trip,
  onSettingsChange,
  onReloadTrip,
  onTripUpdate,
}: PeopleTabProps) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [selfSpouseUserId, setSelfSpouseUserId] = useState(settings.spouse_user_id || "");
  
  // Estados para rateio e saldos
  const [expensesWithSplits, setExpensesWithSplits] = useState<ExpenseWithSplits[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [balances, setBalances] = useState<MemberBalance[]>([]);
  const [showSettlement, setShowSettlement] = useState(false);
  const [transfers, setTransfers] = useState<SimplifiedTransfer[]>([]);

  const memberByUserId = new Map(members.map((m) => [m.user_id, m]));
  
  // Buscar despesas com splits e settlements
  useEffect(() => {
    const fetchBalanceData = async () => {
      // Buscar despesas com splits
      const { data: expensesData } = await supabase
        .from("expenses")
        .select("*, expense_splits(*)")
        .eq("trip_id", tripId)
        .eq("visibility", "public")
        .eq("is_confirmed", true);
      
      // Buscar settlements
      const { data: settlementsData } = await supabase
        .from("settlements")
        .select("*")
        .eq("trip_id", tripId);
      
      if (expensesData) {
        // Transformar para ExpenseWithSplits
        const expensesWithSplitsData: ExpenseWithSplits[] = expensesData.map((exp: any) => ({
          ...exp,
          splits: exp.expense_splits || [],
        }));
        setExpensesWithSplits(expensesWithSplitsData);
      }
      
      if (settlementsData) {
        setSettlements(settlementsData);
      }
    };
    
    fetchBalanceData();
  }, [tripId, trip.expenses]); // Recarregar quando despesas mudarem
  
  // Calcular saldos
  useEffect(() => {
    if (expensesWithSplits.length > 0 || settlements.length > 0) {
      const calculatedBalances = calculateNetBalances(
        expensesWithSplits,
        settlements,
        members
      );
      setBalances(calculatedBalances);
    } else {
      setBalances([]);
    }
  }, [expensesWithSplits, settlements, members]);

  const createInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    const firstTry = await supabase.rpc("create_trip_invite", { p_trip_id: tripId, p_email: email });
    let inviteToken = firstTry.data as string | null;
    let inviteError = firstTry.error;

    if (!inviteToken && inviteError?.code === "PGRST202") {
      const secondTry = await supabase.rpc("create_trip_invite", { trip_id: tripId, email });
      inviteToken = secondTry.data as string | null;
      inviteError = secondTry.error;
    }

    if (!inviteToken || inviteError) {
      if (inviteError?.code === "PGRST202") {
        alert('RPC create_trip_invite não encontrada no Supabase. Execute o schema SQL atualizado (supabase/schema.sql) no projeto remoto.');
        return;
      }
      alert(getErrorMessage(inviteError));
      return;
    }

    const link = `${window.location.origin}/invite/${inviteToken}`;
    setGeneratedLink(link);
    setInviteEmail("");
    await navigator.clipboard.writeText(link);
    onReloadTrip();
    alert("Link copiado.");
  };

  const setGlobalSpouse = async (spouseUserId: string | null) => {
    const { error } = await supabase.rpc("set_global_spouse", {
      p_spouse_user_id: spouseUserId,
    });
    if (error) {
      alert(getErrorMessage(error));
      return;
    }
    onSettingsChange({ ...settings, spouse_user_id: spouseUserId });
    setSelfSpouseUserId(spouseUserId || "");
  };

  const cancelInvite = async (inviteId: string) => {
    const { error } = await supabase.rpc("cancel_trip_invite", {
      p_trip_id: tripId,
      p_invite_id: inviteId,
    });
    if (error) {
      alert(getErrorMessage(error));
      return;
    }
    onReloadTrip();
  };

  return (
    <motion.div key="people" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      {/* Seção de Saldos */}
      {currentMember && (
        <Card>
          <h3 className="font-bold mb-4">Saldos da Viagem</h3>
          <BalancesSummary
            balances={balances}
            currentUserId={currentMember.user_id}
            members={members}
            currency={settings.default_currency}
            onSettleClick={() => {
              const simplified = simplifyDebts(balances, settings.default_currency);
              setTransfers(simplified);
              setShowSettlement(true);
            }}
          />
        </Card>
      )}
      
      {currentMember && (
        <Card>
          <h3 className="font-bold mb-4">Seu cônjuge (global)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              value={selfSpouseUserId}
              onChange={(e) => setSelfSpouseUserId(e.target.value)}
              className="md:col-span-2 px-4 py-2 rounded-xl border border-zinc-200 text-sm"
            >
              <option value="">Sem cônjuge</option>
              {members
                .filter((m) => m.user_id !== currentMember.user_id)
                .map((m) => (
                  <option key={m.id} value={m.user_id}>
                    {m.display_name || m.user_id}
                  </option>
                ))}
            </select>
            <button
              onClick={async () => {
                await setGlobalSpouse(selfSpouseUserId || null);
              }}
              className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-4 py-2 rounded-xl text-sm font-bold"
            >
              Salvar
            </button>
          </div>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <h3 className="font-bold mb-4">Convidar pessoa</h3>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              type="email"
              placeholder="email@exemplo.com"
              className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 text-sm"
            />
            <button
              onClick={createInvite}
              className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 justify-center"
            >
              <UserPlus size={16} />
              Gerar convite
            </button>
          </div>
          {generatedLink && (
            <div className="mt-3 p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-xs break-all">
              {generatedLink}
            </div>
          )}
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-zinc-50">
              <th className="px-4 py-3 uppercase">Pessoa</th>
              <th className="px-4 py-3 uppercase">Papel</th>
              <th className="px-4 py-3 uppercase">Cônjuge</th>
              {isAdmin && <th className="px-4 py-3 uppercase text-right"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {members.map((member) => {
              const spouseUserId = spouseByUserId.get(member.user_id) || null;
              const spouse = spouseUserId ? memberByUserId.get(spouseUserId) : null;
              return (
                <tr key={member.id}>
                  <td className="px-4 py-3">{member.display_name || member.user_id}</td>
                  <td className="px-4 py-3 uppercase">{member.role}</td>
                  <td className="px-4 py-3">{spouse?.display_name || "-"}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      {member.user_id !== currentMember?.user_id && (
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Remover ${member.display_name || member.user_id} da viagem?`)) return;
                            const { error } = await supabase.from("trip_members").delete().eq("id", member.id);
                            if (error) alert(getErrorMessage(error));
                            else onReloadTrip();
                          }}
                          className="text-zinc-400 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {isAdmin && (
        <Card>
          <h3 className="font-bold mb-4">Convites</h3>
          <div className="space-y-2">
            {invites.length === 0 && <p className="text-sm text-zinc-500">Nenhum convite gerado.</p>}
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="p-3 rounded-xl border border-zinc-200 text-sm flex items-center justify-between gap-2"
              >
                <span>{invite.email}</span>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "text-xs font-bold uppercase",
                      invite.accepted_at ? "text-emerald-600" : "text-orange-600"
                    )}
                  >
                    {invite.accepted_at ? "Aceito" : "Pendente"}
                  </span>
                  {!invite.accepted_at && (
                    <button
                      type="button"
                      onClick={() => void cancelInvite(invite.id)}
                      className="text-xs text-red-500"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      
      {/* Modal de Quitação */}
      {showSettlement && (
        <TripSettlementModal
          transfers={transfers}
          currency={settings.default_currency}
          onClose={() => setShowSettlement(false)}
          onMarkComplete={async (fromId, toId) => {
            const transfer = transfers.find(
              t => t.from_member_id === fromId && t.to_member_id === toId
            );
            if (transfer) {
              const { error } = await supabase.from("settlements").insert({
                trip_id: tripId,
                from_member_id: fromId,
                to_member_id: toId,
                amount: transfer.amount,
                currency: settings.default_currency,
                date: new Date().toISOString(),
                is_confirmed: true,
              });
              
              if (error) {
                alert(getErrorMessage(error));
              } else {
                // Recarregar settlements
                const { data: settlementsData } = await supabase
                  .from("settlements")
                  .select("*")
                  .eq("trip_id", tripId);
                if (settlementsData) {
                  setSettlements(settlementsData);
                }
              }
            }
          }}
          onFinalize={async () => {
            const { error } = await supabase
              .from("trip_settlement_status")
              .upsert({
                trip_id: tripId,
                is_settled: true,
                settled_at: new Date().toISOString(),
              });
            
            if (error) {
              alert(getErrorMessage(error));
            } else {
              setShowSettlement(false);
              alert("Viagem quitada com sucesso! 🎉");
              onReloadTrip();
            }
          }}
        />
      )}
    </motion.div>
  );
}
