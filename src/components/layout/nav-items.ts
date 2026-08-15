import {
  BarChart3,
  Bell,
  CalendarDays,
  LayoutGrid,
  LineChart,
  Radar,
  Settings,
  Star,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutGrid },
  { label: "Scanner", href: "/scanner", icon: Radar },
  { label: "Fixtures", href: "/fixtures", icon: CalendarDays },
  { label: "Mouvements de cotes", href: "/mouvements", icon: LineChart },
  { label: "Alerts", href: "/alerts", icon: Bell },
  { label: "Watchlist", href: "/watchlist", icon: Star },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
];

export const SECONDARY_NAV: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Account", href: "/account", icon: UserCircle },
];
