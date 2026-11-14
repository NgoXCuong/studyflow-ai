import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function PageHeader({ eyebrow, title, description, icon: Icon, actions }: {
  eyebrow: ReactNode;
  title: string;
  description: ReactNode;
  icon: LucideIcon;
  actions?: ReactNode;
}) {
  return <header className="relative flex min-w-0 flex-wrap items-start justify-between gap-5 overflow-hidden rounded-2xl border bg-muted/40 p-5 sm:p-7">
    <div className="flex min-w-0 flex-1 basis-80 gap-4">
      <span className="hidden size-12 shrink-0 items-center justify-center rounded-2xl border bg-card text-primary sm:flex"><Icon className="size-6" aria-hidden="true" /></span>
      <div className="min-w-0 space-y-2">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-heading break-words">{title}</h1>
        <div className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</div>
      </div>
    </div>
    {actions && <div className="flex max-w-full flex-wrap items-center gap-2 sm:self-center">{actions}</div>}
  </header>;
}
