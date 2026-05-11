import { cn } from "../../utils";

interface OnboardingProgressProps {
  current: number;
  total: number;
  className?: string;
}

export function OnboardingProgress({ current, total, className }: OnboardingProgressProps) {
  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      {Array.from({ length: total }).map((_, index) => {
        const isActive = index === current;
        return (
          <span
            key={index}
            className={cn(
              "h-2 rounded-full transition-all duration-200",
              isActive ? "w-8 bg-[#2F66F2]" : "w-2 bg-[#C8CEDD]"
            )}
          />
        );
      })}
    </div>
  );
}
