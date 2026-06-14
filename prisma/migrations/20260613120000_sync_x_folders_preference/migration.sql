-- AlterTable
ALTER TABLE "User" ADD COLUMN "syncXFolders" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SyncRun" ADD COLUMN "includeFolders" BOOLEAN NOT NULL DEFAULT false;
