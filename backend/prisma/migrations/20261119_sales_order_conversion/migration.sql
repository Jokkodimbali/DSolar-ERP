-- Un devis ne doit produire qu'une seule commande, y compris en cas de concurrence.
CREATE UNIQUE INDEX IF NOT EXISTS "SalesOrder_proformaId_key" ON "SalesOrder" ("proformaId");
