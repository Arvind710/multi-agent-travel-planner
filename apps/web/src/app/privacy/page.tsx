import React from "react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-12">
      <div className="max-w-3xl mx-auto px-4 bg-white p-8 rounded-xl shadow-sm border">
        <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <div className="space-y-6 text-gray-700">
          <section>
            <h2 className="text-xl font-semibold mb-2">1. Your Data, Your Control</h2>
            <p>
              We believe in transparency. Raah collects only what is necessary to plan your trips.
              Sensitive fields in your profile are encrypted at rest using field-level encryption.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">2. Zero Retention with AI Models</h2>
            <p>
              We use third-party LLMs to generate your itinerary, but we have configured our APIs
              for
              <strong> zero retention</strong>. This means your data is not used to train their
              models.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">3. Hard Deletion</h2>
            <p>
              When you delete your account, we perform a hard delete. Within 30 days, all traces of
              your data, including AI generation traces in Langfuse and itinerary exports in our
              object storage, are permanently removed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">4. Contact Us</h2>
            <p>For security or privacy concerns, please email security@raah.example.com.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
