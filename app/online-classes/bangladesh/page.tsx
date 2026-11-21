import { CountryClasses, countryMetadata } from "../_country/CountryClasses";
import { countryPage } from "@/lib/country-pages";

/** Online classes for students in Bangladesh. Content and sources: lib/country-pages.ts. */
const c = countryPage("bangladesh")!;

export const metadata = countryMetadata(c);

export default function OnlineClassesBangladesh() {
  return <CountryClasses c={c} />;
}
