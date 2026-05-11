export interface OnboardingState {
  welcomeSeen: boolean;
  firstTripId?: string;
  firstActivityStarted?: boolean;
  firstActivityCreated?: boolean;
  skippedAt?: string;
}

const ONBOARDING_STORAGE_KEY = "partiu:onboarding:v1";

const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  welcomeSeen: false,
};

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function getOnboardingState(): OnboardingState {
  if (!canUseStorage()) return DEFAULT_ONBOARDING_STATE;

  try {
    const stored = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!stored) return DEFAULT_ONBOARDING_STATE;
    return { ...DEFAULT_ONBOARDING_STATE, ...(JSON.parse(stored) as OnboardingState) };
  } catch {
    return DEFAULT_ONBOARDING_STATE;
  }
}

export function setOnboardingState(next: OnboardingState): OnboardingState {
  if (!canUseStorage()) return next;
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function markFirstTripCreated(tripId: string): OnboardingState {
  return setOnboardingState({
    ...getOnboardingState(),
    welcomeSeen: true,
    firstTripId: tripId,
  });
}

export function markFirstActivityStarted(): OnboardingState {
  return setOnboardingState({
    ...getOnboardingState(),
    firstActivityStarted: true,
  });
}

export function markFirstActivityCreated(): OnboardingState {
  return setOnboardingState({
    ...getOnboardingState(),
    firstActivityStarted: true,
    firstActivityCreated: true,
  });
}

export function skipOnboarding(): OnboardingState {
  return setOnboardingState({
    ...getOnboardingState(),
    skippedAt: new Date().toISOString(),
  });
}
