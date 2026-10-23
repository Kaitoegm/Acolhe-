"use client";
import { useParams } from "next/navigation";
import { CaseEditor } from "@/components/instructor/case-editor";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <CaseEditor key={id} caseId={id} />;
}
