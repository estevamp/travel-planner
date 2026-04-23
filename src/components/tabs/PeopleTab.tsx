import React, { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { Trash2, Crown, Copy, Pencil, Check, X, UserX, Mail, Heart, BadgeCheck, Share2 } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, copyToClipboard } from "../../utils";
import type { Trip } from "../../types";
import { Card } from "../Card";
import { useI18n } from "../../i18n/I18nProvider";

interface PeopleTabProps {
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
  isOnline: boolean;
}

// Modal renderizado via portal para escapar de qualquer overflow/z-index pai
function CopyLinkModal({
  link,
  isDark,
  onClose,
}: {
  link: string;
  isDark: boolean;
  onClose: () => void;
}) {
  const canShare = typeof navigator.share === "function";

  const handleShare = async () => {
    try {
      await navigator.share({ url: link });
      onClose();
    } catch {
      // usuário cancelou — não faz nada
    }
  };

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "1rem", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))", backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          borderRadius: 24,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          backgroundColor: isDark ? "#18181b" : "#ffffff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p style={{ fontWeight: 700, fontSize: 16, margin: 0, color: isDark ? "#f4f4f5" : "#18181b" }}>
            Link de convite gerado
          </p>
          <p style={{ fontSize: 13, margin: "4px 0 0", color: isDark ? "#a1a1aa" : "#71717a" }}>
            {canShare
              ? "Compartilhe o link pelo botão abaixo ou segure para copiar manualmente."
              : "Segure o texto abaixo e toque em \"Copiar\"."}
          </p>
        </div>

        <input
          readOnly
          value={link}
          ref={(el) => {
            if (el) {
              // Pequeno delay para garantir que o DOM está pronto antes de selecionar
              setTimeout(() => {
                el.focus();
                el.setSelectionRange(0, link.length);
              }, 100);
            }
          }}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 12,
            border: `1px solid ${isDark ? "#3f3f46" : "#e4e4e7"}`,
            backgroundColor: isDark ? "#27272a" : "#f4f4f5",
            color: isDark ? "#d4d4d8" : "#3f3f46",
            fontSize: 13,
            boxSizing: "border-box",
            userSelect: "all",
            WebkitUserSelect: "all",
          }}
        />

        {canShare && (
          <button
            onClick={handleShare}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 16,
              border: "none",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Share2 size={16} />
            Compartilhar link
          </button>
        )}

        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 16,
            border: `1px solid ${isDark ? "#3f3f46" : "#e4e4e7"}`,
            backgroundColor: "transparent",
            color: isDark ? "#a1a1aa" : "#71717a",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Fechar
        </button>
      </div>
    </div>,
    document.body
  );
}

export function PeopleTab({ onTripUpdate, isOnline }: PeopleTabProps) {
  const {
    tripId, members, invites, currentMember, isAdmin,
    settings, reloadTrip, reloadMembers,
  } = useTripContext();
  const { t } = useI18n();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();

  const [inviteEmail, setInviteEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [editingSpouseMemberId, setEditingSpouseMemberId] = useState<string | null>(null);
  const [spouseSelectValue, setSpouseSelectValue] = useState("");
  const [guestName, setGuestName] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [invitingGuestId, setInvitingGuestId] = useState<string | null>(null);
  const [guestInviteEmail, setGuestInviteEmail] = useState("");
  const [copyModalLink, setCopyModalLink] = useState<string | null>(null);

  const reload = async () => {
    if (reloadMembers) await reloadMembers();
    else await reloadTrip();
  };

  // Tenta copiar; se falhar (ex: PWA iOS), abre o modal de compartilhamento
  const copyOrShowModal = async (link: string) => {
    const copied = await copyToClipboard(link);
    if (copied) {
      toast(t("people.copyLinkSuccess"), "success");
    } else {
      setCopyModalLink(link);
    }
  };

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
    if (!inviteToken || inviteError) { toast(getErrorMessage(inviteError), "error"); return; }
    const link = `${window.location.origin}/invite/${inviteToken}`;
    setGeneratedLink(link);
    setInviteEmail("");
    // Sempre abre o modal — mais confiável em PWA/iOS que clipboard automático
    setCopyModalLink(link);
    //reloadTrip();
  };

  const cancelInvite = async (inviteId: string) => {
    const { error } = await supabase.rpc("cancel_trip_invite", { p_trip_id: tripId, p_invite_id: inviteId });
    if (error) { toast(getErrorMessage(error), "error"); return; }
    reloadTrip();
  };

  const handleSaveName = async (member: any) => {
    const trimmedName = nameValue.trim();
    if (!trimmedName) { toast(t("people.nicknameBlank"), "error"); return; }
    if (trimmedName.length > 50) { toast(t("people.nicknameMaxLength"), "error"); return; }
    const { error } = await supabase.rpc("update_member_display_name", {
      p_trip_id: tripId,
      p_display_name: trimmedName,
      p_target_user_id: member.user_id,
    });
    if (error) { toast(getErrorMessage(error), "error"); return; }
    setEditingMemberId(null);
    await reload();
    toast(t("people.nicknameUpdated"), "success");
  };

  const saveSpouse = async (targetMemberId: string, spouseMemberId: string | null) => {
    const { error } = await supabase.rpc("set_trip_spouse", {
      p_trip_id: tripId,
      p_member_id: targetMemberId,
      p_spouse_member_id: spouseMemberId || null,
    });
    if (error) { toast(getErrorMessage(error), "error"); return; }
    setEditingSpouseMemberId(null);
    setSpouseSelectValue("");
    await reload();
    toast(t("people.spouseUpdated"), "success");
  };

  const addGuest = async () => {
    const name = guestName.trim();
    if (!name) return;
    setAddingGuest(true);
    const { error } = await supabase.rpc("add_guest_member", { p_trip_id: tripId, p_name: name });
    setAddingGuest(false);
    if (error) { toast(getErrorMessage(error), "error"); return; }
    setGuestName("");
    await reload();
    toast(t("people.guestAdded", { name }), "success");
  };

  const removeGuest = async (memberId: string, memberName: string) => {
    const confirmed = await confirm({
      title: t("people.removeGuestTitle"),
      message: t("people.removeGuestMessage", { name: memberName }),
      variant: "danger",
      isDark: settings.dark_mode,
    });
    if (!confirmed) return;
    const { error } = await supabase.rpc("remove_guest_member", { p_trip_id: tripId, p_member_id: memberId });
    if (error) { toast(getErrorMessage(error), "error"); return; }
    await reload();
    toast(t("people.guestRemoved"), "success");
  };

  const sendGuestInvite = async (memberId: string) => {
    const email = guestInviteEmail.trim().toLowerCase();
    if (!email) return;
    const { data: token, error } = await supabase.rpc("invite_guest_member", {
      p_trip_id: tripId, p_member_id: memberId, p_email: email,
    });
    if (error || !token) { toast(getErrorMessage(error), "error"); return; }
    const link = `${window.location.origin}/invite/${token}`;
    setInvitingGuestId(null);
    setGuestInviteEmail("");
    await reloadTrip();
    // Abre modal em vez de tentar clipboard direto
    setCopyModalLink(link);
  };

  const inputCls = cn(
    "px-2 py-1 rounded-lg border text-xs",
    settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
  );

  return (
    <motion.div
      key="people"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {ConfirmDialogNode}

      {!isOnline && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          <span>📶</span>
          <p>{t("people.offlineNotice")}</p>
        </div>
      )}

      {/* Tabela de membros */}
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[var(--sidebar-hover)]">
              <th className="px-4 py-3 uppercase tracking-wide">{t("people.table.person")}</th>
              <th className="px-4 py-3 uppercase tracking-wide">{t("people.table.spouse")}</th>
              {isAdmin && <th className="px-4 py-3 uppercase tracking-wide text-right">{t("people.table.actions")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--sidebar-border)]">
            {members.map((member) => {
              const isGuest = member.status === "guest";
              const spouseMemberId = member.spouse_member_id || null;
              const spouse = spouseMemberId ? members.find((m) => m.id === spouseMemberId) : null;
              const isEditingName = editingMemberId === member.id;
              const isEditingSpouse = editingSpouseMemberId === member.id;

              return (
                <tr key={member.id} className="hover:bg-[var(--sidebar-hover)] transition-colors">

                  {/* Nome */}
                  <td className="px-4 py-3">
                    {isEditingName ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={nameValue}
                          onChange={(e) => setNameValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSaveName(member)}
                          className={cn(inputCls, "w-32")}
                          autoFocus
                        />
                        <button onClick={() => handleSaveName(member)} className="text-emerald-500 hover:text-emerald-600">
                          <Check size={14} />
                        </button>
                        <button onClick={() => { setEditingMemberId(null); setNameValue(""); }} className="text-zinc-400 hover:text-zinc-600">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span>{member.display_name || member.user_id}</span>
                        {isGuest && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
                            style={{ backgroundColor: "rgba(161,161,170,0.15)", color: "var(--text-muted,#71717a)" }}
                            title={t("people.badges.noAccount")}
                          >
                            <UserX size={9} /> {t("people.badges.guest")}
                          </span>
                        )}
                        {!isGuest && member.user_id && (
                          <BadgeCheck size={14} className="text-blue-400 shrink-0" title={t("people.badges.linkedAccount")} />
                        )}
                        {member.role === "admin" && (
                          <Crown size={14} className="text-amber-400 opacity-80" title={t("people.badges.tripAdmin")} />
                        )}
                        {(member.id === currentMember?.id || isAdmin) && (
                          <button
                            onClick={() => { setNameValue(member.display_name || ""); setEditingMemberId(member.id); }}
                            className="text-zinc-400 hover:text-zinc-600"
                            title={t("people.actions.editName")}
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                      </span>
                    )}
                  </td>

                  {/* Cônjuge */}
                  <td className="px-4 py-3">
                    {isAdmin && isEditingSpouse ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={spouseSelectValue}
                          onChange={(e) => setSpouseSelectValue(e.target.value)}
                          className={inputCls}
                          autoFocus
                        >
                          <option value="">{t("people.noSpouse")}</option>
                          {members
                            .filter((m) => {
                              if (m.id === member.id) return false;
                              if (m.id === spouseMemberId) return true;
                              if (m.spouse_member_id && m.spouse_member_id !== member.id) return false;
                              return true;
                            })
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.display_name || m.user_id || t("people.guestFallback")}
                                {m.status === "guest" ? ` (${t("people.badges.guest")})` : ""}
                              </option>
                            ))}
                        </select>
                        <button onClick={() => saveSpouse(member.id, spouseSelectValue || null)} className="text-emerald-500 hover:text-emerald-600" title={t("common.confirm")}>
                          <Check size={14} />
                        </button>
                        <button onClick={() => { setEditingSpouseMemberId(null); setSpouseSelectValue(""); }} className="text-zinc-400 hover:text-zinc-600" title={t("common.cancel")}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <span className={spouse ? "" : "text-zinc-400"}>
                          {spouse?.display_name || "—"}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={() => { setEditingSpouseMemberId(member.id); setSpouseSelectValue(spouseMemberId || ""); }}
                            className="text-zinc-400 hover:text-pink-500 transition-colors"
                            title={spouse ? t("people.actions.editSpouse") : t("people.actions.defineSpouse")}
                          >
                            <Heart size={13} className={spouse ? "text-pink-400" : ""} />
                          </button>
                        )}
                      </span>
                    )}
                  </td>

                  {/* Ações — apenas para guests */}
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      {isGuest && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => { setInvitingGuestId(invitingGuestId === member.id ? null : member.id); setGuestInviteEmail(""); }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                            title={t("people.actions.inviteToApp")}
                          >
                            <Mail size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeGuest(member.id, member.display_name || t("people.guestFallback"))}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title={t("people.actions.removeGuest")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Painel inline: envio de convite para guest */}
        {invitingGuestId && (
          <div className="px-4 py-3 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-hover)]">
            <p className="text-xs text-zinc-500 mb-2">
              {t("people.guestInvitePrompt")}
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder={t("people.emailPlaceholder")}
                value={guestInviteEmail}
                onChange={(e) => setGuestInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendGuestInvite(invitingGuestId)}
                className={cn(inputCls, "flex-1 py-1.5")}
                autoFocus
              />
              <button
                onClick={() => sendGuestInvite(invitingGuestId)}
                className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-3 py-1.5 rounded-lg text-xs font-bold"
              >
                {t("people.copyLink")}
              </button>
              <button
                onClick={() => { setInvitingGuestId(null); setGuestInviteEmail(""); }}
                className="px-2 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-600"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Adicionar guest */}
      {isAdmin && (
        <Card>
          <h3 className="font-bold mb-1">{t("people.addWithoutAccountTitle")}</h3>
          <p className="text-xs text-zinc-500 mb-4">
            {t("people.addWithoutAccountDescription")}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t("people.friendNamePlaceholder")}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGuest()}
              className={cn(
                "flex-1 px-3 py-2 rounded-xl border text-sm",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500" : "bg-white border-zinc-200"
              )}
            />
            <button
              onClick={addGuest}
              disabled={addingGuest || !guestName.trim()}
              className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addingGuest ? "..." : t("common.add")}
            </button>
          </div>
        </Card>
      )}

      {/* Convidar por e-mail */}
      {isAdmin && (
        <Card>
          <h3 className="font-bold mb-1">{t("people.inviteByEmailTitle")}</h3>
          <p className="text-xs text-zinc-500 mb-4">
            {t("people.inviteByEmailDescription")}
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder={t("people.emailPlaceholder")}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createInvite()}
              className={cn(
                "flex-1 px-3 py-2 rounded-xl border text-sm",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500" : "bg-white border-zinc-200"
              )}
            />
            <button
              onClick={createInvite}
              disabled={!inviteEmail.trim()}
              className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {t("people.generateLink")}
            </button>
          </div>
          {generatedLink && (
            <div className="mt-3 flex items-center gap-2">
              <input
                readOnly
                value={generatedLink}
                className={cn(
                  "flex-1 px-3 py-2 rounded-xl border text-xs truncate",
                  settings.dark_mode ? "bg-zinc-900 border-zinc-700 text-zinc-300" : "bg-zinc-50 border-zinc-200 text-zinc-600"
                )}
              />
              <button
                onClick={() => copyOrShowModal(generatedLink)}
                className="p-2 rounded-xl border border-[var(--sidebar-border)] text-zinc-400 hover:text-zinc-700 transition-colors"
                title={t("people.copyLink")}
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
          <h3 className="font-bold mb-3">{t("people.pendingInvitesTitle")}</h3>
          <div className="space-y-2">
            {invites
              .filter((i) => !i.accepted_at)
              .map((invite) => (
                <div key={invite.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-zinc-500 truncate">{invite.email}</span>
                  <button
                    onClick={() => cancelInvite(invite.id)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors shrink-0"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Modal de compartilhamento — renderizado via portal no document.body */}
      {copyModalLink && (
        <CopyLinkModal
          link={copyModalLink}
          isDark={settings.dark_mode}
          onClose={() => setCopyModalLink(null)}
        />
      )}
    </motion.div>
  );
}