import React from "react";
import { cn } from "../utils";

export const Card = ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <div className={cn("rounded-2xl border shadow-sm p-6 bg-[var(--card-bg,#fff)] border-[var(--card-border,#e4e4e7)] transition-all duration-200", className)} onClick={onClick}>{children}</div>
);
