import { redirect } from "next/navigation";

// There is no login any more: visitors get an anonymous session automatically (lib/useSession.ts).
// Old links and bookmarks to /login go straight to the app.
export default function Login() {
  redirect("/");
}
