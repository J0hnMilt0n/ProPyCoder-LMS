"use client";

import { useState } from "react";

interface InstructorAvatarProps {
  avatar: string | null;
  firstName: string;
  lastName: string;
  className?: string;
}

function initialsOf(firstName: string, lastName: string) {
  const a = firstName?.trim()?.[0] ?? "";
  const b = lastName?.trim()?.[0] ?? "";
  return (a + b || "P").toUpperCase().slice(0, 2);
}

export function InstructorAvatar({
  avatar,
  firstName,
  lastName,
  className,
}: InstructorAvatarProps) {
  const [failed, setFailed] = useState(false);
  const initials = initialsOf(firstName, lastName);

  if (!avatar || failed) {
    return <span className={className}>{initials}</span>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={avatar}
      alt={`${firstName} ${lastName}`}
      onError={() => setFailed(true)}
    />
  );
}
