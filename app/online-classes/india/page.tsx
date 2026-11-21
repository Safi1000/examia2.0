import { CountryClasses, countryMetadata } from "../_country/CountryClasses";
import { countryPage } from "@/lib/country-pages";

/** Online classes for students in India. Content and sources: lib/country-pages.ts. */
const c = countryPage("india")!;

export const metadata = countryMetadata(c);

export default function OnlineClassesIndia() {
  return <CountryClasses c={c} />;
}
