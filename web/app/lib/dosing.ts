import type { Person } from "./api";

export interface DoseBreakdown {
  carbPortion: number;
  correctionPortion: number;
  total: number;
}

/**
 * Pure arithmetic using values the user entered themselves (as prescribed
 * by their doctor) in Settings. Never AI-generated — see the safety note
 * on the marketing page and the "Refuse AI-generated insulin dosing
 * recommendations" standing rule. Returns null when the person hasn't
 * configured a formula, or neither input applies to what's configured.
 */
export function suggestedDose(
  person: Person,
  carbsGrams: number | null,
  glucose: number | null
): DoseBreakdown | null {
  const hasCarbFormula = person.carb_ratio != null && carbsGrams != null && carbsGrams > 0;
  const hasCorrectionFormula =
    person.correction_factor != null && person.target_glucose != null && glucose != null;

  if (!hasCarbFormula && !hasCorrectionFormula) return null;

  const carbPortion = hasCarbFormula ? carbsGrams! / person.carb_ratio! : 0;
  const correctionPortion = hasCorrectionFormula
    ? Math.max(0, (glucose! - person.target_glucose!) / person.correction_factor!)
    : 0;

  const total = Math.round((carbPortion + correctionPortion) * 2) / 2; // nearest 0.5 unit

  return { carbPortion, correctionPortion, total };
}
