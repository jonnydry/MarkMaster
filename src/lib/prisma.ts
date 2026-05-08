import { setDefaultResultOrder } from "node:dns";
import { PrismaClient } from "@prisma/client";

// Neon (and similar) can resolve IPv6 first; broken local IPv6 routing yields P1001.
// This applies to the whole Node process (including Turbopack-isolated route chunks).
setDefaultResultOrder("ipv4first");

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
