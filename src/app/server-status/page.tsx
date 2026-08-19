import { redirect } from "next/navigation";

export default function ServerStatusRedirect() {
  redirect("/ops/servers");
}
