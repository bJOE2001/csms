import type { HTMLAttributes, ReactNode } from "react";
import {
  Card as ShadcnCard,
  CardHeader as ShadcnCardHeader,
  CardDescription,
} from "./primitives/card";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <ShadcnCard {...props} className={cn("panel ui-card p-6", className)}>
      {children}
    </ShadcnCard>
  );
}
export function CardHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <ShadcnCardHeader className="card-heading flex-row space-y-0 p-0">
      <div>
        <h2>{title}</h2>
        {description && (
          <CardDescription className="hint">{description}</CardDescription>
        )}
      </div>
      {actions && <div className="section-actions">{actions}</div>}
    </ShadcnCardHeader>
  );
}
export function SummaryCards({
  items,
}: {
  items: {
    label: string;
    value: string | number;
    hint?: string;
    detail?: string;
  }[];
}) {
  return (
    <div className="crud-summary">
      {items.map((item) => (
        <Card key={item.label}>
          <p className="metric-label">{item.label}</p>
          <p className="business-amount">{item.value}</p>
          {item.detail && <p className="metric-detail">{item.detail}</p>}
          {item.hint && <p className="hint">{item.hint}</p>}
        </Card>
      ))}
    </div>
  );
}
