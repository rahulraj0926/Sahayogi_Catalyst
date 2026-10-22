-- CreateTable
CREATE TABLE "PortfolioMeta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "reg" JSONB NOT NULL,
    CONSTRAINT "PortfolioMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "entry" JSONB NOT NULL,
    "meta" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "counters" JSONB NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "productId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT,
    "title" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    CONSTRAINT "Item_pkey" PRIMARY KEY ("productId","id")
);

-- CreateTable
CREATE TABLE "Link" (
    "productId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'valid',
    "data" JSONB NOT NULL,
    CONSTRAINT "Link_pkey" PRIMARY KEY ("productId","id")
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "seq" BIGSERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subject" TEXT,
    "actor" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Item_productId_type_idx" ON "Item"("productId", "type");
CREATE INDEX "Item_productId_phase_idx" ON "Item"("productId", "phase");
CREATE INDEX "Link_productId_source_idx" ON "Link"("productId", "source");
CREATE INDEX "Link_productId_target_idx" ON "Link"("productId", "target");
CREATE INDEX "AuditEntry_productId_seq_idx" ON "AuditEntry"("productId", "seq");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Link" ADD CONSTRAINT "Link_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
