import { createFileRoute, redirect } from "@tanstack/react-router";

/** A importação da base de marketing virou uma aba da Migração do RD. */
export const Route = createFileRoute("/_app/importar-rd")({
  beforeLoad: () => {
    throw redirect({ to: "/migracao-rd", search: { aba: "marketing" } });
  },
});
