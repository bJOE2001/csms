/** Text identity and verified location shared by public and internal views. */
export const coffeeBrand = {
  name: "Sip&Snap",
  slug: "sip-and-snap",
  description: "Discover Sip&Snap — a welcoming place for coffee, food, and memorable moments.",
  address: "Purok 6, Ising, Carmen, Davao del Norte",
  directions: "https://maps.app.goo.gl/JFPkDck15BBvFdLe9",
} as const;

/** Update presentation of legacy shop names without rewriting stored records or branch names. */
export function displayShopName(name: string) {
  const trimmed = name.trim();
  return !trimmed || ["logo", "logo coffee", "coffee logo", "sip & snap", "sip&snap"].includes(trimmed.toLowerCase())
    ? coffeeBrand.name : trimmed;
}
