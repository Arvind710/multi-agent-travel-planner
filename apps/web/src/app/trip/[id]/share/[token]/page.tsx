import React from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getShareLink, listTripComments, loadPlanGraph } from "@raah/db";
import { ItineraryDocument } from "@/components/itinerary/ItineraryDocument";

export default async function SharedTripPage({
  params,
}: {
  params: { id: string; token: string };
}) {
  const link = await getShareLink(db, params.token);

  if (!link || link.tripId !== params.id) {
    return notFound();
  }

  if (link.expiresAt && link.expiresAt < new Date()) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded shadow">
          <h1 className="text-2xl font-semibold mb-2 text-red-600">Link Expired</h1>
          <p className="text-gray-600">This share link is no longer valid.</p>
        </div>
      </div>
    );
  }

  const loaded = await loadPlanGraph(db, link.tripId).catch(() => null);
  if (!loaded) return notFound();
  const graph = loaded.graph;

  const _tripComments = await listTripComments(db, link.tripId);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white border-b sticky top-0 z-10 p-4 flex justify-between items-center shadow-sm">
        <div>
          <h1 className="font-semibold text-lg text-[var(--color-primary)]">Raah Shared Plan</h1>
          <p className="text-sm text-gray-500">
            Read-only view{link.permissions === "comment" ? " (Commenting enabled)" : ""}
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{graph.concept.title}</h1>
          <p className="text-gray-600 italic">{graph.concept.narrative}</p>
        </div>

        <ItineraryDocument graph={graph as any} />
      </main>

      {/* A floating or sidebar comment section would go here in a real app,
          using the tripComments data to render block-level comments. */}
    </div>
  );
}
