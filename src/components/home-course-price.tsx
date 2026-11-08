"use client";

import { useSession } from "next-auth/react";
import { PriceTag } from "@/components/price-tag";
import { useResource } from "@/lib/use-resource";

interface HomeCoursePriceProps {
  courseId: string;
  price: number;
  offerPrice: number | null;
}

export function HomeCoursePrice({
  courseId,
  price,
  offerPrice,
}: HomeCoursePriceProps) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const purchases = useResource<string[]>({
    key: "home-purchased-courses",
    url: "/api/enrollments/purchased",
    scope: userId ?? "",
    enabled: status === "authenticated" && Boolean(userId),
    select: (json) => (json as { courseIds?: string[] }).courseIds ?? [],
  });

  if (purchases.data?.includes(courseId)) {
    return <span className="purchased-pill">Purchased</span>;
  }

  return <PriceTag price={price} offerPrice={offerPrice} />;
}
