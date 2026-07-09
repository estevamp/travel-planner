import React, { useState } from "react";
import { ChevronDown, MapPin, PencilLine } from "lucide-react";
import type { ItineraryType } from "../types";

interface OnboardingActivityModalProps {
  isOpen: boolean;
  types: ItineraryType[];
  isSubmitting: boolean;
  onSubmit: (form: FormData) => Promise<boolean>;
}

export function OnboardingActivityModal({ isOpen, types, isSubmitting, onSubmit }: OnboardingActivityModalProps) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [typeId, setTypeId] = useState("");

  if (!isOpen) return null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("visibility", "public");
    form.set("title", name);
    form.set("location", location);
    form.set("type_id", typeId);
    await onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/15 px-5 backdrop-blur-[1px]">
      <form onSubmit={submit} className="w-full max-w-[380px] rounded-xl bg-white p-5 shadow-[0_8px_22px_rgba(0,0,0,.2)]">
        <h2 className="text-center text-[17px] font-extrabold text-[#0A2342]">Adicione sua Primeira<br />Atividade</h2>
        <label className="mt-5 block text-xs font-bold text-slate-700">Tipo
          <span className="mt-2 flex items-center rounded-b-md border-b-2 border-slate-300 px-3 py-3 text-slate-400">
            <PencilLine size={17} />
            <select value={typeId} onChange={(event) => setTypeId(event.target.value)} className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none">
              <option value="">Ex: Espiritual ou Compras</option>
              {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
            <ChevronDown size={17} />
          </span>
        </label>
        <label className="mt-4 block text-xs font-bold text-slate-700">Nome
          <span className="mt-2 flex items-center rounded-b-md border-b-2 border-slate-300 px-3 py-3 text-slate-400"><PencilLine size={17} /><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Jantar no Restaurante" className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" /></span>
        </label>
        <label className="mt-4 block text-xs font-bold text-slate-700">Local
          <span className="mt-2 flex items-center rounded-b-md border-b-2 border-slate-300 px-3 py-3 text-slate-400"><MapPin size={17} /><input required value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Cidade, país ou região" className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" /></span>
        </label>
        <div className="mt-6 flex justify-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-300" /><span className="h-1.5 w-1.5 rounded-full bg-slate-300" /><span className="h-1.5 w-1.5 rounded-full bg-slate-300" /><span className="h-1.5 w-1.5 rounded-full bg-slate-300" /><span className="h-1.5 w-6 rounded-full bg-[#2462EB]" /><span className="h-1.5 w-1.5 rounded-full bg-slate-300" /></div>
        <button disabled={isSubmitting} className="mt-5 w-full rounded-xl bg-[#2462EB] py-4 text-sm font-extrabold tracking-[.1em] text-white shadow-[0_5px_4px_rgba(10,35,66,.25)] disabled:opacity-50">{isSubmitting ? "SALVANDO..." : "ADICIONAR"}</button>
      </form>
    </div>
  );
}
