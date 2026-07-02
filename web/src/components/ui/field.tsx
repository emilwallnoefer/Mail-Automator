import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

/** Shared form-control chrome (the app's standard input/select/textarea look). */
const FIELD_CHROME = "w-full rounded-lg border border-glass/15 bg-glass/10 px-3 py-2 text-sm";

export function Input({ className, ...props }: ComponentPropsWithRef<"input">) {
  return <input className={cn(FIELD_CHROME, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentPropsWithRef<"select">) {
  return <select className={cn(FIELD_CHROME, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithRef<"textarea">) {
  return <textarea className={cn(FIELD_CHROME, className)} {...props} />;
}
