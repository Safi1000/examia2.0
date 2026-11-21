import { CountryClasses, countryMetadata } from "../_country/CountryClasses";
import { countryPage } from "@/lib/country-pages";

/** Online classes for students in Indonesia. Content and sources: lib/country-pages.ts. */
const c = countryPage("indonesia")!;

export const metadata = countryMetadata(c);

export default function OnlineClassesIndonesia() {
  return <CountryClasses c={c} />;
}
