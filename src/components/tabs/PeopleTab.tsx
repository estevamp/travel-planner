import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { UserPlus, Trash2 } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage } from "../../utils";
import type { Trip, ExpenseWithSplits, Settlement, MemberBalance, SimplifiedTransfer } from "../../types";
import type { ExpenseSplit } from '../../types/splitting';
import { Card } from "../Card";

// Tipo da resposta bruta do Supabase para a query "*, expense_splits(*)"
// O Supabase retorna o join sob o nome da tabela (expense_splits),
// enquanto ExpenseWithSplits usa a chave "splits".
type ExpenseRowFromSupabase = Omit<ExpenseWithSplits, 'splits'> & {
  expense_splits: ExpenseSplit[];
};
import { BalancesSummary } from "../BalancesSummary";
import { TripSettlementModal } from "../TripSettlementModal";
import { calculateNetBalances, simplifyDebts } from "../../utils/splitting";
import { useCurrencyConversion } from "../../hooks/useCurrencyConversion";

interface PeopleTabProps {
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
}

export function PeopleTab({ onTripUpdate }: PeopleTabProps) {
  const {
    trip, tripId, members, invites, currentMember, isAdmin,
    settings, onSettingsChange, spouseByUserId, reloadTrip,
  } = useTripContext();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [inviteEmail, setInviteEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [selfSpouseUserId, setSelfSpouseUserId] = useState(settings.spouse_user_id || "");
  
  // Estados para rateio e saldos
  const [expensesWithSplits, setExpensesWithSplits] = useState<ExpenseWithSplits[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [balances, setBalances] = useState<MemberBalance[]>([]);
  const [showSettlement, setShowSettlement] = useState(false);
  const [transfers, setTransfers] = useState<SimplifiedTransfer[]>([]);
  const { rates: exchangeRates } = useCurrencyConversion(settings.default_currency);

  const memberByUserId = new Map(members.map((m) => [m.user_id, m]));
  
  // Buscar despesas com splits e settlements
  const fetchBalanceData = React.useCallback(async () => {
    // Buscar TODAS as despesas confirmadas (públicas e privadas)
    // A filtragem de privadas será feita na função calculateNetBalances
    const { data: expensesData, error: expError } = await supabase
      .from("expenses")
      .select("*, expense_splits(*)")
      .eq("trip_id", tripId)
      .eq("is_confirmed", true);
    
    // Buscar settlements
    const { data: settlementsData, error: settlementsError } = await supabase
      .from("settlements")
      .select("*")
      .eq("trip_id", tripId);
    
    if (!expError) {
      // Transformar para ExpenseWithSplits
      const expensesWithSplitsData: ExpenseWithSplits[] = (
        (expensesData as ExpenseRowFromSupabase[]) || []
      ).map((exp) => ({
        ...exp,
        splits: exp.expense_splits || [],
      }));
      setExpensesWithSplits(expensesWithSplitsData);
    }
    
    if (!settlementsError) {
      setSettlements(settlementsData || []);
    }
  }, [tripId]);

  useEffect(() => {
    fetchBalanceData();

    const expensesChannel = supabase
      .channel('expenses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `trip_id=eq.${tripId}` }, () => {
        fetchBalanceData();
      })
      .subscribe();

    const expenseSplitsChannel = supabase
      .channel('expense-splits-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_splits' }, () => {
        fetchBalanceData();
      })
      .subscribe();

    const settlementsChannel = supabase
      .channel('settlements-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: `trip_id=eq.${tripId}` }, () => {
        fetchBalanceData();
      })
      .subscribe();

    return () => {
      if (expensesChannel) void supabase.removeChannel(expensesChannel);
      if (expenseSplitsChannel) void supabase.removeChannel(expenseSplitsChannel);
      if (settlementsChannel) void supabase.removeChannel(settlementsChannel);
    };
  }, [fetchBalanceData, tripId]);
  
  // Calcular saldos com conversão de moedas
  useEffect(() => {
    // Sempre recalcular os saldos, mesmo quando não há despesas
    const calculatedBalances = calculateNetBalances(
      expensesWithSplits,
      settlements,
      members,
      settings.default_currency,
      exchangeRates
    );
    setBalances(calculatedBalances);
  }, [expensesWithSplits, settlements, members, settings.default_currency, exchangeRates]);

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
        toast('RPC create_trip_invite não encontrada no Supabase. Execute o schema SQL atualizado (supabase/schema.sql) no projeto remoto.', 'error');
        return;
      }
      toast(getErrorMessage(inviteError), 'error');
      return;
    }

    const link = `${window.location.origin}/invite/${inviteToken}`;
    setGeneratedLink(link);
    setInviteEmail("");
    await navigator.clipboard.writeText(link);
    reloadTrip();
    toast("Link copiado!", 'success');
  };

  const setGlobalSpouse = async (spouseUserId: string | null) => {
    const { error } = await supabase.rpc("set_global_spouse", {
      p_spouse_user_id: spouseUserId,
    });
    if (error) {
      toast(getErrorMessage(error), 'error');
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
      toast(getErrorMessage(error), 'error');
      return;
    }
    reloadTrip();
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
              isDark={Boolean(settings.dark_mode)}             // <<< add isto
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
              className={cn(
                "md:col-span-2 px-4 py-2 rounded-xl border text-sm",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
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
              className={cn(
                "flex-1 px-4 py-2 rounded-xl border text-sm",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
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
            <div className={cn(
              "mt-3 p-3 rounded-xl border text-xs break-all",
              settings.dark_mode ? "bg-zinc-800 border-zinc-700" : "bg-zinc-50 border-zinc-200"
            )}>
              {generatedLink}
            </div>
          )}
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[var(--sidebar-hover)]">
              <th className="px-4 py-3 uppercase">Pessoa</th>
              <th className="px-4 py-3 uppercase">Papel</th>
              <th className="px-4 py-3 uppercase">Cônjuge</th>
              {isAdmin && <th className="px-4 py-3 uppercase text-right"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--sidebar-border)]">
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
                            const confirmed = await confirm({
                              title: 'Remover pessoa?',
                              message: `Remover ${member.display_name || member.user_id} da viagem?`,
                              variant: 'danger',
                              isDark: settings.dark_mode
                            });
                            if (!confirmed) return;
                            const { error } = await supabase.from("trip_members").delete().eq("id", member.id);
                            if (error) toast(getErrorMessage(error), 'error');
                            else reloadTrip();
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
                className="p-3 rounded-xl border border-[var(--sidebar-border)] text-sm flex items-center justify-between gap-2"
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
          isDark={settings.dark_mode}
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
                toast(getErrorMessage(error), 'error');
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
              toast(getErrorMessage(error), 'error');
            } else {
              setShowSettlement(false);
              toast("Viagem quitada com sucesso! 🎉", 'success');
              reloadTrip();
            }
          }}
        />
      )}
      {ConfirmDialogNode}
    </motion.div>
  );
}
