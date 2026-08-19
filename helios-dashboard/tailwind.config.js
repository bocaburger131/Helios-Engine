/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        "app-bg": "var(--bg-app)",
        "card-bg": "var(--bg-card)",
        "sidebar-bg": "var(--bg-sidebar)",
        "card-border": "var(--border-card)",
        "brand-blue": "var(--brand-blue)",
        "results-bg": "var(--results-sky-bg)",
        "results-border": "var(--results-sky-border)",
        "results-text": "var(--results-sky-text)",
        "process-bg": "var(--process-navy-bg)",
        "process-border": "var(--process-navy-border)",
        "process-text": "var(--process-navy-text)",
      },
    },
  },
  plugins: [],
};
