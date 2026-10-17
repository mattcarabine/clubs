/** Upper-cases the first letter: "goals per 90" becomes "Goals per 90". */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
