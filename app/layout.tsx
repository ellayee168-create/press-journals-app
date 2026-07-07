import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PRESS Journals — Submit Your Research",
  description: "Submit your research article to PRESS Journals, the peer-reviewed journal for high school researchers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}
