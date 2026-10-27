import { permanentRedirect } from "next/navigation";

// No hub page yet: the Pakistan guide is the main one.
export default function PrivateCandidates() {
  permanentRedirect("/private-candidates/pakistan");
}
