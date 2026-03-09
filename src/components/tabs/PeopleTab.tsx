import React, { useState } from "react";
import { motion } from "motion/react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { UserPlus, Trash2, Crown, Copy, Pencil, Check, X, UserX, Mail, Heart, HeartOff, BadgeCheck } from "lucide-react";
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
    settings, reloadTrip,
    reloadMembers,
  } = useTripContext();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [inviteEmail, setInviteEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");

  // Estado para edição de cônjuge pelo admin
  const [editingSpouseMemberId, setEditingSpouseMemberId] = useState<string | null>(null);
  const [spouseSelectValue, setSpouseSelectValue] = useState("");

  // Guest member states
  const [guestName, setGuestName] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [invitingGuestId, setInvitingGuestId] = useState<string | null>(null);
  const [guestInviteEmail, setGuestInviteEmail] = useState("");


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

  // set_trip_spouse opera por member.id (não user_id), funciona com guests também.
  const adminSetSpouse = async (targetMemberId: string, spouseMemberId: string | null) => {
    const { error } = await supabase.rpc("set_trip_spouse", {
      p_trip_id: tripId,
      p_member_id: targetMemberId,
      p_spouse_member_id: spouseMemberId || null,
    });
    if (error) {
      toast(getErrorMessage(error), "error");
      return;
    }
    setEditingSpouseMemberId(null);
    setSpouseSelectValue("");
    if (reloadMembers) {
      await reloadMembers();
    } else {
      await reloadTrip();
    }
    toast("Cônjuge atualizado!", "success");
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
      {ConfirmDialogNode}
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
              // spouse_member_id está direto no objeto — funciona para usuários e guests
              const spouseMemberId = member.spouse_member_id || null;
              const spouse = spouseMemberId ? members.find((m) => m.id === spouseMemberId) : null;
              const isGuest = member.status === "guest";
              const isEditingSpouse = editingSpouseMemberId === member.id;

              return (
                <tr key={member.id}>
                  {/* Coluna: Nome */}
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
                        {!isGuest && member.user_id && (
                          <BadgeCheck size={14} className="text-blue-400 shrink-0" title="Conta vinculada" />
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

                  {/* Coluna: Cônjuge */}
                  <td className="px-4 py-3">
                    {/* Admin editando cônjuge deste membro */}
                    {isAdmin && isEditingSpouse ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={spouseSelectValue}
                          onChange={(e) => setSpouseSelectValue(e.target.value)}
                          className={cn(
                            "px-2 py-1 rounded-lg border text-xs",
                            settings.dark_mode
                              ? "bg-zinc-800 border-zinc-700 text-white"
                              : "bg-white border-zinc-200"
                          )}
                        >
                          <option value="">Sem cônjuge</option>
                          {members
                            .filter((m) => m.id !== member.id)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.display_name || m.user_id || "Guest"}
                                {m.status === "guest" ? " (guest)" : ""}
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => adminSetSpouse(member.id, spouseSelectValue || null)}
                          className="text-emerald-500 hover:text-emerald-600"
                          title="Salvar cônjuge"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingSpouseMemberId(null);
                            setSpouseSelectValue("");
                          }}
                          className="text-zinc-400 hover:text-zinc-600"
                          title="Cancelar"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {spouse?.display_name || (
                          <span className="text-zinc-400">-</span>
                        )}
                        {/* Botão para admin editar cônjuge (apenas membros com user_id real) */}
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setEditingSpouseMemberId(member.id);
                              setSpouseSelectValue(spouseMemberId || "");
                            }}
                            className="text-zinc-400 hover:text-pink-500 transition-colors"
                            title={spouse ? "Editar cônjuge" : "Definir cônjuge"}
                          >
                            {spouse ? <Heart size={13} className="text-pink-400" /> : <Heart size={13} />}
                          </button>
                        )}
                      </span>
                    )}
                  </td>

                  {/* Coluna: Ações (admin) */}
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      {isGuest ? (
                        <div className="flex items-center justify-end gap-1">
                          {/* Botão convidar guest */}
                          <button
                            type="button"
                            onClick={() =>
                              setInvitingGuestId(
                                invitingGuestId === member.id ? null : member.id
                              )
                            }
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                            title="Convidar para o app"
                          >
                            <Mail size={14} />
                          </button>
                          {/* Botão remover guest */}
                          <button
                            type="button"
                            onClick={() =>
                              removeGuest(member.id, member.display_name || "Guest")
                            }
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Remover guest"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Painel inline de convite para guest */}
        {invitingGuestId && (
          <div className="px-4 py-3 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-hover)]">
            <p className="text-xs text-zinc-500 mb-2">
              Envie o link de convite para o guest assumir o slot:
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="email@exemplo.com"
                value={guestInviteEmail}
                onChange={(e) => setGuestInviteEmail(e.target.value)}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-lg border text-xs",
                  settings.dark_mode
                    ? "bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500"
                    : "bg-white border-zinc-200"
                )}
              />
              <button
                onClick={() => sendGuestInvite(invitingGuestId)}
                className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-3 py-1.5 rounded-lg text-xs font-bold"
              >
                Copiar link
              </button>
              <button
                onClick={() => {
                  setInvitingGuestId(null);
                  setGuestInviteEmail("");
                }}
                className="px-2 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </Card>



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
                        setInvitingGuestId(
                          invitingGuestId === guest.id ? null : guest.id
                        );
                        setGuestInviteEmail("");
                      }}
                      className="p-1 rounded-lg text-zinc-400 hover:text-blue-500 transition-colors"
                      title="Convidar"
                    >
                      <Mail size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        removeGuest(guest.id, guest.display_name || "Guest")
                      }
                      className="p-1 rounded-lg text-zinc-400 hover:text-red-500 transition-colors"
                      title="Remover"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Form: adicionar novo guest */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nome do amigo"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGuest()}
              className={cn(
                "flex-1 px-3 py-2 rounded-xl border text-sm",
                settings.dark_mode
                  ? "bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500"
                  : "bg-white border-zinc-200"
              )}
            />
            <button
              onClick={addGuest}
              disabled={addingGuest || !guestName.trim()}
              className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addingGuest ? "..." : "Adicionar"}
            </button>
          </div>
        </Card>
      )}

      {/* Card: Convite por email */}
      {isAdmin && (
        <Card>
          <h3 className="font-bold mb-1">Convidar por e-mail</h3>
          <p className="text-xs text-zinc-500 mb-4">
            Gere um link de convite para uma pessoa entrar nesta viagem.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="email@exemplo.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createInvite()}
              className={cn(
                "flex-1 px-3 py-2 rounded-xl border text-sm",
                settings.dark_mode
                  ? "bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500"
                  : "bg-white border-zinc-200"
              )}
            />
            <button
              onClick={createInvite}
              disabled={!inviteEmail.trim()}
              className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              Gerar link
            </button>
          </div>
          {generatedLink && (
            <div className="mt-3 flex items-center gap-2">
              <input
                readOnly
                value={generatedLink}
                className={cn(
                  "flex-1 px-3 py-2 rounded-xl border text-xs truncate",
                  settings.dark_mode
                    ? "bg-zinc-900 border-zinc-700 text-zinc-300"
                    : "bg-zinc-50 border-zinc-200 text-zinc-600"
                )}
              />
              <button
                onClick={() => copyToClipboard(generatedLink).then(() => toast("Link copiado!", "success"))}
                className="p-2 rounded-xl border border-[var(--sidebar-border)] text-zinc-400 hover:text-zinc-700 transition-colors"
                title="Copiar link"
              >
                <Copy size={14} />
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Convites pendentes */}
      {isAdmin && invites.filter((i) => !i.accepted_at).length > 0 && (
        <Card>
          <h3 className="font-bold mb-3">Convites pendentes</h3>
          <div className="space-y-2">
            {invites
              .filter((i) => !i.accepted_at)
              .map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-zinc-500 truncate">{invite.email}</span>
                  <button
                    onClick={() => cancelInvite(invite.id)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors shrink-0"
                  >
                    Cancelar
                  </button>
                </div>
              ))}
          </div>
        </Card>
      )}
    </motion.div>
  );
}