-- better-auth espera emailVerified como boolean; a coluna timestamp herdada do schema
-- inicial quebra o sign-up. Converte preservando o significado (data preenchida = verificado).
ALTER TABLE "users" ALTER COLUMN "email_verified" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "email_verified" SET DATA TYPE boolean USING ("email_verified" IS NOT NULL);
ALTER TABLE "users" ALTER COLUMN "email_verified" SET DEFAULT false;
ALTER TABLE "users" ALTER COLUMN "email_verified" SET NOT NULL;
