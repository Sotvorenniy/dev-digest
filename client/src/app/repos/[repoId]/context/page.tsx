"use client";

import { useParams } from "next/navigation";
import { ContextView } from "./_components/ContextView";

export default function ContextPage() {
  const params = useParams<{ repoId: string }>();
  return <ContextView repoId={params.repoId} />;
}
