import { setDefaultResultOrder } from "node:dns";
import { PrismaClient } from "@prisma/client";

// Neon (and similar) can resolve IPv6 first; broken local IPv6 routing yields P1001.
// This applies to the whole Node process (including Turbopack-isolated route chunks).
setDefaultResultOrder("ipv4first");

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }

  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
  set(_target, property, value, receiver) {
    return Reflect.set(getPrismaClient(), property, value, receiver);
  },
});
