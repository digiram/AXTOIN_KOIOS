/**
 * PostCSS pipeline for `apps/web`: Tailwind emits utilities here; Autoprefixer adds vendor prefixes.
 * Loaded automatically by Vite when importing `./src/styles.css` which pulls in `@tailwind` layers.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
