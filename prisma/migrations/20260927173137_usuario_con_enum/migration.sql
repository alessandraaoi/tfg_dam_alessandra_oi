/*
  Warnings:

  - Changed the type of `rol` on the `Usuario` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('DISENADOR', 'REGULATORY', 'IMPRESOR');

-- CreateEnum
CREATE TYPE "TipoProyecto" AS ENUM ('PACKAGING', 'MATERIAL_OFFLINE', 'MATERIAL_DIGITAL');

-- CreateEnum
CREATE TYPE "FaseProyecto" AS ENUM ('DISENO', 'REVISION', 'APROBADO');

-- AlterTable
ALTER TABLE "Usuario" DROP COLUMN "rol",
ADD COLUMN     "rol" "Rol" NOT NULL;

-- CreateTable
CREATE TABLE "Proyecto" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoProyecto" NOT NULL,
    "fase" "FaseProyecto" NOT NULL DEFAULT 'DISENO',
    "archivoUrl" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proyecto_pkey" PRIMARY KEY ("id")
);
