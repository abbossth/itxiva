"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./dialog";
import { Button } from "./button";
import { Input } from "./input";
import { AlertTriangle } from "lucide-react";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  confirmMatchString?: string;
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Tasdiqlash",
  cancelText = "Bekor qilish",
  danger = false,
  confirmMatchString,
  isLoading = false,
}: ConfirmDialogProps) {
  const [matchInput, setMatchInput] = React.useState("");

  const handleClose = () => {
    setMatchInput("");
    onClose();
  };

  const isMatchValid = !confirmMatchString || matchInput.trim() === confirmMatchString.trim();

  const handleConfirm = async () => {
    if (!isMatchValid || isLoading) return;
    await onConfirm();
    setMatchInput("");
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isLoading) {
          handleClose();
        }
      }}
    >
      <DialogContent key={String(isOpen)} className="max-w-md p-6">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            {danger && (
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
            )}
            <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              {title}
            </DialogTitle>
          </div>
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {description}
          </div>
        </DialogHeader>

        {confirmMatchString && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Tasdiqlash uchun{" "}
              <span className="font-mono text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded-md select-all">
                {confirmMatchString}
              </span>{" "}
              so&apos;zini kiriting:
            </p>
            <Input
              value={matchInput}
              onChange={(e) => setMatchInput(e.target.value)}
              placeholder={confirmMatchString}
              disabled={isLoading}
              className="font-mono text-xs"
            />
          </div>
        )}

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={danger ? "destructive" : "primary"}
            onClick={handleConfirm}
            disabled={!isMatchValid || isLoading}
            isLoading={isLoading}
            className="w-full sm:w-auto font-semibold"
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
