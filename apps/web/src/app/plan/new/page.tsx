"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PromptCanvas } from "@/components/intake/PromptCanvas";
import { UnderstandingEcho } from "@/components/intake/UnderstandingEcho";
import { ClarifierCard } from "@/components/intake/ClarifierCard";
import { AgentProgressRail } from "@/components/intake/AgentProgressRail";
import { emptyProfile, type TravellerProfile } from "@raah/shared/profile";

type Step = "prompt" | "clarify" | "generating";

const mockProfile: TravellerProfile = emptyProfile();
mockProfile.party.adults = 2;
mockProfile.trip.duration_nights = 10;

export default function NewPlanPage() {
  const [step, setStep] = useState<Step>("prompt");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handlePromptSubmit = (_prompt: string) => {
    setIsLoading(true);
    // Mock processing delay
    setTimeout(() => {
      setIsLoading(false);
      setStep("clarify");
    }, 1500);
  };

  const handleClarifierAnswer = () => {
    setStep("generating");
    // Mock generation delay then redirect
    setTimeout(() => {
      router.push("/trip/mock-trip-123");
    }, 3000);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 mt-8 space-y-8">
      <h1 className="text-3xl font-bold text-center mb-8">Plan your adventure</h1>

      {step === "prompt" && <PromptCanvas onSubmit={handlePromptSubmit} isLoading={isLoading} />}

      {step === "clarify" && (
        <div className="space-y-6">
          <UnderstandingEcho profile={mockProfile} />
          <ClarifierCard
            clarifier={{
              id: "c1",
              question: "Will you need a rented vehicle or prefer trains?",
              options: ["Rental car", "Trains"],
              asked_because: "Because you are traveling across regions.",
            }}
            onAnswer={handleClarifierAnswer}
          />
        </div>
      )}

      {step === "generating" && (
        <div className="py-12">
          <AgentProgressRail status="generating_plan" />
        </div>
      )}
    </div>
  );
}
