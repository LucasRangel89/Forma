import { cookies } from "next/headers";
import FormaApp from "@/components/forma-app";
import { buildDemo } from "@/lib/demo";
import { initializeProfile, readAppData } from "@/lib/store";

export const dynamic = "force-dynamic";
export default async function HomePage() {
  let data = buildDemo();
  const owner = (await cookies()).get("forma-profile")?.value;
  if (owner && /^[a-f0-9-]{36}$/.test(owner)) {
    try { await initializeProfile(owner); data = await readAppData(owner); }
    catch (error) { console.error("Perfil será sincronizado no cliente", error); }
  }
  return <FormaApp initialData={data} />;
}
