import type { Metadata } from "next";
import OrbitMapClient from "./orbit-map-client";

export const metadata: Metadata = { title: "Orbit Map" };

export default function OrbitMapPage() {
  return <OrbitMapClient />;
}
