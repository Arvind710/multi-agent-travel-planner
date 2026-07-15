import React from "react";
import { db } from "@/lib/db";
import { listTravellerProfiles } from "@raah/db";
// In a real app, import { auth } from "@/auth"

export default async function ProfilePersonasPage() {
  const mockUserId = "00000000-0000-0000-0000-000000000000";

  const profiles = await listTravellerProfiles(db, mockUserId);

  return (
    <div className="max-w-4xl mx-auto p-6 mt-8">
      <h1 className="text-3xl font-bold text-[var(--color-primary)] mb-2">My Travel Personas</h1>
      <p className="text-gray-600 mb-8">Manage your different travel styles and preferences.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {profiles.length > 0 ? (
          profiles.map((p) => (
            <div
              key={p.id}
              className="border rounded-xl p-6 bg-white shadow-sm hover:shadow transition-shadow"
            >
              <h3 className="font-semibold text-xl text-gray-800 mb-4 capitalize">
                {p.label === "default" ? "Primary Persona" : p.label}
              </h3>

              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-500 block mb-1">Pace Preference</span>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-[var(--color-primary)] h-2 rounded-full"
                      style={{ width: `${((p.profile as any).pace || 0.5) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* Display some high level tags if available */}
                <div>
                  <span className="text-gray-500 block mb-1">Interests</span>
                  <div className="flex flex-wrap gap-2">
                    {["history", "food", "nature", "shopping"].map((tag) => (
                      <span
                        key={tag}
                        className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t flex justify-end">
                <button className="text-[var(--color-primary)] font-medium text-sm hover:underline">
                  Edit Preferences
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-2 text-center py-12 bg-gray-50 rounded-lg border border-dashed">
            <p className="text-gray-500">
              No personas found. They will be created automatically as you plan trips.
            </p>
          </div>
        )}

        <button className="border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors min-h-[250px]">
          <span className="text-3xl mb-2">+</span>
          <span className="font-medium">Create New Persona</span>
          <span className="text-sm mt-1">e.g. "Family Mode", "Solo Adventure"</span>
        </button>
      </div>
    </div>
  );
}
