import type { Metadata } from "next";
import OrbitClient from "./orbit-client";

export const metadata: Metadata = { title: "Orbit Review" };

export default function OrbitPage() {
  return <OrbitClient />;
}
