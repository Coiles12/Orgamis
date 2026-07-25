"use client";

import { X } from "lucide-react";
import { ReactNode } from "react";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-full sm:max-w-2xl max-h-[90vh] rounded-md border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 sm:p-8 overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-4 flex-shrink-0">
          <h2 className="text-xl sm:text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-zinc-500 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-6 overflow-y-auto overflow-x-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
