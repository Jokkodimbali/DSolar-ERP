-- Add the only operational staff role besides ADMIN (super administrator).
-- Preserve existing users and historical role records; deprecated roles confer no permissions in the API.
INSERT INTO "Role" ("id", "code", "name")
VALUES (gen_random_uuid(), 'MAGASINIER', 'Magasinier')
ON CONFLICT ("code") DO NOTHING;

-- Storekeepers can manage stock and read catalogue/store metadata within their store scope.
-- Sales, user management and global store administration remain super-admin only.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" = 'MAGASINIER'
  AND p."code" IN ('stores.read', 'products.read', 'inventory.read', 'inventory.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
