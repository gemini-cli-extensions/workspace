import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/workspace/',
  title: "Gemini Workspace Extension",
  description: "Documentation for the Google Workspace Server Extension",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Development', link: '/development' },
      { text: 'Release', link: '/release' }
    ],

    sidebar: [
      {
        text: 'Documentation',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Development Guide', link: '/development' },
          { text: 'Release Guide', link: '/release' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/gemini-cli-extensions/workspace' }
    ]
  }
})
