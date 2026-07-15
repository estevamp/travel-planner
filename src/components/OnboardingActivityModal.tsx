import React, { useState } from "react";
import { ChevronDown, MapPin, PencilLine } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import type { ItineraryType } from "../types";

interface OnboardingActivityModalProps {
  isOpen: boolean;
  types: ItineraryType[];
  isSubmitting: boolean;
  onSubmit: (form: FormData) => Promise<boolean>;
}

export function OnboardingDots({ current }: { current: number }) {
  return (
    <div className="mt-5 flex justify-center gap-1.5" aria-label={`Etapa ${current} de 6`}>
      {[1, 2, 3, 4, 5, 6].map((step) => (
        <span key={step} className={`h-1.5 rounded-full ${step === current ? "w-6 bg-[#2462EB]" : "w-1.5 bg-slate-300"}`} />
      ))}
    </div>
  );
}

export function OnboardingActivityModal({ isOpen, types, isSubmitting, onSubmit }: OnboardingActivityModalProps) {
  const { language } = useI18n();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [typeId, setTypeId] = useState("");

  if (!isOpen) return null;

  const copy = language === "en" ? {
    title: <>Add your First<br />Activity</>,
    type: "Type", typePlaceholder: "Ex: Spiritual or Shopping",
    name: "Name", namePlaceholder: "Ex: Dinner at the Restaurant",
    location: "Location", locationPlaceholder: "City, country or region",
    submit: "ADD", saving: "SAVING...",
  } : {
    title: <>Adicione sua Primeira<br />Atividade</>,
    type: "Tipo", typePlaceholder: "Ex: Espiritual ou Compras",
    name: "Nome", namePlaceholder: "Ex: Jantar no Restaurante",
    location: "Local", locationPlaceholder: "Cidade, país ou região",
    submit: "ADICIONAR", saving: "SALVANDO...",
  };

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
        <h2 className="text-center text-[17px] font-extrabold text-[#0A2342]">{copy.title}</h2>
        <label className="mt-5 block text-xs font-bold text-slate-700">{copy.type}
          <span className="mt-2 flex items-center rounded-b-md border-b-2 border-slate-300 px-3 py-3 text-slate-400">
            <PencilLine size={17} />
            <select value={typeId} onChange={(event) => setTypeId(event.target.value)} className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none">
              <option value="">{copy.typePlaceholder}</option>
              {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
            <ChevronDown size={17} />
          </span>
        </label>
        <label className="mt-4 block text-xs font-bold text-slate-700">{copy.name}
          <span className="mt-2 flex items-center rounded-b-md border-b-2 border-slate-300 px-3 py-3 text-slate-400"><PencilLine size={17} /><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={copy.namePlaceholder} className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" /></span>
        </label>
        <label className="mt-4 block text-xs font-bold text-slate-700">{copy.location}
          <span className="mt-2 flex items-center rounded-b-md border-b-2 border-slate-300 px-3 py-3 text-slate-400"><MapPin size={17} /><input required value={location} onChange={(event) => setLocation(event.target.value)} placeholder={copy.locationPlaceholder} className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" /></span>
        </label>
        <OnboardingDots current={5} />
        <button disabled={isSubmitting} className="mt-5 w-full rounded-xl bg-[#2462EB] py-4 text-sm font-extrabold tracking-[.1em] text-white shadow-[0_5px_4px_rgba(10,35,66,.25)] disabled:opacity-50">{isSubmitting ? copy.saving : copy.submit}</button>
      </form>
    </div>
  );
}
