import React, { useState } from "react";
import { motion } from "motion/react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { UserPlus, Trash2, Crown, Copy, Pencil, Check, X } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, copyToClipboard } from "../../utils";
import type { Trip } from "../../types";
import { Card } from "../Card";

interface PeopleTabProps {
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
}

export function PeopleTab({ onTripUpdate }: PeopleTabProps) {
  const {
    tripId, members, invites, currentMember, isAdmin,
    settings, onSettingsChange, spouseByUserId, reloadTrip,
    reloadMembers,
  } = useTripContext();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [inviteEmail, setInviteEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [selfSpouseUserId, setSelfSpouseUserId] = useState(settings.spouse_user_id || "");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");
  
  const memberByUserId = new Map(members.map((m) => [m.user_id, m]));
  
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
    
    // Small delay to ensure state update doesn't interfere with clipboard access in some browsers
    setTimeout(async () => {
      const success = await copyToClipboard(link);
      if (success) {
        toast("Link copiado!", 'success');
      } else {
        toast("Falha ao copiar link automaticamente", 'error');
      }
    }, 100);

    reloadTrip();
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
    await reloadTrip();
    toast("Cônjuge salvo!", 'success');
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

  const handleSaveName = async (member: any) => {
    const trimmedName = nameValue.trim();
    if (!trimmedName) {
      toast("O apelido não pode ficar em branco", "error");
      return;
    }

    if (trimmedName.length > 50) {
      toast("O apelido deve ter no máximo 50 caracteres", "error");
      return;
    }

    const { error } = await supabase.rpc("update_member_display_name", {
      p_trip_id: tripId,
      p_display_name: trimmedName,
      p_target_user_id: member.user_id,
    });

    if (error) {
      toast(getErrorMessage(error), "error");
      return;
    }

    setEditingMemberId(null);
    if (reloadMembers) {
      await reloadMembers();
    } else {
      await reloadTrip();
    }
    toast("Apelido atualizado!", "success");
  };

  return (
    <motion.div key="people" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[var(--sidebar-hover)]">
              <th className="px-4 py-3 uppercase">Pessoa</th>
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
                  <td className="px-4 py-3">
                    {editingMemberId === member.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={nameValue}
                          onChange={(e) => setNameValue(e.target.value)}
                          className={cn(
                            "px-2 py-1 rounded-lg border text-xs w-32",
                            settings.dark_mode
                              ? "bg-zinc-800 border-zinc-700 text-white"
                              : "bg-white border-zinc-200"
                          )}
                        />
                        <button
                          onClick={() => handleSaveName(member)}
                          className="text-emerald-500 hover:text-emerald-600"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingMemberId(null);
                            setNameValue("");
                          }}
                          className="text-zinc-400 hover:text-zinc-600"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {member.display_name || member.user_id}
                        {member.role === "admin" && (
                          <Crown
                            size={14}
                            className="text-amber-400 opacity-80"
                            title="Administrador da viagem"
                          />
                        )}
                        {(member.id === currentMember?.id || isAdmin) && (
                          <button
                            onClick={() => {
                              setNameValue(member.display_name || "");
                              setEditingMemberId(member.id);
                            }}
                            className="text-zinc-400 hover:text-zinc-600"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{spouse?.display_name || "-"}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      {member.user_id !== currentMember?.user_id && (
                        <button
                          onClick={async () => {
                            const confirmed = await confirm({
                              title: 'Remover amigo?',
                              message: `Remover ${member.display_name || member.user_id} da viagem?`,
                              variant: 'danger',
                              isDark: settings.dark_mode
                            });
                            if (!confirmed) return;
                            const { error: memberError } = await supabase.from("trip_members").delete().eq("id", member.id);
                            
                            if (memberError) {
                              toast(getErrorMessage(memberError), 'error');
                            } else {
                              await supabase
                                .from("trip_invites")
                                .delete()
                                .eq("trip_id", tripId)
                                .eq("accepted_by_user_id", member.user_id);
                                
                              reloadTrip();
                            }
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

      {currentMember && (
        <Card>
          <h3 className="font-bold mb-4">Seu cônjuge (global)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              value={selfSpouseUserId}
              onChange={(e) => setSelfSpouseUserId(e.target.value)}
              className={cn(
                "md:col-span-2 px-4 py-2 rounded-xl border text-sm",
                settings.dark_mode ?
                "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
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
          <h3 className="font-bold mb-4">Convidar um amigo</h3>
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
              "mt-3 p-3 rounded-xl border text-xs break-all flex items-center justify-between gap-2",
              settings.dark_mode ? "bg-zinc-800 border-zinc-700" : "bg-zinc-50 border-zinc-200"
            )}>
              <span className="flex-1">{generatedLink}</span>
              <button
                type="button"
                onClick={async () => {
                  await copyToClipboard(generatedLink);
                  toast("Link copiado!", 'success');
                }}
                className="text-zinc-400 hover:text-[var(--sidebar-active-bg)] shrink-0"
                title="Copiar link"
              >
                <Copy size={14} />
              </button>
            </div>
          )}
        </Card>
      )}

      {isAdmin && (
        <Card>
          <h3 className="font-bold mb-4">Convites</h3>
          <div className="space-y-2">
            {invites.length === 0 && <p className="text-sm text-zinc-500">Nenhum convite gerado.</p>}
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="p-3 rounded-xl border border-[var(--sidebar-border)] text-sm flex items-center gap-2"
              >
                {/* FIX: min-w-0 + truncate prevent email from overflowing and hiding the Cancelar button */}
                <span className="min-w-0 flex-1 truncate">{invite.email}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={cn(
                      "text-xs font-bold uppercase",
                      invite.accepted_at ? "text-emerald-600" : "text-orange-600"
                    )}
                  >
                    {invite.accepted_at ? "Aceito" : "Pendente"}
                  </span>
                  {!invite.accepted_at && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const link = `${window.location.origin}/invite/${invite.token}`;
                          await copyToClipboard(link);
                          toast("Link copiado!", 'success');
                        }}
                        className="text-zinc-400 hover:text-[var(--sidebar-active-bg)]"
                        title="Copiar link"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void cancelInvite(invite.id)}
                        className="text-xs text-red-500 shrink-0"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      
      {ConfirmDialogNode}
    </motion.div>
  );
}
