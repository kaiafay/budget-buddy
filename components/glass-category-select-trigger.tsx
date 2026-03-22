"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryIcon } from "@/components/category-icons";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

const glassCategorySelectTriggerClassName =
  "h-11 w-full rounded-xl border-white/20 bg-white/10 text-white [&_[data-slot=select-value]_span]:text-white [&_[data-slot=select-value]_svg]:text-white/70 data-[no-category=true]:[&_[data-slot=select-value]_span]:text-white/40 [&>svg]:hidden";

export interface GlassCategorySelectTriggerProps {
  value: string | null;
  noCategoryValue: string;
  onValueChange: (value: string) => void;
  categories: Category[];
  className?: string;
}

export function GlassCategorySelectTrigger({
  value,
  noCategoryValue,
  onValueChange,
  categories,
  className,
}: GlassCategorySelectTriggerProps) {
  return (
    <Select
      value={value ?? noCategoryValue}
      onValueChange={onValueChange}
    >
      <SelectTrigger
        data-no-category={value == null}
        className={cn(glassCategorySelectTriggerClassName, className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="text-popover-foreground">
        <SelectItem value={noCategoryValue}>
          <span className="text-muted-foreground">No category</span>
        </SelectItem>
        {categories.map((cat) => (
          <SelectItem key={cat.id} value={cat.id}>
            <span className="flex items-center gap-2 text-popover-foreground">
              <CategoryIcon
                iconName={cat.icon}
                className="h-4 w-4 text-muted-foreground"
              />
              {cat.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
