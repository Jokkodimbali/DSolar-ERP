-- Sales permissions are granted to existing administrators only.
-- Other roles must receive them through explicit role administration.
INSERT INTO "Permission" ("id", "code", "description")
VALUES
  (gen_random_uuid(), 'sales.read', 'Consulter les clients et les devis'),
  (gen_random_uuid(), 'sales.manage', 'Gérer les clients et les devis')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" = 'ADMIN'
  AND p."code" IN ('sales.read', 'sales.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
