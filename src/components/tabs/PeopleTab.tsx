import React, { useState } from "react";
import { motion } from "motion/react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { UserPlus, Trash2, Crown, Copy, Pencil, Check, X, UserX, Mail } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, copyToClipboard } from "../../utils";
import type { Trip } from "../../types";
import { Card } from "../Card";

interface PeopleTabProps {
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
  isOnline: boolean;
}

export function PeopleTab({ onTripUpdate, isOnline }: PeopleTabProps) {
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

  // Guest member states
  const [guestName, setGuestName] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [invitingGuestId, setInvitingGuestId] = useState<string | null>(null);
  const [guestInviteEmail, setGuestInviteEmail] = useState("");

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

  const addGuest = async () => {
    const name = guestName.trim();
    if (!name) return;

    setAddingGuest(true);
    const { error } = await supabase.rpc("add_guest_member", {
      p_trip_id: tripId,
      p_name: name,
    });
    setAddingGuest(false);

    if (error) {
      toast(getErrorMessage(error), "error");
      return;
    }

    setGuestName("");
    if (reloadMembers) {
      await reloadMembers();
    } else {
      await reloadTrip();
    }
    toast(`${name} adicionado como guest!`, "success");
  };

  const removeGuest = async (memberId: string, memberName: string) => {
    const confirmed = await confirm({
      title: "Remover guest?",
      message: `"${memberName}" será removido. Isso só é possível se ele não tiver despesas vinculadas.`,
      variant: "danger",
      isDark: settings.dark_mode,
    });
    if (!confirmed) return;

    const { error } = await supabase.rpc("remove_guest_member", {
      p_trip_id: tripId,
      p_member_id: memberId,
    });

    if (error) {
      toast(getErrorMessage(error), "error");
      return;
    }

    if (reloadMembers) {
      await reloadMembers();
    } else {
      await reloadTrip();
    }
    toast("Guest removido.", "success");
  };

  const sendGuestInvite = async (memberId: string) => {
    const email = guestInviteEmail.trim().toLowerCase();
    if (!email) return;

    const { data: token, error } = await supabase.rpc("invite_guest_member", {
      p_trip_id: tripId,
      p_member_id: memberId,
      p_email: email,
    });

    if (error || !token) {
      toast(getErrorMessage(error), "error");
      return;
    }

    const link = `${window.location.origin}/invite/${token}`;
    await copyToClipboard(link);
    toast("Link de convite copiado!", "success");
    setInvitingGuestId(null);
    setGuestInviteEmail("");
    await reloadTrip();
  };

  const guestMembers = members.filter((m) => m.status === "guest");

  return (
    <motion.div key="people" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      {!isOnline && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          <span>📶</span>
          <p>Você está offline. O gerenciamento de amigos requer conexão com a internet.</p>
        </div>
      )}

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
              const spouseUserId = member.user_id ? (spouseByUserId.get(member.user_id) || null) : null;
              const spouse = spouseUserId ? memberByUserId.get(spouseUserId) : null;
              const isGuest = member.status === "guest";

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
                        {isGuest && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
                            style={{
                              backgroundColor: "rgba(161,161,170,0.15)",
                              color: "var(--text-muted, #71717a)",
                            }}
                            title="Sem conta no app"
                          >
                            <UserX size={9} />
                            guest
                          </span>
                        )}
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
                      {isGuest ? (
                        <button
                          onClick={() => removeGuest(member.id, member.display_name || "Guest")}
                          className="text-zinc-400 hover:text-red-500"
                          title="Remover guest"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : (
                        member.user_id !== currentMember?.user_id && (
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
                        )
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
                  <option key={m.id} value={m.user_id ?? ""}>
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

      {/* Card: Adicionar sem conta */}
      {isAdmin && (
        <Card>
          <h3 className="font-bold mb-1">Adicionar sem conta</h3>
          <p className="text-xs text-zinc-500 mb-4">
            Adicione amigos que não usam o app — eles já aparecem no rateio de despesas.
            Quando quiserem entrar, envie um convite para assumirem o slot.
          </p>

          {/* Lista de guests existentes */}
          {guestMembers.length > 0 && (
            <div className="space-y-2 mb-4">
              {guestMembers.map((guest) => (
                <div
                  key={guest.id}
                  className="p-3 rounded-xl border border-[var(--sidebar-border)] text-sm"
                >
                  <div className="flex items-center gap-2">
                    <UserX size={14} className="text-zinc-400 shrink-0" />
                    <span className="flex-1 font-medium">{guest.display_name}</span>
                    {guest.guest_email && (
                      <span className="text-xs text-zinc-400 truncate max-w-[140px]">
                        {guest.guest_email}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setInvitingGuestId(invitingGuestId === guest.id ? null : guest.id);
                        setGuestInviteEmail(guest.guest_email || "");
                      }}
                      className="text-zinc-400 hover:text-[var(--sidebar-active-bg)]"
                      title="Enviar convite para assumir conta"
                    >
                      <Mail size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeGuest(guest.id, guest.display_name || "Guest")}
                      className="text-zinc-400 hover:text-red-500"
                      title="Remover guest"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Inline: enviar convite */}
                  {invitingGuestId === guest.id && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="email"
                        value={guestInviteEmail}
                        onChange={(e) => setGuestInviteEmail(e.target.value)}
                        placeholder="email@exemplo.com"
                        className={cn(
                          "flex-1 px-3 py-1.5 rounded-lg border text-xs",
                          settings.dark_mode
                            ? "bg-zinc-800 border-zinc-700 text-white"
                            : "bg-white border-zinc-200"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => void sendGuestInvite(guest.id)}
                        className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-3 py-1.5 rounded-lg text-xs font-bold"
                      >
                        Enviar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Formulário novo guest */}
          <div className="flex flex-col md:flex-row gap-3">
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void addGuest(); }}
              type="text"
              placeholder="Nome do amigo"
              className={cn(
                "flex-1 px-4 py-2 rounded-xl border text-sm",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
            <button
              type="button"
              onClick={() => void addGuest()}
              disabled={addingGuest || !guestName.trim()}
              className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 justify-center disabled:opacity-50"
            >
              <UserX size={16} />
              {addingGuest ? "Adicionando..." : "Adicionar"}
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
