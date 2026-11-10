import { redirect } from "next/navigation";

/** The Dashboard page was removed (F20, D94). Old links go to the launcher. */
export default function DashboardRedirect() {
  redirect("/boards");
}
