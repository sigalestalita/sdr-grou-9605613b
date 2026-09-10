import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/use-auth";

/** Todo mundo entra pela tela de boas-vindas (Início), com as métricas do seu papel. */
function Landing() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  return <Navigate to="/inicio" />;
}

export const Route = createFileRoute("/")({
  component: Landing,
});
