import { redirect } from "next/navigation";

// The dashboard was retired — its pipeline metrics now live at the top of the
// Veterans page. The app root just forwards there.
export default function Home() {
  redirect("/veterans");
}
