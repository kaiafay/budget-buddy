import {
  Banknote,
  Home,
  Tv,
  ShoppingCart,
  Zap,
  UtensilsCrossed,
  Laptop,
  Car,
  Heart,
  ShoppingBag,
  Shield,
  FileText,
  CircleDollarSign,
} from "lucide-react"
import { cn } from "@/lib/utils"

const iconMap: Record<string, React.ElementType> = {
  Banknote,
  Home,
  Tv,
  ShoppingCart,
  Zap,
  UtensilsCrossed,
  Laptop,
  Car,
  Heart,
  ShoppingBag,
  Shield,
  FileText,
}

const categoryColors: Record<string, string> = {
  salary: "bg-[#DCFCE7] text-[#16A34A]",
  housing: "bg-[#DBEAFE] text-[#2563EB]",
  entertainment: "bg-[#F3E8FF] text-[#9333EA]",
  groceries: "bg-[#FEF3C7] text-[#D97706]",
  utilities: "bg-[#FEE2E2] text-[#DC2626]",
  food: "bg-[#FFEDD5] text-[#EA580C]",
  freelance: "bg-[#DCFCE7] text-[#16A34A]",
  transport: "bg-[#E0E7FF] text-[#4F46E5]",
  health: "bg-[#FCE7F3] text-[#DB2777]",
  shopping: "bg-[#FEF3C7] text-[#D97706]",
  insurance: "bg-[#DBEAFE] text-[#2563EB]",
  services: "bg-[#F3F4F6] text-[#6B7280]",
}

import { categoryIcons } from "@/lib/mock-data"

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const iconName = categoryIcons[category] || "CircleDollarSign"
  const Icon = iconMap[iconName] || CircleDollarSign
  const colorClass = categoryColors[category] || "bg-muted text-muted-foreground"

  return (
    <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", colorClass, className)}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </div>
  )
}
