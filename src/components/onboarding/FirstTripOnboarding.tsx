import { useState } from "react";
import { Building2, MapPin, Mountain, Palmtree, Route } from "lucide-react";
import { cn } from "../../utils";
import { useI18n } from "../../i18n/I18nProvider";
import { OnboardingProgress } from "./OnboardingProgress";
import { OnboardingShell } from "./OnboardingShell";

interface FirstTripOnboardingProps {
  creating: boolean;
  onCreate: (data: { name: string; destination: string }) => Promise<void>;
  onSkip: () => void;
}

const DESTINATIONS = [
  { label: "Fernando de Noronha", icon: Palmtree },
  { label: "Gramado", icon: Mountain },
  { label: "São Paulo", icon: Building2 },
];

export function FirstTripOnboarding({ creating, onCreate, onSkip }: FirstTripOnboardingProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");

  const canSubmit = name.trim().length > 0 && destination.trim().length > 0 && !creating;

  return (
    <OnboardingShell>
      <div className="flex flex-1 flex-col justify-center gap-8">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-extrabold leading-tight tracking-normal text-[#0D2340]">
            {t("onboarding.firstTrip.title")}
          </h1>
          <p className="text-lg text-[#5E6678]">{t("onboarding.firstTrip.subtitle")}</p>
        </div>

        <form
          className="rounded-[22px] bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.16)]"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canSubmit) return;
            await onCreate({ name: name.trim(), destination: destination.trim() });
          }}
        >
          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="first-trip-name" className="text-sm font-bold text-[#3D4658]">
                {t("landing.tripName")}
              </label>
              <div className="flex items-center gap-3 rounded-lg bg-white px-4 py-4 shadow-[0_8px_14px_rgba(15,23,42,0.18)]">
                <Route size={18} className="shrink-0 text-[#B8C0D4]" />
                <input
                  id="first-trip-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("onboarding.firstTrip.namePlaceholder")}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-[#667085] outline-none placeholder:text-[#7B8497]"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="first-trip-destination" className="text-sm font-bold text-[#3D4658]">
                {t("landing.destination")}
              </label>
              <div className="flex items-center gap-3 rounded-lg bg-white px-4 py-4 shadow-[0_8px_14px_rgba(15,23,42,0.18)]">
                <MapPin size={18} className="shrink-0 text-[#B8C0D4]" />
                <input
                  id="first-trip-destination"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder={t("onboarding.firstTrip.destinationPlaceholder")}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-[#667085] outline-none placeholder:text-[#7B8497]"
                  required
                />
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <p className="text-sm font-bold text-[#202A3B]">{t("onboarding.firstTrip.popular")}</p>
              <div className="flex flex-wrap gap-2">
                {DESTINATIONS.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setDestination(label)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                      destination === label ? "bg-[#2F66F2] text-white" : "bg-[#ECEEFF] text-[#4B5365]"
                    )}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </form>
      </div>

      <div className="space-y-6 pb-2">
        <OnboardingProgress current={1} total={5} />
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onCreate({ name: name.trim(), destination: destination.trim() })}
          className="w-full rounded-xl bg-[#2F66F2] px-5 py-4 text-base font-extrabold tracking-wide text-white shadow-[0_8px_14px_rgba(47,102,242,0.36)] transition hover:bg-[#2457DB] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? t("landing.creating") : t("onboarding.firstTrip.create")}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="mx-auto block px-4 py-1 text-sm font-semibold text-[#7A8190]"
        >
          {t("onboarding.skip")}
        </button>
      </div>
    </OnboardingShell>
  );
}
