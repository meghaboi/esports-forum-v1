import React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "danger" | "warning" | "outline";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variants = {
    default: "bg-border text-foreground",
    success: "bg-accent-green/20 text-accent-green border border-accent-green/50",
    danger: "bg-accent-red/20 text-accent-red border border-accent-red/50",
    warning: "bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/50",
    outline: "border border-border text-foreground",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-none px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
