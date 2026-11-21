import { CountryClasses, countryMetadata } from "../_country/CountryClasses";
import { countryPage } from "@/lib/country-pages";

/** Online classes for students in Malaysia. Content and sources: lib/country-pages.ts. */
const c = countryPage("malaysia")!;

export const metadata = countryMetadata(c);

export default function OnlineClassesMalaysia() {
  return <CountryClasses c={c} />;
}
