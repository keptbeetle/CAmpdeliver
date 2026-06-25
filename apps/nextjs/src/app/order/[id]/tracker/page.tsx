"use client";

import { use } from "react";
import dynamic from "next/dynamic";

const TrackerView = dynamic(() => import("./_components/TrackerView"), {
  ssr: false,
});

export default function TrackerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <div className="flex h-screen flex-col bg-zinc-950">
      <TrackerView orderId={id} />
    </div>
  );
}
