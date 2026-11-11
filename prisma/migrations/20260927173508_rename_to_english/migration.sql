/*
  Warnings:

  - You are about to drop the `Proyecto` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Usuario` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DESIGNER', 'REGULATORY', 'PRINTER');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('PACKAGING', 'OFFLINE_MATERIAL', 'DIGITAL_MATERIAL');

-- CreateEnum
CREATE TYPE "ProjectPhase" AS ENUM ('DESIGN', 'REVIEW', 'APPROVED');

-- DropTable
DROP TABLE "Proyecto";

-- DropTable
DROP TABLE "Usuario";

-- DropEnum
DROP TYPE "FaseProyecto";

-- DropEnum
DROP TYPE "Rol";

-- DropEnum
DROP TYPE "TipoProyecto";

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProjectType" NOT NULL,
    "phase" "ProjectPhase" NOT NULL DEFAULT 'DESIGN',
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
