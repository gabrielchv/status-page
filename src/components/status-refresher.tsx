"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function StatusRefresher({ slug }: { slug: string }) {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource(`/api/status/${slug}/events`);

    source.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "check") {
          router.refresh();
        }
      } catch {
        // ignore malformed frames
      }
    };

    return () => source.close();
  }, [slug, router]);

  return null;
}
