/** Accepts "0244123456", "024 412 3456", "+233 24 412 3456" → "0244123456". */
export function normaliseGhanaPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return digits;
  if (/^233\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  return null;
}
