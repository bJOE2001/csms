import {
  Coffee,
  LayoutDashboard,
  Grid2X2,
  ReceiptText,
  LogOut,
  ShoppingBag,
  Search,
  ArrowRight,
  Check,
  TriangleAlert,
  X,
  Download,
  Printer,
  Plus,
  Pencil,
  ImageIcon,
  BookOpen,
  Trash2,
  RefreshCw,
  Wallet,
  LibraryBig,
  type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  coffee: Coffee,
  business: LayoutDashboard,
  dashboard: Grid2X2,
  sales: ReceiptText,
  logout: LogOut,
  bag: ShoppingBag,
  search: Search,
  arrow: ArrowRight,
  check: Check,
  alert: TriangleAlert,
  close: X,
  download: Download,
  print: Printer,
  plus: Plus,
  edit: Pencil,
  image: ImageIcon,
  menu: BookOpen,
  delete: Trash2,
  refresh: RefreshCw,
  wallet: Wallet,
  libraries: LibraryBig,
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const Component = icons[name] ?? Grid2X2;
  return (
    <Component
      size={size}
      strokeWidth={1.6}
      aria-hidden="true"
      focusable="false"
    />
  );
}
