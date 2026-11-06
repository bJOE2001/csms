import { VisitSection } from "@/components/site/visit-section";
import { visitDetails } from "@/lib/site/config";
import { publicMetadata } from "@/lib/site/seo";

export const metadata = publicMetadata("Visit Us — LOGO, Carmen", `Find LOGO at ${visitDetails().address}. Opening hours: ${visitDetails().hours}. Plan your next coffee stop and get directions.`, "/visit");
export default function VisitPage() { return <VisitSection standalone visit={visitDetails()} />; }
