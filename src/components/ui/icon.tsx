const paths: Record<string, string[]> = {
  coffee: ["M4 8h12v6a6 6 0 0 1-12 0V8Z", "M16 8h2a3 3 0 1 1 0 6h-2", "M7 3v2m4-2v2M3 21h15"],
  dashboard: ["M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"],
  pos: ["M4 3h16v12H4zM8 21h8m-4-6v6M8 7h8m-8 4h4"],
  orders: ["M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 4h6m-6 4h6m-6 4h3"],
  shifts: ["M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm0 4v5l3 2"],
  menu: ["M5 3h14v18H5zM8 7h8m-8 5h8m-8 5h5"],
  recipes: ["M8 3v6l-4 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-4-9V3M6 3h12M7 15h10"],
  inventory: ["m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8m-9 5v9M7.5 5.5l9 5"],
  purchases: ["M3 4h2l3 12h11l2-8H6m3 12h.01M18 20h.01"],
  expenses: ["M3 6h18v14H3zM3 10h18M7 15h4M6 6V3h12v3"],
  funding: ["M12 3 2 8h20L12 3ZM4 11v7m5-7v7m6-7v7m5-7v7M2 21h20"],
  budgets: ["M6 3h12v18H6zM9 7h6m-6 4h1m4 0h1m-6 4h1m4 0h1"],
  reports: ["M4 3v18h17M8 16v-5m5 5V6m5 10v-8"],
  staff: ["M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10v-3a6 6 0 0 1 12 0v3m3-16a4 4 0 0 1 0 8m1 3a5 5 0 0 1 4 5"],
  settings: ["M4 7h16M4 17h16M8 4v6m8 4v6"],
  audit: ["M12 3a9 9 0 1 1-8 5M3 3v6h6m3-2v5l3 2"],
  search: ["M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6"],
  arrow: ["M4 12h16m-6-6 6 6-6 6"],
  check: ["m5 12 4 4L19 6"],
  close: ["m6 6 12 12M6 18 18 6"],
  navigation: ["M4 6h16M4 12h16M4 18h16"],
  logout: ["M10 4H4v16h6m4-4 4-4-4-4m-5 4h12"],
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{(paths[name] ?? paths.dashboard).map((path, index) => <path key={index} d={path} />)}</svg>;
}
