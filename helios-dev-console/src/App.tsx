import { ThemeProvider } from "next-themes";
import Dashboard from "./components/Dashboard";

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Dashboard />
    </ThemeProvider>
  );
}
