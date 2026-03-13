"use client";

import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Banknote,
  Bike,
  Book,
  Briefcase,
  Bus,
  Car,
  Cat,
  Coffee,
  CreditCard,
  DollarSign,
  Dog,
  FileText,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  Heart,
  Home,
  Laptop,
  Music,
  Package,
  Phone,
  PiggyBank,
  Plane,
  Receipt,
  Shirt,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Stethoscope,
  Tag,
  Ticket,
  Train,
  Users,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Zap,
} from "lucide-react";

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  Baby,
  Banknote,
  Bike,
  Book,
  Briefcase,
  Bus,
  Car,
  Cat,
  Coffee,
  CreditCard,
  DollarSign,
  Dog,
  FileText,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  Heart,
  Home,
  Laptop,
  Music,
  Package,
  Phone,
  PiggyBank,
  Plane,
  Receipt,
  Shirt,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Stethoscope,
  Tag,
  Ticket,
  Train,
  Users,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Zap,
};

const FALLBACK_ICON = Tag;

export function CategoryIcon({
  iconName,
  className,
}: {
  iconName: string;
  className?: string;
}) {
  const Icon = CATEGORY_ICON_MAP[iconName] ?? FALLBACK_ICON;
  return <Icon className={className} />;
}

export const ALLOWED_CATEGORY_ICON_NAMES = Object.keys(
  CATEGORY_ICON_MAP
).sort() as readonly string[];
