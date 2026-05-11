import type { ReactNode } from "react";
import { cn } from "../../utils";

interface OnboardingShellProps {
  children: ReactNode;
  className?: string;
}

export function OnboardingShell({ children, className }: OnboardingShellProps) {
  return (
    <div className="min-h-screen bg-white px-6 py-8 text-[#10233F]">
      <div className={cn("mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[390px] flex-col", className)}>
        {children}
      </div>
    </div>
  );
}
