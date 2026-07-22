import React from "react";
import { cn } from "../utils";

export const Card = ({ children, className, onClick, id }: { children: React.ReactNode; className?: string; onClick?: () => void; id?: string }) => (
  <div
    id={id}
    className={cn(
      "rounded-3xl p-6 bg-[var(--card-bg,#fff)] transition-all duration-200",
      className
    )}
    style={{ boxShadow: "var(--card-shadow, 0 1px 4px 0 rgba(0,0,0,0.07))" }}
    onClick={onClick}
  >
    {children}
  </div>
);

