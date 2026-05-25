import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/logout")({
  head: () => ({
    meta: [
      { title: "Logging out... · CIT Tracker" }
    ],
  }),
  component: LogoutPage,
});

function LogoutPage() {
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate({ to: "/" });
  }, [navigate]);

  return null;
}
