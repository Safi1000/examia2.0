import type { Metadata } from "next";
import Link from "next/link";
import { CookieChoiceReset } from "@/components/landing/CookieBanner";
import { LegalPage } from "@/components/landing/LegalPage";
import { LANDING, waLink } from "@/lib/landing";

export const metadata: Metadata = {
  title: "Privacy Policy | Hamza Teaches",
  description:
    "What Hamza Teaches collects on this website and in the student portal, why, who it is shared with, how long it is kept, and how to see, change or delete it.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "18 October 2026";

export default function PrivacyPage() {
  const wa = (
    <a href={waLink()} target="_blank" rel="noopener noreferrer">
      WhatsApp
    </a>
  );

  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy policy"
      updated={UPDATED}
      intro={
        <>
          <p>
            This policy explains what information I collect when you visit hamzateaches.com, book a free trial
            lesson, or study with me through the student portal; why I need it; who helps me look after it; and
            what you can ask me to do with it.
          </p>
          <p className="mt-4">
            The short version: I only keep what I need to teach you and to reply to you. I never sell your
            information. You can ask me to see, correct or delete it at any time.
          </p>
        </>
      }
      sections={[
        {
          h: "1. Who is responsible",
          body: (
            <p>
              Hamza Teaches is run by Hamza, a private tutor based in Rawalpindi, Pakistan, teaching students
              online in Pakistan and abroad. I decide how your information is used, so I am responsible for it.
              Contact me on {wa}, on Instagram at{" "}
              <a href={LANDING.instagram} target="_blank" rel="noopener noreferrer">@hamzateaches</a>, or by
              email at <a href={`mailto:${LANDING.email}`}>{LANDING.email}</a>.
            </p>
          ),
        },
        {
          h: "2. What I collect and why",
          body: (
            <>
              <p>
                <strong className="text-foreground">When you visit the website.</strong> You can read every public
                page without giving me anything. The site uses the Meta (Facebook) pixel, which records the pages
                you open and the buttons you press (for example &quot;Book free trial&quot;) together with
                technical details such as your browser and device. I use this to see how many people visit and to
                show my Instagram and Facebook ads to the right students.
              </p>
              <p>
                <strong className="text-foreground">When you book a free trial or message me.</strong> The booking
                calendar and WhatsApp buttons open WhatsApp with a message already typed in: the subject, level,
                exam board, your preferred day and time, whether you are a student or a parent, and online or in
                person. Nothing is sent until you press send. I then have your WhatsApp name and number and
                whatever you choose to tell me. I use it to arrange the lesson and answer your questions.
              </p>
              <p>
                <strong className="text-foreground">When you use the grade predictor.</strong> Your marks are worked
                out on your own device. They are not stored or sent anywhere, unless you choose to send your result
                to me on WhatsApp.
              </p>
              <p>
                <strong className="text-foreground">When you join the waitlist.</strong> The free tools pages let you
                ask to hear about new tools, guides and courses. You give your first name, WhatsApp number, level,
                subjects and what you want to hear about. It is stored privately, seen only by me, and used only to
                message you about those things. Ask me on WhatsApp and I will delete it.
              </p>
              <p>
                <strong className="text-foreground">When you use the free calculators.</strong> Your figures are worked
                out on your own device and are not stored or sent anywhere, unless you choose to send them to me on
                WhatsApp.
              </p>
              <p>
                <strong className="text-foreground">When you study with me.</strong> I create a student portal
                account for each enrolled student. It holds:
              </p>
              <ul>
                <li>your name, username, class group, and a phone or WhatsApp number (yours and, if given, a parent&apos;s)</li>
                <li>your test answers, photos you upload of written work, your marks and my feedback</li>
                <li>attendance, assignments, notes I share, and the monthly progress reports I write</li>
              </ul>
              <p>
                I use this to teach you, mark your work, track your progress and keep your parents informed.
                Monthly reports can be shared with parents through a private link that stops working after 90 days.
              </p>
              <p>
                <strong className="text-foreground">In live classes.</strong> Classes run on Google Meet or Zoom and are recorded
                so students can watch them again. Recordings are shared only with the students in that class.
              </p>
            </>
          ),
        },
        {
          h: "3. The reasons I am allowed to use it",
          body: (
            <ul>
              <li><strong className="text-foreground">To provide lessons you asked for</strong>: your portal account, classes, marking and reports.</li>
              <li><strong className="text-foreground">Legitimate interests</strong>: replying to your messages, keeping the site and portal secure, and improving my teaching.</li>
              <li><strong className="text-foreground">Consent</strong>: advertising cookies, where the law where you live asks for it. You can withdraw it at any time.</li>
              <li><strong className="text-foreground">Legal duties</strong>: keeping payment records where the law requires.</li>
            </ul>
          ),
        },
        {
          h: "4. Cookies and similar storage",
          body: (
            <>
              <p>The website uses only two kinds:</p>
              <ul>
                <li>
                  <strong className="text-foreground">Advertising</strong>: the Meta pixel sets cookies (such as
                  _fbp) to measure visits and ads. If you visit from the UK or the EU, it only loads after you agree
                  in the cookie banner. You can also block it in your browser settings or limit it in your Facebook
                  ad preferences.
                </li>
                <li>
                  <strong className="text-foreground">Essential</strong>: when a student logs in, the portal keeps
                  the login in the browser so it does not ask on every page. Without it the portal cannot work.
                </li>
              </ul>
              <p>There are no other analytics or tracking tools on the site.</p>
              <CookieChoiceReset />
            </>
          ),
        },
        {
          h: "5. Who helps me look after it",
          body: (
            <>
              <p>
                I use a few trusted services to run the site and the classes. They only use your information to
                provide their service to me:
              </p>
              <ul>
                <li><strong className="text-foreground">Vercel</strong>: hosts the website.</li>
                <li><strong className="text-foreground">Supabase</strong>: stores portal accounts, marks and reports.</li>
                <li><strong className="text-foreground">Cloudinary</strong>: stores uploaded photos of work and shared notes.</li>
                <li><strong className="text-foreground">Meta</strong>: WhatsApp messages, and the advertising pixel.</li>
                <li><strong className="text-foreground">Google Meet and Zoom</strong>: live classes and their recordings.</li>
                <li><strong className="text-foreground">YouTube</strong>: plays videos on the site, in privacy-enhanced mode.</li>
              </ul>
              <p>I never sell your information, and I never share it with other tutors, schools or advertisers.</p>
            </>
          ),
        },
        {
          h: "6. Where it is stored",
          body: (
            <p>
              These services may store information on servers outside Pakistan, for example in the United States
              or Europe. Each of them protects it under its own security and privacy commitments.
            </p>
          ),
        },
        {
          h: "7. How long I keep it",
          body: (
            <ul>
              <li><strong className="text-foreground">Enquiries and trial bookings</strong>: up to 12 months after we last spoke, unless you join.</li>
              <li><strong className="text-foreground">Student records</strong>: while you study with me and for 12 months after your last class, so results and reports stay available. Then I delete them.</li>
              <li><strong className="text-foreground">Parent report links</strong>: stop working after 90 days.</li>
              <li><strong className="text-foreground">Advertising cookies</strong>: as set by Meta, usually up to 90 days.</li>
            </ul>
          ),
        },
        {
          h: "8. Keeping it safe",
          body: (
            <p>
              The site and portal only work over encrypted connections. In the portal, each student can see only
              their own work and results, and only I can see everyone&apos;s. Logins are personal; please keep
              yours private and tell me straight away if someone else may have it.
            </p>
          ),
        },
        {
          h: "9. Students under 18",
          body: (
            <p>
              Most of my students are under 18. A parent or guardian is welcome to speak to me before a student
              joins, and can ask about or change their child&apos;s information at any time. For students under 13,
              I need a parent or guardian to agree before I create a portal account.
            </p>
          ),
        },
        {
          h: "10. Your rights",
          body: (
            <>
              <p>You (or a parent, for a student under 18) can ask me to:</p>
              <ul>
                <li>show you the information I hold about you</li>
                <li>correct anything that is wrong</li>
                <li>delete your information</li>
                <li>stop using it for something you object to, including advertising</li>
              </ul>
              <p>
                Message me on {wa} and I will reply within 30 days, usually much sooner. If you are not happy with
                my answer, you can contact the data protection authority where you live.
              </p>
            </>
          ),
        },
        {
          h: "11. Changes",
          body: (
            <p>
              If this policy changes, the new version goes on this page with a new date at the top. See also the{" "}
              <Link href="/terms">terms of use</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
