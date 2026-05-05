export const metadata = {
  title: "Legal Statement | Kiamina Accounting Services",
  description:
    "Read the legal statement governing the use of Kiamina Accounting Services website, including terms of use, disclaimers, and limitations of liability.",
};

export default function LegalPage() {
  return (
    <main>
      <section className="relative overflow-hidden bg-[#073D7F] py-24 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(100,145,222,0.16),transparent_28%),radial-gradient(circle_at_left,rgba(255,255,255,0.06),transparent_20%)]" />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-4xl">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6491DE]">
              Legal Statement
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Terms governing the use of this website.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-blue-100">
              This legal statement outlines the terms, conditions, and limitations applicable to the use of the Kiamina Accounting Services website and its content.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20 lg:px-8">
        <div className="rounded-[2rem] border border-[#D9E3F4] bg-white p-8 shadow-sm lg:p-10">
          <div className="space-y-10 text-slate-600">
            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                1. Use of this website
              </h2>
              <p className="mt-4 leading-8">
                By accessing this website, you agree to use it only for lawful purposes and in a manner consistent with applicable regulations and professional standards.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                2. No professional advice
              </h2>
              <p className="mt-4 leading-8">
                Content on this website is provided for general information purposes only and does not constitute accounting, tax, legal, or financial advice. Professional advice should be obtained before taking action based on any information provided.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                3. Limitation of liability
              </h2>
              <p className="mt-4 leading-8">
                Kiamina Accounting Services is not liable for any direct, indirect, incidental, or consequential loss arising from the use of this website or reliance on its content.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                4. External links
              </h2>
              <p className="mt-4 leading-8">
                This website may include links to third-party platforms. We are not responsible for the content, policies, or practices of those external websites.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                5. Intellectual property
              </h2>
              <p className="mt-4 leading-8">
                All content on this website, including text, design, graphics, and branding, is the property of Kiamina Accounting Services unless otherwise stated. Unauthorized use, reproduction, or distribution is prohibited.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                6. Changes to this statement
              </h2>
              <p className="mt-4 leading-8">
                We may update this legal statement periodically. Continued use of the website indicates acceptance of any changes made.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-950">
                7. Contact
              </h2>
              <p className="mt-4 leading-8">
                For questions regarding this legal statement, please contact Kiamina Accounting Services at info@kiaminaaccounting.com.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}