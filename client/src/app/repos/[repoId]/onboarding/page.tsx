"use client";

import { useParams } from "next/navigation";
import { OnboardingView } from "./_components/OnboardingView";

export default function OnboardingTourPage() {
  const params = useParams<{ repoId: string }>();
  return <OnboardingView repoId={params.repoId} />;
}
