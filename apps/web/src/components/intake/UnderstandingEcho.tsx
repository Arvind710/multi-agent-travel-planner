"use client";

import { TravellerProfile } from "@raah/shared/profile";

interface UnderstandingEchoProps {
  profile: TravellerProfile;
}

export function UnderstandingEcho({ profile }: UnderstandingEchoProps) {
  // Simple rendering of the profile
  return (
    <div className="p-4 border rounded-lg shadow-sm bg-blue-50">
      <h3 className="font-semibold text-blue-900 mb-2">Here is what we understand:</h3>
      <ul className="text-sm space-y-1 text-blue-800">
        <li>
          <strong>Party:</strong> {profile.party.adults} Adults
        </li>
        {profile.trip.duration_nights && (
          <li>
            <strong>Duration:</strong> {profile.trip.duration_nights} nights
          </li>
        )}
        {profile.budget.tier && (
          <li>
            <strong>Budget:</strong> {profile.budget.tier}
          </li>
        )}
        {/* Render more fields as needed */}
      </ul>
    </div>
  );
}
