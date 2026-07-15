import React from "react";
import { db } from "@/lib/db";
import { listTripsByOwner } from "@raah/db";
import Link from "next/link";
// In a real app, import { auth } from "@/auth" and get user id

export default async function TripsDashboardPage() {
  // Mocking auth session for now
  const mockUserId = "00000000-0000-0000-0000-000000000000";

  const userTrips = await listTripsByOwner(db, mockUserId);

  return (
    <div className="max-w-5xl mx-auto p-6 mt-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-primary)]">My Trips</h1>
        <Link
          href="/plan/new"
          className="px-4 py-2 bg-[var(--color-secondary)] text-[var(--color-primary)] font-medium rounded hover:bg-opacity-90"
        >
          Plan New Trip
        </Link>
      </div>

      {userTrips.length === 0 ? (
        <div className="bg-gray-50 border rounded-lg p-12 text-center text-gray-500">
          <p className="mb-4">You have no trips planned yet.</p>
          <Link href="/plan/new" className="text-[var(--color-primary)] underline">
            Start planning your first adventure
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {userTrips.map((trip) => (
            <Link
              key={trip.id}
              href={`/trip/${trip.id}`}
              className="border rounded-xl p-5 hover:shadow-lg transition-shadow bg-white flex flex-col justify-between group"
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-lg text-gray-800 group-hover:text-[var(--color-primary)] transition-colors">
                    {trip.title || "Untitled Trip"}
                  </h3>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      trip.status === "active"
                        ? "bg-green-100 text-green-700"
                        : trip.status === "generating"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {trip.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Created{" "}
                  {new Date(trip.createdAt).toLocaleDateString("en-IN", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="text-[var(--color-primary)] font-medium text-sm flex items-center">
                View Itinerary &rarr;
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
