import React from "react";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { cn } from "../utils";

interface FloatingActionButtonProps {
  onClick: () => void;
  icon?: React.ReactNode;
  label?: string;
  position?: "bottom-right" | "bottom-center";
  className?: string;
  hideOnMobile?: boolean;
}

export function FloatingActionButton({
  onClick,
  icon,
  label,
  position = "bottom-right",
  className,
  hideOnMobile,
}: FloatingActionButtonProps) {
  const positionClasses = {
    "bottom-right": "bottom-20 right-4 md:bottom-8 md:right-8",
    "bottom-center": "bottom-20 left-1/2 -translate-x-1/2 md:bottom-8",
  };

  return (
    <motion.button
      id="tour-fab"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "fixed z-40 items-center justify-center gap-2",
        hideOnMobile ? "hidden md:flex" : "flex",
        "w-14 h-14 md:w-16 md:h-16",
        "rounded-full shadow-2xl",
        "text-white font-bold",
        "hover:brightness-110 transition-all duration-200",
        "focus:outline-none focus:ring-4",
        positionClasses[position],
        className
      )}
      style={{
        backgroundColor: "var(--accent-color)",
        backgroundImage:
          "linear-gradient(135deg, var(--accent-color), color-mix(in srgb, var(--accent-color) 75%, black))",
        ["--tw-ring-color" as string]:
          "color-mix(in srgb, var(--accent-color) 30%, transparent)",
      }}
      aria-label={label || "Adicionar item"}
    >
      {icon || <Plus size={24} />}
      {label && <span className="hidden md:inline text-sm">{label}</span>}
    </motion.button>
  );
}
