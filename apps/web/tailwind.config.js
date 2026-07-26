/**
 * Tailwind CSS config for the Vite React app (`apps/web`).
 * `content` must include every file that uses Tailwind class names so production CSS is tree-shaken.
 * @see https://tailwindcss.com/docs/content-configuration
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {}
  },
  plugins: []
};
