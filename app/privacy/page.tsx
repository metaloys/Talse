import Link from "next/link";

const PI_SCOPES = ["username", "payments", "wallet_address", "in_app_notifications"] as const;

const DATA_CATEGORIES = [
  "Pi UID",
  "username",
  "profile data",
  "service listings",
  "hire-request records",
  "messages",
  "attachments",
  "reviews",
  "dispute evidence",
  "payment and escrow state",
] as const;

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-16 text-foreground sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Legal</p>
          <h1 className="mt-2 text-3xl font-bold text-foreground">Privacy Policy</h1>
        </div>
        <Link href="/" className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary">
          Back to app
        </Link>
      </div>

      <div className="space-y-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Overview</h2>
          <p className="leading-7 text-muted-foreground">
            Talse is a marketplace for services and service requests. We process personal information in order to authenticate
            users, maintain profiles, enable transactions, and support customer-provider communication and dispute handling.
            This Privacy Policy explains what we collect, why we collect it, and how we use it in the app.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">What we collect</h2>
          <p className="leading-7 text-muted-foreground">
            The app collects the information needed to operate the marketplace. The exact categories we currently store are:
          </p>
          <ul className="list-disc space-y-2 pl-6 leading-7 text-muted-foreground">
            {DATA_CATEGORIES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="leading-7 text-muted-foreground">
            In practical terms, that includes the Pi UID that identifies a user, the username presented in the app, profile
            information, public service listings, hire-request records, conversation messages, uploaded attachments, reviews,
            dispute evidence, and the payment/escrow state required to complete hire transactions safely.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Pi identity and scopes</h2>
          <p className="leading-7 text-muted-foreground">
            When a user signs in, the application requests the following Pi authentication scopes exactly:
          </p>
          <ul className="list-disc space-y-2 pl-6 leading-7 text-muted-foreground">
            {PI_SCOPES.map((scope) => (
              <li key={scope}>{scope}</li>
            ))}
          </ul>
          <p className="leading-7 text-muted-foreground">
            These scopes are used to establish the user’s Pi identity, enable payment-related actions, populate the user and
            wallet context needed for marketplace operations, and support in-app notifications. We do not request or use any
            extra Pi scopes beyond this list.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">How we verify identity</h2>
          <p className="leading-7 text-muted-foreground">
            The app verifies the Pi access token server-side against api.minepi.com/v2/me before trusting a user identity or
            allowing writes tied to a Pi UID. This means the browser client is not treated as the authority for account
            ownership; the backend checks the token and only then permits authenticated user operations or data writes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Why we store this information</h2>
          <p className="leading-7 text-muted-foreground">
            We use this data to provide the marketplace experience: create and browse services, submit and manage hire
            requests, communicate with counterparties, maintain reviews, resolve disputes, and record the state of escrow and
            payment activity. The app stores the minimum operational data needed to do that reliably and to support later
            audits, payouts, and dispute review.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Messages, attachments, disputes, and payments</h2>
          <p className="leading-7 text-muted-foreground">
            Conversation messages and attachment references are retained for the relevant hire request so the parties can
            coordinate on work, terms, and delivery. Dispute evidence and dispute-related notes are retained as part of the
            hire-request record and admin review process. Payment and escrow state is retained in the system to track amounts,
            transaction identifiers, lock and release status, refunds, and payout history.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Supabase and server-side storage</h2>
          <p className="leading-7 text-muted-foreground">
            The app stores data in Supabase using the marketplace schema. This includes profile records, service listings,
            hire-request lifecycle data, messages, reviews, stored attachment paths, dispute evidence, and payment/escrow state
            needed to support release, refund, and dispute workflows. The server-side API routes are responsible for validating
            requests before issuing writes to Supabase or other platform services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Your choices and contact</h2>
          <p className="leading-7 text-muted-foreground">
            You can control the profile information you submit, the service listings you publish, and the messages you send.
            If you have questions about the data we process, contact the operator using the available support channels for the
            app. This policy may be updated as the product evolves, but any material change will be reflected in the public app
            materials and this document.
          </p>
        </section>
      </div>
    </main>
  );
}
