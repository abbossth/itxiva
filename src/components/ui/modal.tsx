"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { cn } from "@/lib/utils";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
  maxWidth = "lg",
}: ModalProps) {
  const maxWClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(maxWClasses[maxWidth], className)}>
        {title && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}
        <div className="pt-2">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
