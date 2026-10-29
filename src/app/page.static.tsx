import FormaApp from "@/components/forma-app";
import { buildDemo } from "@/lib/demo";

// The browser replaces this initial state with its own saved profile on load.
export default function StaticHomePage() {
  return <FormaApp initialData={buildDemo("local")} />;
}
