-- Prevent a price validity period from ending at or before it starts.
ALTER TABLE "ProductPrice"
ADD CONSTRAINT "ProductPrice_valid_period"
CHECK ("validTo" IS NULL OR "validTo" > "validFrom");
