import HeliosAppShell from "@/components/shell/HeliosAppShell";

export default function HeliosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <HeliosAppShell>{children}</HeliosAppShell>;
}
