import React from "react";
import { ItineraryDocument } from "../../../components/itinerary/ItineraryDocument";

const mockGraph: any = {
  concept: {
    title: "The Golden Triangle Family Adventure",
    narrative:
      "A relaxed pace journey through Delhi, Agra, and Jaipur, designed to balance monumental history with downtime for the family.",
    region_strategy: "",
    route_skeleton: [],
    discarded_alternatives: [],
  },
  route: [
    { node_id: "stop_1", place: { name: "Delhi" }, nights: 2 },
    { node_id: "stop_2", place: { name: "Agra" }, nights: 1 },
    { node_id: "stop_3", place: { name: "Jaipur" }, nights: 3 },
  ],
  days: [
    {
      node_id: "day_1",
      date: "2026-10-10",
      energy_rating: "moderate",
      blocks: [
        {
          node_id: "b1",
          title: "Humayun's Tomb (Early Morning)",
          duration_minutes: 120,
          tags: ["Architecture", "Outdoors"],
        },
        {
          node_id: "b2",
          title: "Qutub Minar Complex",
          duration_minutes: 90,
          tags: ["History"],
        },
      ],
      meals: [
        {
          node_id: "m1",
          type: "lunch",
          venue: "Cafe Lota",
        },
      ],
    },
    {
      node_id: "day_2",
      date: "2026-10-11",
      energy_rating: "full",
      blocks: [
        {
          node_id: "b3",
          title: "Taj Mahal (Sunrise)",
          duration_minutes: 180,
          tags: ["Must-See", "Crowded"],
        },
      ],
      meals: [],
    },
  ],
  legs: [
    {
      node_id: "leg_1",
      mode: "train",
      duration_minutes: 115,
      operator: "Gatimaan Express (12050)",
      booking_channel: { name: "IRCTC", url: "https://irctc.co.in" },
    },
  ],
  budget: {
    total: { amount: "₹45,000", currency: "INR" },
    line_items: [
      { label: "Stays (6 nights)", amount: { amount: "₹24,000" } },
      { label: "Transport (Trains + Cabs)", amount: { amount: "₹8,500" } },
      { label: "Experiences & Food", amount: { amount: "₹12,500" } },
    ],
  },
  risk: [
    {
      node_id: "r1",
      cause: "Train waitlist risk on Gatimaan Express during festival week",
      plan_b_summary: "Book an AC Volvo bus via Yamuna Expressway (₹800/pp, 3.5 hrs)",
    },
  ],
  pretrip: [
    { node_id: "pt1", label: "Book Gatimaan Express tickets", due: "2026-06-12" },
    { node_id: "pt2", label: "Buy Taj Mahal tickets online to skip queues", due: "2026-09-10" },
  ],
  packing: {
    items: [
      { label: "Comfortable walking shoes" },
      { label: "Sunscreen & sunglasses" },
      { label: "Power bank" },
    ],
  },
};

export default function DevItineraryPage() {
  return (
    <main className="bg-background min-h-screen">
      <ItineraryDocument graph={mockGraph} />
    </main>
  );
}
