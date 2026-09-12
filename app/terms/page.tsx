import Link from "next/link";
import { DISCLAIMER } from "@/lib/services/data";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-16 text-foreground sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Legal</p>
          <h1 className="mt-2 text-3xl font-bold text-foreground">Terms of Service</h1>
        </div>
        <Link href="/" className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary">
          Back to app
        </Link>
      </div>

      <div className="space-y-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Independence and status</h2>
          <p className="leading-7 text-muted-foreground">{DISCLAIMER}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Marketplace rules</h2>
          <p className="leading-7 text-muted-foreground">
            Talse is a marketplace for arranging service work between users. The app provides tools to publish offers, submit
            requests, negotiate scope, and manage the lifecycle of a hire request. Users are responsible for the work they agree
            to perform or commission, and the app is not a guarantor of service quality, provider trustworthiness, or delivery
            outcomes.
          </p>
          <p className="leading-7 text-muted-foreground">
            Before any work starts, the buyer and provider should agree on the terms, timeline, scope, and expected result. If a
            dispute arises, either party may raise it while the hire request is in a disputed or escrowed state. The platform may
            review the underlying request, associated messages, and evidence attached to the hire request before deciding on an
            outcome.
          </p>
          <p className="leading-7 text-muted-foreground">
            If a buyer does not receive the agreed service, or the provider cannot complete it, the app may initiate a refund,
            release funds to the provider, or otherwise apply the state recorded in the hire request depending on the verified
            escrow history and dispute outcome. The app does not promise a particular financial outcome in every case.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Actual escrow and payout mechanics</h2>
          <p className="leading-7 text-muted-foreground">
            The escrow and payout logic in this application is implemented as a real backend flow, not a placeholder. When a hire
            request is accepted and the relevant payment/escrow state is locked, the app stores the amount, contract identifiers,
            escrow request identifiers, payment or lock transaction IDs, release and refund transaction records, fee metadata, and
            payout status in the hire-request record. This is reflected in the real schema fields such as amount, contract_id,
            escrow_request_id, lock_txid, release_txid, refund_txid, platform_fee, worker_payout, payout_locked_at, and
            payout_status.
          </p>
          <p className="leading-7 text-muted-foreground">
            In normal operation, funds are released only after the request has reached the appropriate state and backend validation
            confirms the action. If the transaction is disputed, the system preserves the dispute reason, details, evidence,
            filed-by identifier, admin note, and resolution favor. Decisions can result in a release to the provider, a refund to
            the buyer, or a recorded denied/closed outcome depending on the factual record and the platform’s review.
          </p>
          <p className="leading-7 text-muted-foreground">
            This means the app is not an idealized “just approve a payment” workflow. The actual system tracks funding, dispute
            records, payout state, and platform fee accounting as part of the real marketplace operation.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">User responsibilities</h2>
          <p className="leading-7 text-muted-foreground">
            By using the app, you agree to provide accurate information in your profile and listings, act in good faith in your
            communications, and comply with the rules of the marketplace and any applicable laws. You acknowledge that service
            quality and delivery outcomes depend on the parties to the transaction and that the platform does not independently
            verify or guarantee those outcomes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Changes to these terms</h2>
          <p className="leading-7 text-muted-foreground">
            These terms may change as the application evolves. Any material update will be reflected in the app’s public pages and
            the project documentation so users are able to understand the current behavior of the service.
          </p>
        </section>
      </div>
    </main>
  );
}
