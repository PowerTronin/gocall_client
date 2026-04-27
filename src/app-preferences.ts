export type StageLayoutPreference = "shared" | "personal";

const STAGE_LAYOUT_PREFERENCE_KEY = "power-call:stage-layout-preference";

export function getStageLayoutPreference(): StageLayoutPreference {
  if (typeof window === "undefined") {
    return "shared";
  }

  const stored = window.localStorage.getItem(STAGE_LAYOUT_PREFERENCE_KEY);
  return stored === "personal" ? "personal" : "shared";
}

export function setStageLayoutPreference(preference: StageLayoutPreference): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STAGE_LAYOUT_PREFERENCE_KEY, preference);
}
