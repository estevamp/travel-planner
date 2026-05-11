import { motion } from "motion/react";
import { useI18n } from "../../i18n/I18nProvider";
import { OnboardingProgress } from "./OnboardingProgress";

interface FirstActivityHintProps {
  onSkip: () => void;
  success?: boolean;
}

export function FirstActivityHint({ onSkip, success = false }: FirstActivityHintProps) {
  const { t } = useI18n();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="pointer-events-none fixed inset-x-4 bottom-36 z-30 mx-auto max-w-sm md:absolute md:bottom-28"
    >
      <div className="pointer-events-auto rounded-2xl bg-white px-6 py-7 text-center shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
        <h3 className="text-lg font-extrabold leading-snug text-[#263348]">
          {success ? t("onboarding.activity.successTitle") : t("onboarding.activity.hintTitle")}
        </h3>
        <p className="mt-4 text-base leading-relaxed text-[#4B5365]">
          {success ? t("onboarding.activity.successBody") : t("onboarding.activity.hintBody")}
        </p>
        {!success && <OnboardingProgress current={2} total={5} className="mt-6" />}
        <button
          type="button"
          onClick={onSkip}
          className="mt-5 text-xs font-semibold text-[#8A92A3]"
        >
          {t("onboarding.skip")}
        </button>
      </div>
    </motion.div>
  );
}
