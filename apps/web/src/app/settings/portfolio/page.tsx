import { redirect } from "next/navigation";
import { auth } from "../../../auth/auth.js";
import { PortfolioCard } from "../../../components/settings/PortfolioCard.js";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPortfolioPage(
  props: PageProps,
): Promise<import("react").ReactElement> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const params = await props.searchParams;
  const status = typeof params["status"] === "string" ? params["status"] : undefined;
  const owner = typeof params["owner"] === "string" ? params["owner"] : undefined;

  return (
    <main
      id="main-content"
      style={{
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Portfolio</h1>
        <p style={{ margin: "0.5rem 0 0", color: "#555" }}>
          Save your passing solutions to a public GitHub repo. The work is yours, hosted on
          your account.
        </p>
      </header>
      <PortfolioCard
        {...(status !== undefined && { oauthStatus: status })}
        {...(owner !== undefined && { oauthOwner: owner })}
      />
    </main>
  );
}
