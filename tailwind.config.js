export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Funnel Display"', 'sans-serif'],
      },
      colors: {
        navy: 'rgb(var(--navy-rgb) / <alpha-value>)',
        sage: 'rgb(var(--sage-rgb) / <alpha-value>)',
        cream: 'rgb(var(--cream-rgb) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
