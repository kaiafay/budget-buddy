import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Budget Buddy',
  description: 'A simple, beautiful budget calendar app',
  generator: 'v0.app',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#4f6bed',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180" type="image/png" />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
