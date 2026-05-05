export const metadata = {
  title: "Privacy Statement | Kiamina Accounting Services",
  description:
    "Read the Kiamina Accounting Services privacy statement covering information collection, use, confidentiality, data sharing, security, and contact details.",
};

export default function PrivacyPage() {
  return (
    <main>
      <section className="relative overflow-hidden bg-[#073D7F] py-24 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(100,145,222,0.16),transparent_28%),radial-gradient(circle_at_left,rgba(255,255,255,0.06),transparent_20%)]" />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-4xl">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">
              Privacy Statement
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Privacy and data handling at Kiamina Accounting Services.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-blue-100">
              We are committed to protecting personal and business information shared with us through our website, communications, and service relationships.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20 lg:px-8">
        <div className="rounded-[2rem] border border-[#D9E3F4] bg-white p-8 shadow-sm lg:p-10">
          <div className="space-y-10 text-slate-600">
            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                1. Information we collect
              </h2>
              <p className="mt-4 leading-8">
                We may collect personal and business information that you provide directly, including your name, email address, phone number, company details, and any information submitted through consultation, contact, or subscription forms.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                2. How we use information
              </h2>
              <p className="mt-4 leading-8">
                We use submitted information to respond to enquiries, provide requested services, communicate updates, manage client relationships, improve service delivery, and maintain internal records.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                3. Confidentiality
              </h2>
              <p className="mt-4 leading-8">
                We treat client and prospective client information with care and take reasonable steps to protect confidential financial, operational, and personal data shared with us.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                4. Data sharing
              </h2>
              <p className="mt-4 leading-8">
                We do not sell personal information. Information may be shared only where necessary for service delivery, compliance, professional obligations, lawful requests, or approved third-party tools supporting our operations.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                5. Data security
              </h2>
              <p className="mt-4 leading-8">
                We apply reasonable administrative, technical, and operational safeguards to help protect information against unauthorized access, misuse, alteration, or disclosure.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                6. Third-party tools
              </h2>
              <p className="mt-4 leading-8">
                Our website may use third-party platforms for scheduling, subscriptions, analytics, communications, or embedded services. Those providers may process data in line with their own privacy terms.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                7. Your choices
              </h2>
              <p className="mt-4 leading-8">
                You may contact us to update information you have submitted, ask questions about how your information is used, or request removal from marketing communications where applicable.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                8. Contact
              </h2>
              <p className="mt-4 leading-8">
                For privacy-related questions, please contact Kiamina Accounting Services at info@kiaminaaccounting.com.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}